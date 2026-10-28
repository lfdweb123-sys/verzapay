import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { adminDb } from "@/lib/firebase-admin";
import { checkRateLimit } from "@/lib/rate-limit";
import { protectText, unprotectText } from "@/lib/i18n-protect";

// Traduction FR → EN des textes de l'interface avec DeepL (offre gratuite possible).
// Chaque phrase n'est traduite qu'UNE fois : le résultat est mémorisé (Firestore) pour tous les visiteurs.
// Un plafond quotidien de caractères protège le quota gratuit.
const MAX_TEXTS = 60;
const MAX_CHARS_PER_TEXT = 400;
const DAILY_CHAR_LIMIT = Number(process.env.DEEPL_DAILY_CHAR_LIMIT) || 120_000;
const MONTHLY_CHAR_LIMIT = Number(process.env.DEEPL_MONTHLY_CHAR_LIMIT) || 450_000; // offre gratuite DeepL : 500 000 / mois

const hash = (text: string) => crypto.createHash("sha1").update(text).digest("hex");

export async function POST(req: NextRequest) {
  try {
    const key = process.env.DEEPL_API_KEY;
    if (!key) return NextResponse.json({ error: "Traduction non configurée" }, { status: 503 });

    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
    const limited = await checkRateLimit(`i18n:${ip}`, 60, 60);
    if (!limited.allowed) return NextResponse.json({ error: "Trop de requêtes" }, { status: 429 });

    const body = await req.json().catch(() => null);
    const texts: unknown = body?.texts;
    if (!Array.isArray(texts) || texts.length === 0 || texts.length > MAX_TEXTS) {
      return NextResponse.json({ error: "Requête invalide" }, { status: 400 });
    }
    const clean = texts.map((t) => (typeof t === "string" ? t.trim() : "")).map((t) => (t.length > MAX_CHARS_PER_TEXT ? "" : t));

    const db = adminDb();
    const col = db.collection("translations");
    const unique = Array.from(new Set(clean.filter(Boolean)));
    const result: Record<string, string> = {};

    // 1. Mémoire de traduction
    const refs = unique.map((t) => col.doc(hash(t)));
    const snaps = refs.length ? await db.getAll(...refs) : [];
    const missing: string[] = [];
    snaps.forEach((s, i) => {
      if (s.exists && typeof s.data()?.en === "string") result[unique[i]] = s.data()!.en;
      else missing.push(unique[i]);
    });

    // 2. DeepL pour le reste, dans la limite du plafond quotidien
    if (missing.length) {
      const chars = missing.reduce((n, t) => n + t.length, 0);
      const day = new Date().toISOString().slice(0, 10);
      const usageRef = db.collection("i18nUsage").doc(day);
      const monthRef = db.collection("i18nUsage").doc(`month-${day.slice(0, 7)}`);
      const allowed = await db.runTransaction(async (tx) => {
        const [daySnap, monthSnap] = await Promise.all([tx.get(usageRef), tx.get(monthRef)]);
        const used = Number(daySnap.data()?.chars ?? 0);
        const usedMonth = Number(monthSnap.data()?.chars ?? 0);
        if (used + chars > DAILY_CHAR_LIMIT || usedMonth + chars > MONTHLY_CHAR_LIMIT) return false;
        tx.set(usageRef, { chars: used + chars }, { merge: true });
        tx.set(monthRef, { chars: usedMonth + chars }, { merge: true });
        return true;
      });

      if (allowed) {
        const host = key.endsWith(":fx") ? "api-free.deepl.com" : "api.deepl.com";
        const res = await fetch(`https://${host}/v2/translate`, {
          method: "POST",
          headers: { Authorization: `DeepL-Auth-Key ${key}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            text: missing.map(protectText),
            source_lang: "FR",
            target_lang: "EN-GB",
            tag_handling: "xml",
            ignore_tags: ["x"],
          }),
          signal: AbortSignal.timeout(15_000),
        });
        if (res.ok) {
          const out: { translations: { text: string }[] } = await res.json();
          const batch = db.batch();
          out.translations.forEach((tr, i) => {
            const en = unprotectText(tr.text);
            result[missing[i]] = en;
            batch.set(col.doc(hash(missing[i])), { fr: missing[i], en, at: Date.now() });
          });
          await batch.commit();
        } else {
          console.error("DeepL error:", res.status);
        }
      }
    }

    return NextResponse.json({ translations: clean.map((t) => (t ? result[t] ?? null : null)) });
  } catch (err) {
    console.error("POST /api/i18n/translate:", err);
    return NextResponse.json({ error: "Une erreur est survenue" }, { status: 500 });
  }
}
