// Captcha "calcul" sans état : le serveur signe (HMAC) la réponse attendue
// et une date d'expiration dans un jeton ; le client renvoie le jeton + sa réponse.
import crypto from "crypto";

const TTL_MS = 15 * 60 * 1000;

function getSecret(): string | null {
  return process.env.CAPTCHA_SECRET || process.env.CRON_RECONCILE_SECRET || null;
}

function sign(payload: string, secret: string): string {
  return crypto.createHmac("sha256", secret).update(payload).digest("hex");
}

export function createCaptchaChallenge(): { question: string; token: string } | null {
  const secret = getSecret();
  if (!secret) return null;
  const a = crypto.randomInt(2, 10);
  const b = crypto.randomInt(2, 10);
  const useMinus = crypto.randomInt(0, 2) === 1 && a > b;
  const answer = useMinus ? a - b : a + b;
  const exp = Date.now() + TTL_MS;
  const payload = `${answer}.${exp}`;
  const token = Buffer.from(`${payload}.${sign(payload, secret)}`).toString("base64url");
  return { question: `${a} ${useMinus ? "−" : "+"} ${b} = ?`, token };
}

export function verifyCaptcha(token: string | null | undefined, answer: string | number | null | undefined): boolean {
  const secret = getSecret();
  if (!secret) {
    console.warn("[captcha] CAPTCHA_SECRET / CRON_RECONCILE_SECRET manquant : captcha non appliqué");
    return true;
  }
  if (!token || answer === null || answer === undefined || String(answer).trim() === "") return false;
  try {
    const decoded = Buffer.from(token, "base64url").toString("utf8");
    const [ans, exp, sig] = decoded.split(".");
    const payload = `${ans}.${exp}`;
    const expected = sign(payload, secret);
    if (sig.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return false;
    if (Date.now() > Number(exp)) return false;
    return Number(String(answer).trim()) === Number(ans);
  } catch {
    return false;
  }
}
