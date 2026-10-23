// app/api/cron/verify-accounts/route.ts
// Vérification automatique des comptes par code à 6 chiffres.
//
// À déclencher une fois par jour via cron-job.org :
//   GET https://<domaine>/api/cron/verify-accounts
//   en-tête  x-cron-secret: <CRON_RECONCILE_SECRET>   (ou ?secret=...)
//   Ajouter &dryRun=1 pour voir ce qui serait fait sans rien envoyer ni supprimer.
//
// Pour chaque compte dont l'email n'a jamais été prouvé (emailCodeVerified absent) :
//  1. un code à 6 chiffres lui est envoyé, valable VERIFY_GRACE_DAYS jours (7 par défaut) ;
//     le compte reçoit une échéance (verifyDeadline) ;
//  2. si l'échéance est dépassée sans saisie du code (y compris quand l'envoi
//     a échoué, adresse invalide), le compte est supprimé définitivement.
// Jamais supprimés : administrateurs, comptes avec solde > 0 ou KYC approuvé,
// comptes créés depuis moins d'une heure.
import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { hashSecret, generateSixDigitCode } from "@/lib/crypto-utils";
import { sendTransactionalEmail, emailTemplate } from "@/lib/brevo";
import { hardDeleteUser } from "@/lib/user-admin";
import { isSpamAccount } from "@/lib/spam";

const LOG_PREFIX = "[VerifyAccounts]";
const DAY_MS = 24 * 60 * 60 * 1000;
const GRACE_DAYS = Number(process.env.VERIFY_GRACE_DAYS) || 7;
const MAX_SENDS_PER_RUN = 100;
const MAX_DELETES_PER_RUN = 100;
const MIN_ACCOUNT_AGE_MS = 60 * 60 * 1000;

function isAuthorized(req: NextRequest): boolean {
  const secret = process.env.CRON_RECONCILE_SECRET;
  if (!secret) {
    console.error(`${LOG_PREFIX} CRON_RECONCILE_SECRET manquant`);
    return false;
  }
  return req.headers.get("x-cron-secret") === secret || req.nextUrl.searchParams.get("secret") === secret;
}

function createdAtMs(v: unknown): number {
  if (typeof v === "number") return v;
  const ts = v as { toMillis?: () => number } | null;
  return typeof ts?.toMillis === "function" ? ts.toMillis() : 0;
}

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const dryRun = req.nextUrl.searchParams.get("dryRun") === "1";

  try {
    const db = adminDb();
    const now = Date.now();
    const stats = { scanned: 0, unverified: 0, codesSent: 0, sendFailures: 0, deleted: 0, protectedSkipped: 0, dryRun };

    // Parcours par pages de 300 (aucun index requis : tri sur l'identifiant)
    let last: FirebaseFirestore.QueryDocumentSnapshot | undefined;
    for (;;) {
      let q = db.collection("users").orderBy("__name__").limit(300);
      if (last) q = q.startAfter(last);
      const page = await q.get();
      if (page.empty) break;
      last = page.docs[page.docs.length - 1];

      for (const doc of page.docs) {
        stats.scanned++;
        const u = doc.data();
        if (u.emailCodeVerified === true || u.isAdmin || u.deleted) continue;
        if (now - createdAtMs(u.createdAt) < MIN_ACCOUNT_AGE_MS) continue;
        stats.unverified++;

        // Comptes évidemment fictifs (nom aléatoire) : suppression immédiate, sans délai
        const overdue = isSpamAccount({ displayName: u.displayName, email: u.email }) ||
          (typeof u.verifyDeadline === "number" && u.verifyDeadline < now);

        // 2. Échéance dépassée → suppression
        if (overdue) {
          if (stats.deleted >= MAX_DELETES_PER_RUN) continue;
          if (dryRun) { stats.deleted++; continue; }
          const res = await hardDeleteUser(doc.id);
          if (res.deleted) stats.deleted++; else stats.protectedSkipped++;
          continue;
        }

        // 1. Pas encore sollicité → envoi du code
        if (typeof u.verifyDeadline !== "number") {
          if (stats.codesSent + stats.sendFailures >= MAX_SENDS_PER_RUN) continue;
          if (dryRun) { stats.codesSent++; continue; }

          const deadline = now + GRACE_DAYS * DAY_MS;
          const code = generateSixDigitCode();
          try {
            if (!u.email || String(u.email).startsWith("[supprimé]")) throw new Error("email invalide");
            await sendTransactionalEmail({
              to: [{ email: u.email, name: u.displayName ?? undefined }],
              subject: `${code} — Vérifiez votre compte Verzapay`,
              htmlContent: emailTemplate({
                title: "Vérification de votre compte",
                body: `Votre code de vérification : <strong style="font-size:24px; letter-spacing:4px;">${code}</strong><br/><br/>Connectez-vous à Verzapay et saisissez ce code quand il vous est demandé. Il reste valable ${GRACE_DAYS} jours. <strong>Sans vérification avant cette date, votre compte sera supprimé automatiquement.</strong>`,
                ctaLabel: "Se connecter",
                ctaUrl: `${process.env.NEXT_PUBLIC_APP_URL}/login`,
              }),
            });
            await db.collection("twoFactorCodes").doc(doc.id).set({
              uid: doc.id, codeHash: hashSecret(code), expiresAt: deadline, attempts: 0, createdAt: now, source: "cron",
            });
            await doc.ref.update({ verifyRequestedAt: now, verifyDeadline: deadline });
            stats.codesSent++;
          } catch (sendErr) {
            // Code non reçu / non envoyable : l'échéance démarre quand même. Sans
            // vérification avant cette date (le compte peut encore recevoir un code à
            // la connexion), il est supprimé. Pas de suppression immédiate : un échec
            // d'envoi peut être temporaire (panne ou quota du service d'email).
            console.error(`${LOG_PREFIX} envoi impossible pour ${doc.id}:`, sendErr);
            stats.sendFailures++;
            await doc.ref.update({ verifyRequestedAt: now, verifyDeadline: deadline });
          }
        }
      }
      if (page.size < 300) break;
    }

    console.log(`${LOG_PREFIX}`, stats);
    return NextResponse.json({ ok: true, ...stats });
  } catch (err) {
    console.error(`${LOG_PREFIX} Erreur:`, err);
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
