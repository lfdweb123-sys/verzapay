import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { adminDb } from "@/lib/firebase-admin";
import { verifyRequestUid } from "@/lib/auth-token";
import { parseOrThrow } from "@/lib/validation";
import { checkRateLimit } from "@/lib/rate-limit";
import { buildStatementXlsx, buildStatementPdf, type StatementData } from "@/lib/statement-export";

export const maxDuration = 60;

const schema = z.object({
  uid: z.string().min(1).max(128),
  companyId: z.string().min(1).max(128),
  type: z.enum(["transactions", "payouts", "ledger"]),
  format: z.enum(["pdf", "xlsx"]),
  from: z.coerce.number().optional(),
  to: z.coerce.number().optional(),
});

const MAX_ROWS = 5000;
const STATUS_FR: Record<string, string> = { completed: "Complété", pending: "En attente", failed: "Échoué", rejected: "Rejeté", processing: "En cours", cancelled: "Annulé" };
const METHOD_FR: Record<string, string> = { mobile_money: "Mobile Money", card: "Carte bancaire", bank_transfer: "Virement bancaire" };
const fmtDate = (ts: number) => new Date(ts).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" });

// Relevé exportable (PDF ou Excel) des transactions, décaissements ou du journal comptable d'une entreprise.
export async function POST(req: NextRequest) {
  try {
    const input = parseOrThrow(schema, await req.json());
    if (!(await verifyRequestUid(input.uid))) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });

    const limited = await checkRateLimit(`export:${input.uid}`, 20, 600);
    if (!limited.allowed) return NextResponse.json({ error: "Trop d'exports. Réessayez dans quelques minutes." }, { status: 429 });

    const db = adminDb();
    const companyRef = db.collection("companies").doc(input.companyId);
    const company = (await companyRef.get()).data();
    if (!company || !Array.isArray(company.members) || !company.members.includes(input.uid)) {
      return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
    }

    const to = input.to ?? Date.now();
    const from = input.from ?? to - 30 * 24 * 3600 * 1000;
    const field = "createdAt";
    const sub = input.type === "ledger" ? "ledger" : input.type;
    const snap = await companyRef.collection(sub).where(field, ">=", from).where(field, "<=", to).orderBy(field, "desc").limit(MAX_ROWS).get();

    let data: StatementData;
    const base = { companyName: String(company.name ?? ""), period: `${new Date(from).toLocaleDateString("fr-FR")} – ${new Date(to).toLocaleDateString("fr-FR")}`, currency: "XOF" };

    if (input.type === "transactions") {
      const docs = snap.docs.map((d) => d.data());
      const done = docs.filter((t) => t.status === "completed");
      data = {
        ...base, title: "Relevé des transactions",
        headers: ["Date", "Référence", "Client", "Méthode", "Statut", "Montant", "Commission", "Net"],
        rows: docs.map((t) => [fmtDate(t.createdAt), String(t.id ?? "").slice(0, 8).toUpperCase(), t.customerName ?? "", METHOD_FR[t.method] ?? t.method ?? "", STATUS_FR[t.status] ?? t.status ?? "", Number(t.amount ?? 0), Number(t.commission ?? 0), Number(t.netAmount ?? 0)]),
        numericColumns: [5, 6, 7],
        totals: [
          { label: "Total encaissé (complétés)", value: done.reduce((s, t) => s + Number(t.amount ?? 0), 0) },
          { label: "Commissions", value: done.reduce((s, t) => s + Number(t.commission ?? 0), 0) },
          { label: "Net crédité", value: done.reduce((s, t) => s + Number(t.netAmount ?? 0), 0) },
        ],
      };
    } else if (input.type === "payouts") {
      const docs = snap.docs.map((d) => d.data());
      data = {
        ...base, title: "Relevé des décaissements",
        headers: ["Date", "Bénéficiaire", "Méthode", "Détail", "Statut", "Montant"],
        rows: docs.map((p) => [fmtDate(p.createdAt), p.recipientName ?? "", METHOD_FR[p.method] ?? p.method ?? "", p.method === "bank_transfer" ? `${p.recipientBank ?? ""} ••${p.recipientAccountLast4 ?? ""}` : String(p.recipientPhone ?? "").replace(/(\d{4})\d+(\d{2})$/, "$1••••$2"), STATUS_FR[p.status] ?? p.status ?? "", Number(p.amount ?? 0)]),
        numericColumns: [5],
        totals: [{ label: "Total décaissé (complétés)", value: docs.filter((p) => p.status === "completed").reduce((s, p) => s + Number(p.amount ?? 0), 0) }],
      };
    } else {
      const docs = snap.docs.map((d) => d.data());
      data = {
        ...base, title: "Journal comptable",
        headers: ["Date", "Type", "Libellé", "Montant", "Solde après"],
        rows: docs.map((e) => [fmtDate(e.createdAt), e.type === "credit" ? "Crédit" : "Débit", e.label ?? "", (e.type === "credit" ? 1 : -1) * Number(e.amount ?? 0), Number(e.balanceAfter ?? 0)]),
        numericColumns: [3, 4],
        totals: [
          { label: "Total crédits", value: docs.filter((e) => e.type === "credit").reduce((s, e) => s + Number(e.amount ?? 0), 0) },
          { label: "Total débits", value: docs.filter((e) => e.type !== "credit").reduce((s, e) => s + Number(e.amount ?? 0), 0) },
        ],
      };
    }

    const buffer = input.format === "xlsx" ? await buildStatementXlsx(data) : await buildStatementPdf(data);
    const day = (ts: number) => new Date(ts).toISOString().slice(0, 10);
    const name = `releve-${input.type}-${day(from)}_${day(to)}.${input.format}`;
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": input.format === "xlsx" ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" : "application/pdf",
        "Content-Disposition": `attachment; filename="${name}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    console.error("POST /api/export/statement:", err);
    const message = err instanceof Error ? err.message : "";
    const isValidationError = message.startsWith("Donnée invalide");
    return NextResponse.json({ error: isValidationError ? message : "Export impossible" }, { status: isValidationError ? 400 : 500 });
  }
}
