import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { adminDb } from "@/lib/firebase-admin";
import { notifyAdmin } from "@/lib/notify-admin";
import { checkRateLimit } from "@/lib/rate-limit";
import { parseOrThrow } from "@/lib/validation";
import { isSpamContact } from "@/lib/spam";

const bugReportSchema = z.object({
  uid: z.string().min(1).max(128),
  companyId: z.string().max(128).optional().nullable(),
  title: z.string().min(3).max(150),
  page: z.string().max(200).optional().nullable(),
  severity: z.enum(["low", "medium", "critical"]),
  description: z.string().min(10).max(4000),
  steps: z.string().max(3000).optional().nullable(),
  userAgent: z.string().max(400).optional().nullable(),
});

const SEVERITY_LABEL = { low: "Faible", medium: "Moyenne", critical: "Critique" } as const;
const escapeHtml = (s: string) => s.replace(/[<>&]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" }[c]!));

export async function POST(req: NextRequest) {
  try {
    const raw = await req.json();
    const body = parseOrThrow(bugReportSchema, raw);

    const limited = await checkRateLimit(`bug-report:uid:${body.uid}`, 5, 3600); // 5 signalements / heure
    if (!limited.allowed) {
      return NextResponse.json({ error: "Trop de signalements récents. Réessayez plus tard." }, { status: 429 });
    }

    const db = adminDb();
    const userSnap = await db.collection("users").doc(body.uid).get();
    if (!userSnap.exists) return NextResponse.json({ error: "Utilisateur introuvable" }, { status: 404 });
    const user = userSnap.data()!;

    // Signalement aléatoire : accepté silencieusement, non enregistré
    if (isSpamContact({ subject: body.title, message: body.description })) {
      return NextResponse.json({ ok: true });
    }

    const ref = db.collection("bugReports").doc();
    await ref.set({
      id: ref.id,
      uid: body.uid,
      userEmail: user.email ?? null,
      userName: user.displayName ?? null,
      companyId: body.companyId ?? null,
      title: body.title,
      page: body.page ?? null,
      severity: body.severity,
      description: body.description,
      steps: body.steps ?? null,
      userAgent: body.userAgent ?? null,
      status: "new",
      createdAt: Date.now(),
    });

    await notifyAdmin({
      title: `Bug signalé (${SEVERITY_LABEL[body.severity]}) — ${escapeHtml(body.title)}`,
      body: [
        `<strong>De :</strong> ${escapeHtml(String(user.displayName ?? "—"))} (${escapeHtml(String(user.email ?? "—"))})`,
        `<strong>Page :</strong> ${escapeHtml(body.page ?? "—")}`,
        `<strong>Gravité :</strong> ${SEVERITY_LABEL[body.severity]}`,
        `<br/>${escapeHtml(body.description).replace(/\n/g, "<br/>")}`,
        body.steps ? `<br/><strong>Étapes pour reproduire :</strong><br/>${escapeHtml(body.steps).replace(/\n/g, "<br/>")}` : "",
      ].join("<br/>"),
    }).catch((e) => console.error("notifyAdmin bug report:", e));

    return NextResponse.json({ ok: true, id: ref.id });
  } catch (err) {
    console.error("POST /api/bug-reports:", err);
    const message = err instanceof Error ? err.message : "Erreur serveur";
    const isValidationError = message.startsWith("Donnée invalide");
    return NextResponse.json({ error: isValidationError ? message : "Une erreur est survenue" }, { status: isValidationError ? 400 : 500 });
  }
}
