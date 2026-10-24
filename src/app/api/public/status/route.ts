import { NextResponse } from "next/server";
import { adminDb, adminAuth } from "@/lib/firebase-admin";
import { getJoonapayMisc } from "@/lib/joonapay";
import { probe, type Check, type Status } from "@/lib/status-probe";

// Route PUBLIQUE : état en temps réel des services. Ne renvoie que des états
// et des temps de réponse — aucun détail technique ni donnée utilisateur.
// Cache mémoire de 15 s pour qu'un afflux de visiteurs ne multiplie pas les sondes.

let cache: { at: number; payload: unknown } | null = null;
const TTL_MS = 15_000;

export async function GET() {
  if (cache && Date.now() - cache.at < TTL_MS) {
    return NextResponse.json(cache.payload, { headers: { "Cache-Control": "no-store" } });
  }

  const [database, auth, gateway, email] = await Promise.all([
    probe("database", "Base de données", "Stockage des comptes, paiements et soldes", async () => {
      await adminDb().collection("users").limit(1).select().get();
    }),
    probe("auth", "Authentification", "Connexion, inscription et codes de vérification", async () => {
      await (await adminAuth()).listUsers(1);
    }),
    probe("gateway", "Passerelle de paiement", "Encaissements et décaissements (Mobile Money, carte, virement)", async () => {
      const res = await getJoonapayMisc({ payment_enabled: true });
      if (!res?.data) throw new Error("réponse vide");
    }),
    probe("email", "Emails et notifications", "Codes de vérification, liens de paiement et alertes", async () => {
      const key = process.env.BREVO_API_KEY;
      if (!key) throw new Error("non configuré");
      const r = await fetch("https://api.brevo.com/v3/account", { headers: { "api-key": key }, cache: "no-store" });
      if (!r.ok) throw new Error(String(r.status));
    }),
  ]);

  const site: Check = {
    id: "site", name: "Site web", description: "Pages publiques et tableau de bord",
    status: "operational", latencyMs: 0,
  };

  // L'API dépend de la base de données et de la passerelle de paiement
  const rank = { operational: 0, degraded: 1, outage: 2 } as const;
  const apiStatus: Status = rank[database.status] >= rank[gateway.status] ? database.status : gateway.status;
  const api: Check = {
    id: "api", name: "API Verzapay", description: "Création de paiements et décaissements, webhooks",
    status: apiStatus, latencyMs: Math.max(database.latencyMs ?? 0, gateway.latencyMs ?? 0) || null,
  };

  const components = [site, api, database, auth, gateway, email];
  const worst = components.reduce<Status>((acc, c) => (rank[c.status] > rank[acc] ? c.status : acc), "operational");
  const outages = components.filter((c) => c.status === "outage").length;
  const overall: Status = outages >= 2 ? "outage" : worst;

  // Historique réel : une vérification enregistrée par minute (quel que soit le nombre de visiteurs),
  // pour que les barres reflètent l'état passé du service et pas seulement la visite en cours.
  const now = Date.now();
  const bucket = Math.floor(now / 60_000);
  let history: { at: number; overall: Status; c: Record<string, Status> }[] = [];
  try {
    const db = adminDb();
    const col = db.collection("statusChecks");
    await col.doc(String(bucket)).create({
      at: now, overall, c: Object.fromEntries(components.map((c) => [c.id, c.status])),
    }).catch(() => undefined); // déjà enregistrée pour cette minute
    const snap = await col.orderBy("at", "desc").limit(60).get();
    history = snap.docs.map((d) => d.data() as { at: number; overall: Status; c: Record<string, Status> }).reverse();
  } catch {
    history = [];
  }

  const payload = { updatedAt: now, overall, components, history };
  cache = { at: now, payload };
  return NextResponse.json(payload, { headers: { "Cache-Control": "no-store" } });
}
