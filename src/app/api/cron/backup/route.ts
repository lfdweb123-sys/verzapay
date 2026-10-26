// app/api/cron/backup/route.ts
// Sauvegarde automatique CHIFFRÉE de la base, déposée dans un stockage externe (jamais dans la base).
// À déclencher une fois par jour via cron-job.org :
//   GET https://<domaine>/api/cron/backup   en-tête  x-cron-secret: <CRON_RECONCILE_SECRET>
// Variables : BACKUP_S3_ENDPOINT, BACKUP_S3_BUCKET, BACKUP_S3_ACCESS_KEY_ID, BACKUP_S3_SECRET_ACCESS_KEY,
//             BACKUP_ENCRYPTION_KEY (64 car. hex), optionnelles : BACKUP_S3_REGION, BACKUP_RETENTION_DAYS (30)
import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { exportDatabase, encryptBackup, uploadBackup, pruneBackups, s3ConfigFromEnv, type DbLike } from "@/lib/backup";
import { notifyAdmin } from "@/lib/notify-admin";

export const maxDuration = 300;
const LOG = "[Backup]";

function authorized(req: NextRequest): boolean {
  const secret = process.env.CRON_RECONCILE_SECRET;
  if (!secret) return false;
  return req.headers.get("x-cron-secret") === secret || req.nextUrl.searchParams.get("secret") === secret;
}

export async function GET(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { config, missing } = s3ConfigFromEnv();
  if (!config) return NextResponse.json({ error: "Sauvegarde non configurée", missing }, { status: 503 });

  try {
    const started = Date.now();
    const { ndjson, docs, collections } = await exportDatabase(adminDb() as unknown as DbLike);
    const blob = encryptBackup(Buffer.from(ndjson, "utf8"), process.env.BACKUP_ENCRYPTION_KEY!);

    const d = new Date();
    const pad = (n: number) => String(n).padStart(2, "0");
    const key = `verzapay/${d.getUTCFullYear()}/${pad(d.getUTCMonth() + 1)}/backup-${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}-${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}.vpzb`;
    await uploadBackup(config, key, blob);

    let pruned = 0;
    try { pruned = await pruneBackups(config, "verzapay/", Number(process.env.BACKUP_RETENTION_DAYS) || 30); }
    catch (e) { console.error(`${LOG} nettoyage des anciennes sauvegardes impossible:`, (e as Error).message); }

    const result = { ok: true, key, documents: docs, collections, sizeBytes: blob.length, prunedOldBackups: pruned, durationMs: Date.now() - started };
    console.log(LOG, result);
    return NextResponse.json(result);
  } catch (err) {
    console.error(`${LOG} échec:`, err);
    await notifyAdmin({ title: "Échec de la sauvegarde automatique", body: `La sauvegarde chiffrée a échoué : ${(err as Error).message.replace(/[<>&]/g, "")}` }).catch(() => undefined);
    return NextResponse.json({ error: "Échec de la sauvegarde" }, { status: 500 });
  }
}
