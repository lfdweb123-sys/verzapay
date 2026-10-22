import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { loadCommissionData, toCsv } from "@/lib/admin-commissions";

const fmtDate = (ts: number) => new Date(ts).toISOString().replace("T", " ").slice(0, 19);

export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams;
    const uid = sp.get("uid");
    if (!(await requireAdmin(uid))) return NextResponse.json({ error: "Accès refusé" }, { status: 403 });

    const type = sp.get("type") ?? "transactions";
    const now = Date.now();
    const to = Number(sp.get("to")) || now;
    const from = Number(sp.get("from")) || to - 30 * 24 * 3600 * 1000;
    const data = await loadCommissionData({ from, to, currency: sp.get("currency") ?? undefined });

    let csv: string;
    if (type === "daily") {
      csv = toCsv(
        ["Date", "Transactions", `Volume (${data.currency})`, `Commission Verzapay (${data.currency})`],
        data.daily.map((d) => [d.date, d.count, d.volume, d.commission])
      );
    } else if (type === "companies") {
      csv = toCsv(
        ["Entreprise", "Transactions", `Volume (${data.currency})`, `Commission Verzapay (${data.currency})`, "Taux effectif (%)"],
        data.byCompany.map((c) => [c.name, c.count, c.volume, c.commission, (c.rate * 100).toFixed(2)])
      );
    } else {
      csv = toCsv(
        ["Date", "Entreprise", "Transaction", "Référence marchand", "Client", "Méthode", "Devise", "Montant", "Commission Verzapay", "Net marchand"],
        data.rows.map((r) => [fmtDate(r.createdAt), r.companyName, r.id, r.merchantReference, r.customerName, r.method, r.currency, r.amount, r.commission, r.netAmount])
      );
    }

    const day = (ts: number) => new Date(ts).toISOString().slice(0, 10);
    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="commissions-${type}-${day(from)}_${day(to)}.csv"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    console.error("GET /api/admin/commissions/report:", err);
    return NextResponse.json({ error: "Une erreur est survenue" }, { status: 500 });
  }
}
