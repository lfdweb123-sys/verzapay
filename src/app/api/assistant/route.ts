import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { checkRateLimit } from "@/lib/rate-limit";
import { ASSISTANT_SYSTEM_PROMPT, redactSecrets } from "@/lib/assistant-knowledge";

// Assistant d'aide (IA). Fournisseur COMPATIBLE OpenAI, au choix, avec une offre gratuite :
//   Google Gemini : AI_BASE_URL=https://generativelanguage.googleapis.com/v1beta/openai
//   Groq          : AI_BASE_URL=https://api.groq.com/openai/v1
//   OpenRouter    : AI_BASE_URL=https://openrouter.ai/api/v1  (modèles « :free »)
// + AI_API_KEY et AI_MODEL (nom exact d'un modèle gratuit du fournisseur choisi).
const MAX_MESSAGES = 8;
const MAX_CHARS = 1000;
const DAILY_LIMIT = Number(process.env.AI_DAILY_LIMIT) || 800; // protège le quota gratuit

export async function POST(req: NextRequest) {
  try {
    const AI_BASE_URL = process.env.AI_BASE_URL?.trim();
    const AI_API_KEY = process.env.AI_API_KEY?.trim();
    // « Gemini 2.5 Flash » (nom affiché) => « gemini-2.5-flash » (identifiant attendu par l'API)
    const AI_MODEL = process.env.AI_MODEL?.trim().toLowerCase().replace(/^models\//, "").replace(/\s+/g, "-");
    if (!AI_BASE_URL || !AI_API_KEY || !AI_MODEL) {
      return NextResponse.json({ error: "Assistant non configuré" }, { status: 503 });
    }

    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
    const limited = await checkRateLimit(`assistant:${ip}`, 12, 60);
    if (!limited.allowed) return NextResponse.json({ error: "Trop de messages. Patientez une minute." }, { status: 429 });

    const body = await req.json().catch(() => null);
    const raw: unknown = body?.messages;
    if (!Array.isArray(raw) || raw.length === 0 || raw.length > MAX_MESSAGES) return NextResponse.json({ error: "Requête invalide" }, { status: 400 });
    const messages = raw.map((m) => ({
      role: m?.role === "assistant" ? "assistant" : "user",
      content: redactSecrets(String(m?.content ?? "").slice(0, MAX_CHARS)),
    }));
    if (messages[messages.length - 1].role !== "user" || !messages[messages.length - 1].content.trim()) return NextResponse.json({ error: "Requête invalide" }, { status: 400 });

    // Plafond quotidien global
    const day = new Date().toISOString().slice(0, 10);
    const ref = adminDb().collection("i18nUsage").doc(`assistant-${day}`);
    const allowed = await adminDb().runTransaction(async (tx) => {
      const used = Number((await tx.get(ref)).data()?.requests ?? 0);
      if (used >= DAILY_LIMIT) return false;
      tx.set(ref, { requests: used + 1 }, { merge: true });
      return true;
    });
    if (!allowed) return NextResponse.json({ error: "L'assistant est très sollicité aujourd'hui. Contactez-nous sur WhatsApp." }, { status: 429 });

    const res = await fetch(`${AI_BASE_URL.replace(/\/+$/, "")}/chat/completions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${AI_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: AI_MODEL,
        messages: [{ role: "system", content: ASSISTANT_SYSTEM_PROMPT }, ...messages],
        temperature: 0.3,
        max_tokens: 1024,
        // Gemini 2.5 : sans cela, la « réflexion » consomme le budget de réponse
        ...(AI_BASE_URL.includes("generativelanguage") && AI_MODEL.includes("2.5") ? { reasoning_effort: "none" } : {}),
      }),
      signal: AbortSignal.timeout(25_000),
    });
    if (!res.ok) {
      console.error("assistant provider error:", res.status, (await res.text().catch(() => "")).slice(0, 400));
      return NextResponse.json({ error: "L'assistant est momentanément indisponible." }, { status: 502 });
    }
    const data = await res.json();
    const reply: string | undefined = data?.choices?.[0]?.message?.content;
    if (!reply) return NextResponse.json({ error: "Réponse vide" }, { status: 502 });
    return NextResponse.json({ reply: reply.trim() });
  } catch (err) {
    console.error("POST /api/assistant:", err);
    return NextResponse.json({ error: "Une erreur est survenue" }, { status: 500 });
  }
}
