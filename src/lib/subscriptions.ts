export type Interval = "weekly" | "monthly" | "yearly";

/** Prochaine échéance (UTC). Mensuel/annuel : le jour est conservé, ramené en fin de mois si besoin (31 → 30/28). */
export function addInterval(ts: number, interval: Interval): number {
  const d = new Date(ts);
  if (interval === "weekly") return ts + 7 * 24 * 3600 * 1000;
  const day = d.getUTCDate();
  const months = interval === "monthly" ? 1 : 12;
  const target = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + months, 1, d.getUTCHours(), d.getUTCMinutes(), d.getUTCSeconds()));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(day, lastDay));
  return target.getTime();
}

/** Avance l'échéance jusqu'à ce qu'elle soit dans le futur (une seule facture, pas de rattrapage multiple). */
export function nextFutureRun(from: number, interval: Interval, now: number): number {
  let next = addInterval(from, interval);
  let guard = 0;
  while (next <= now && guard++ < 1000) next = addInterval(next, interval);
  return next;
}
