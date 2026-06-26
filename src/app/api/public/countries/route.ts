import { NextResponse } from "next/server";
import { getJoonapayMisc } from "@/lib/joonapay";

// Route PUBLIQUE (pas d'auth, pas d'uid) — consommée par la page /docs pour
// afficher la liste des pays/méthodes en temps réel. Ne jamais exposer
// JOONAPAY_PROXY_URL / PROXY_SECRET ici : on ne renvoie qu'un résumé minimal.

// Petit cache mémoire (best-effort, par instance serverless) pour éviter de
// re-appeler JoonaPay à chaque chargement de la page docs. Les instances
// Vercel sont éphémères donc ce n'est pas un cache distribué — juste de
// l'allègement de charge entre requêtes rapprochées sur une même instance.
let cache: { payload: unknown; expiresAt: number } | null = null;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

export async function GET() {
  try {
    if (cache && cache.expiresAt > Date.now()) {
      return NextResponse.json(cache.payload);
    }

    // On ne filtre pas côté requête JoonaPay (cf. note CARD vs CREDIT_CARD
    // dans lib/joonapay.ts) : on récupère tout ce qui est payment_enabled OU
    // transfer_enabled, puis on reconstruit nous-mêmes le résumé par pays.
    const [paymentRes, transferRes] = await Promise.all([
      getJoonapayMisc({ payment_enabled: true }),
      getJoonapayMisc({ transfer_enabled: true }),
    ]);

    const countriesByUuid = new Map<
      string,
      {
        uuid: string;
        code: string;
        name: string;
        indicator: string;
        currency: string;
        paymentEnabled: boolean;
        transferEnabled: boolean;
        channels: Set<string>;
      }
    >();

    function ingest(misc: typeof paymentRes, markTransfer: boolean) {
      for (const country of misc.data?.countries ?? []) {
        const existing = countriesByUuid.get(country.uuid);
        if (existing) {
          existing.paymentEnabled = existing.paymentEnabled || country.payment_enabled;
          existing.transferEnabled = existing.transferEnabled || country.transfer_enabled;
        } else {
          countriesByUuid.set(country.uuid, {
            uuid: country.uuid,
            code: country.code,
            name: country.name,
            indicator: country.indicator,
            currency: country.currency,
            paymentEnabled: country.payment_enabled,
            transferEnabled: country.transfer_enabled,
            channels: new Set<string>(),
          });
        }
      }

      for (const method of misc.data?.payment_methods ?? []) {
        const entry = countriesByUuid.get(method.country.uuid);
        if (!entry) continue;
        // Mode paiement : on liste les channels actifs en payment_status.
        // Mode transfert : on ne s'en sert que pour transferEnabled (déjà
        // capturé via country.transfer_enabled ci-dessus), pas pour les
        // channels affichés au paiement, pour ne pas mélanger payin/payout.
        if (!markTransfer && method.payment_status === "active") {
          entry.channels.add(method.channel);
        }
      }
    }

    ingest(paymentRes, false);
    ingest(transferRes, true);

    const countries = Array.from(countriesByUuid.values())
      .filter((c) => c.paymentEnabled || c.transferEnabled)
      .map((c) => ({
        code: c.code,
        name: c.name,
        indicator: c.indicator,
        currency: c.currency,
        paymentEnabled: c.paymentEnabled,
        transferEnabled: c.transferEnabled,
        channels: Array.from(c.channels),
      }))
      .sort((a, b) => a.name.localeCompare(b.name, "fr"));

    const payload = {
      countries,
      updatedAt: new Date().toISOString(),
    };

    cache = { payload, expiresAt: Date.now() + CACHE_TTL_MS };

    return NextResponse.json(payload);
  } catch (err) {
    console.error("GET /api/public/countries:", err);
    return NextResponse.json(
      { error: "Impossible de charger la liste des pays pour le moment." },
      { status: 502 }
    );
  }
}