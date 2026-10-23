import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { adminDb } from "@/lib/firebase-admin";
import { parseOrThrow } from "@/lib/validation";
import { checkRateLimit } from "@/lib/rate-limit";
import { assertSafeWebhookUrl, UnsafeUrlError } from "@/lib/safe-url";
import { verifyRequestUid } from "@/lib/auth-token";

const schema = z.object({ uid: z.string().min(1).max(128), companyId: z.string().min(1).max(128) });

// Envoie un événement "payment.completed" de TEST à l'URL de webhook enregistrée
// et renvoie la réponse du serveur du marchand. Aucun paiement ni solde concerné.
export async function POST(req: NextRequest) {
  try {
    const { uid, companyId } = parseOrThrow(schema, await req.json());
    if (!(await verifyRequestUid(uid))) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }


    const limited = await checkRateLimit(`webhook-test:${companyId}`, 10, 60);
    if (!limited.allowed) {
      return NextResponse.json({ error: "Trop de tests. Réessayez dans une minute." }, { status: 429 });
    }

    const db = adminDb();
    const companySnap = await db.collection("companies").doc(companyId).get();
    const company = companySnap.data();
    if (!companySnap.exists || !Array.isArray(company?.members) || !company.members.includes(uid)) {
      return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
    }

    const webhookUrl: string | undefined = company.webhookUrl;
    if (!webhookUrl) {
      return NextResponse.json({ error: "Aucune URL de webhook enregistrée. Sauvegardez d'abord votre URL." }, { status: 400 });
    }

    try {
      await assertSafeWebhookUrl(webhookUrl);
    } catch (err) {
      const msg = err instanceof UnsafeUrlError ? err.message : "URL invalide";
      return NextResponse.json({ error: `URL de webhook refusée : ${msg}` }, { status: 400 });
    }

    const payload = {
      type: "payment.completed",
      test: true,
      paymentId: `test_${Date.now().toString(36)}`,
      merchantReference: "TEST-VERZAPAY",
      amount: 1000,
      currency: "XOF",
      status: "completed",
      customerName: "Client Test",
      customerPhone: "+22900000000",
      companyId,
      createdAt: Date.now(),
    };

    const started = Date.now();
    let responseStatus: number | null = null;
    let snippet = "";
    let networkError: string | null = null;

    try {
      const res = await fetch(webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json", "User-Agent": "Verzapay-Webhook-Test/1.0" },
        body: JSON.stringify(payload),
        redirect: "manual",
        signal: AbortSignal.timeout(8000),
      });
      responseStatus = res.status;
      snippet = (await res.text()).slice(0, 300);
    } catch (err) {
      networkError = (err as Error).name === "TimeoutError" ? "Délai dépassé (8 s)" : "Impossible de joindre l'URL";
    }

    const durationMs = Date.now() - started;
    const success = responseStatus !== null && responseStatus >= 200 && responseStatus < 300;

    await db.collection("companies").doc(companyId).collection("webhookLogs").add({
      type: payload.type, test: true, paymentId: payload.paymentId, amount: payload.amount, status: payload.status,
      sentAt: Date.now(), responseStatus, success, payload,
    }).catch(() => undefined);

    return NextResponse.json({ ok: success, responseStatus, durationMs, snippet, error: networkError });
  } catch (err) {
    console.error("POST /api/webhooks/test:", err);
    const message = err instanceof Error ? err.message : "Erreur serveur";
    const isValidationError = message.startsWith("Donnée invalide");
    return NextResponse.json({ error: isValidationError ? message : "Une erreur est survenue" }, { status: isValidationError ? 400 : 500 });
  }
}
