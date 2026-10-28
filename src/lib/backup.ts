import crypto from "crypto";
import zlib from "zlib";
import { AwsClient } from "aws4fetch";

// Sauvegarde externe chiffrée : export NDJSON de la base → gzip → AES-256-GCM → dépôt dans un stockage
// compatible S3 (Cloudflare R2, Backblaze B2, AWS S3...) HORS de la base de données.

const MAGIC = Buffer.from("VPZB1");

// Collections sans intérêt (techniques, regénérables) ou sensibles inutiles à restaurer (codes 2FA, sessions).
const EXCLUDED = new Set(["rateLimits", "statusChecks", "statusMeta", "translations", "i18nUsage", "twoFactorCodes", "checkoutSessions", "notifications"]);
// Collections dont les documents ont des sous-collections à sauvegarder.
const WITH_SUBCOLLECTIONS = new Set(["companies", "disputes"]);

export function serializeValue(value: unknown): unknown {
  if (value === null || typeof value !== "object") return value;
  const v = value as { toMillis?: () => number; path?: string; latitude?: number; longitude?: number };
  if (typeof v.toMillis === "function") return { __type: "timestamp", ms: v.toMillis() };
  if (typeof v.path === "string") return { __type: "ref", path: v.path };
  if (typeof v.latitude === "number" && typeof v.longitude === "number") return { __type: "geopoint", lat: v.latitude, lng: v.longitude };
  if (Array.isArray(value)) return value.map(serializeValue);
  return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([k, x]) => [k, serializeValue(x)]));
}

interface DocLike { id: string; ref: { path: string; listCollections: () => Promise<CollLike[]> }; data: () => unknown }
interface CollLike { id: string; get: () => Promise<{ docs: DocLike[] }> }
export interface DbLike { listCollections: () => Promise<CollLike[]> }

/** Exporte toute la base (hors exclusions) en lignes NDJSON { path, data }. */
export async function exportDatabase(db: DbLike): Promise<{ ndjson: string; docs: number; collections: string[] }> {
  const lines: string[] = [];
  const collections: string[] = [];
  let docs = 0;

  async function walk(col: CollLike, recurse: boolean) {
    const snap = await col.get();
    for (const d of snap.docs) {
      lines.push(JSON.stringify({ path: d.ref.path, data: serializeValue(d.data()) }));
      docs++;
      if (recurse) for (const sub of await d.ref.listCollections()) await walk(sub, false);
    }
  }

  for (const col of await db.listCollections()) {
    if (EXCLUDED.has(col.id)) continue;
    collections.push(col.id);
    await walk(col, WITH_SUBCOLLECTIONS.has(col.id));
  }
  return { ndjson: lines.join("\n"), docs, collections };
}

function keyFromHex(hex: string): Buffer {
  if (!/^[0-9a-fA-F]{64}$/.test(hex)) throw new Error("BACKUP_ENCRYPTION_KEY doit contenir 64 caractères hexadécimaux (32 octets)");
  return Buffer.from(hex, "hex");
}

export function encryptBackup(plain: Buffer, keyHex: string): Buffer {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", keyFromHex(keyHex), iv);
  const enc = Buffer.concat([cipher.update(zlib.gzipSync(plain, { level: 9 })), cipher.final()]);
  return Buffer.concat([MAGIC, iv, cipher.getAuthTag(), enc]);
}

export function decryptBackup(blob: Buffer, keyHex: string): Buffer {
  if (!blob.subarray(0, 5).equals(MAGIC)) throw new Error("Format de sauvegarde inconnu");
  const iv = blob.subarray(5, 17);
  const tag = blob.subarray(17, 33);
  const decipher = crypto.createDecipheriv("aes-256-gcm", keyFromHex(keyHex), iv);
  decipher.setAuthTag(tag);
  return zlib.gunzipSync(Buffer.concat([decipher.update(blob.subarray(33)), decipher.final()]));
}

export interface S3Config { endpoint: string; bucket: string; accessKeyId: string; secretAccessKey: string; region: string }

/** Endpoint sans espace, sans "/" final ni nom de bucket collé à la fin (erreur fréquente : signature invalide). */
export function normalizeEndpoint(raw: string, bucket: string): string {
  let url = raw.trim().replace(/\/+$/, "");
  const suffix = `/${bucket}`;
  if (url.toLowerCase().endsWith(suffix.toLowerCase())) url = url.slice(0, -suffix.length);
  return url;
}

export function s3ConfigFromEnv(): { config: S3Config | null; missing: string[] } {
  // .trim() : une espace ou un retour à la ligne collé dans la valeur (Vercel) invalide la signature => 401/403
  const e = Object.fromEntries(Object.entries(process.env).map(([k, v]) => [k, typeof v === "string" ? v.trim() : v]));
  const missing = ["BACKUP_S3_ENDPOINT", "BACKUP_S3_BUCKET", "BACKUP_S3_ACCESS_KEY_ID", "BACKUP_S3_SECRET_ACCESS_KEY", "BACKUP_ENCRYPTION_KEY"].filter((k) => !e[k]);
  if (missing.length) return { config: null, missing };
  return {
    config: {
      endpoint: normalizeEndpoint(e.BACKUP_S3_ENDPOINT!, e.BACKUP_S3_BUCKET!),
      bucket: e.BACKUP_S3_BUCKET!,
      accessKeyId: e.BACKUP_S3_ACCESS_KEY_ID!,
      secretAccessKey: e.BACKUP_S3_SECRET_ACCESS_KEY!,
      region: e.BACKUP_S3_REGION || "auto",
    },
    missing: [],
  };
}

/** Message d'erreur lisible à partir de la réponse du stockage (jamais de secret dedans). */
export function describeS3Error(status: number, body: string): string {
  const code = /<Code>([\s\S]*?)<\/Code>/.exec(body)?.[1] ?? "";
  const message = /<Message>([\s\S]*?)<\/Message>/.exec(body)?.[1] ?? body.slice(0, 160);
  const hints: Record<string, string> = {
    InvalidAccessKeyId: "BACKUP_S3_ACCESS_KEY_ID inconnu : utilisez la clé d'accès S3 (R2 > Gérer les jetons API R2), pas un jeton API Cloudflare.",
    SignatureDoesNotMatch: "Signature refusée : vérifiez BACKUP_S3_SECRET_ACCESS_KEY (sans espace) et que BACKUP_S3_ENDPOINT ne contient pas le nom du bucket.",
    AccessDenied: "Accès refusé : le jeton doit avoir le droit « Lecture et écriture » sur CE bucket.",
    NoSuchBucket: "Bucket introuvable : vérifiez BACKUP_S3_BUCKET et la juridiction (EU) de l'endpoint.",
  };
  const hint = hints[code] ?? (status === 401 || status === 403
    ? "Identifiants refusés : vérifiez BACKUP_S3_ACCESS_KEY_ID / BACKUP_S3_SECRET_ACCESS_KEY (clés S3 du stockage, pas un jeton API), sans espace, et l'endpoint."
    : "");
  return `Dépôt refusé (${status}${code ? ` ${code}` : ""}) : ${message}${hint ? ` — ${hint}` : ""}`;
}

const client = (c: S3Config) => new AwsClient({ accessKeyId: c.accessKeyId, secretAccessKey: c.secretAccessKey, service: "s3", region: c.region });

export async function uploadBackup(c: S3Config, key: string, body: Buffer): Promise<void> {
  const res = await client(c).fetch(`${c.endpoint}/${c.bucket}/${key}`, {
    method: "PUT", body: new Uint8Array(body), headers: { "Content-Type": "application/octet-stream" }, signal: AbortSignal.timeout(120_000),
  });
  if (!res.ok) throw new Error(describeS3Error(res.status, await res.text().catch(() => "")));
}

/** Supprime les sauvegardes plus anciennes que `days` jours dans le préfixe donné. */
export async function pruneBackups(c: S3Config, prefix: string, days: number, now = Date.now()): Promise<number> {
  const aws = client(c);
  const list = await aws.fetch(`${c.endpoint}/${c.bucket}?list-type=2&prefix=${encodeURIComponent(prefix)}`, { signal: AbortSignal.timeout(30_000) });
  if (!list.ok) throw new Error(describeS3Error(list.status, await list.text().catch(() => "")));
  const xml = await list.text();
  const items = Array.from(xml.matchAll(/<Contents>([\s\S]*?)<\/Contents>/g)).map((m) => ({
    key: /<Key>([\s\S]*?)<\/Key>/.exec(m[1])?.[1] ?? "",
    modified: Date.parse(/<LastModified>([\s\S]*?)<\/LastModified>/.exec(m[1])?.[1] ?? ""),
  }));
  const old = items.filter((i) => i.key.endsWith(".vpzb") && Number.isFinite(i.modified) && now - i.modified > days * 86_400_000);
  for (const i of old) await aws.fetch(`${c.endpoint}/${c.bucket}/${i.key}`, { method: "DELETE", signal: AbortSignal.timeout(30_000) });
  return old.length;
}
