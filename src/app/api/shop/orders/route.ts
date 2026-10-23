import { planCharge, planFields } from "@/lib/charge";
import { FxError } from "@/lib/fx";
import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { createJoonapayPayment, getJoonapayMisc } from "@/lib/joonapay";
import { createShopOrderSchema, parseOrThrow } from "@/lib/validation";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import type { Transaction, ShopOrderItem } from "@/types";

const DEFAULT_DUE_DAYS = 7;

function computeDueDate(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().split("T")[0];
}

type JoonapayCountryLike = {
  uuid: string;
  code: string;
  indicator: string;
  currency: string;
  payment_enabled: boolean;
};

function resolveCountry(
  countries: JoonapayCountryLike[],
  customerPhone: string | null | undefined,
  companyCountryCode: string | undefined
): JoonapayCountryLike | null {
  const active = countries.filter((c) => c.payment_enabled);

  if (customerPhone) {
    const phone = customerPhone.startsWith("+") ? customerPhone : `+${customerPhone}`;
    const candidates = active
      .filter((c) => phone.startsWith(c.indicator))
      .sort((a, b) => b.indicator.length - a.indicator.length);
    if (candidates.length > 0) return candidates[0];
  }

  if (companyCountryCode) {
    const byCompany = active.find((c) => c.code === companyCountryCode);
    if (byCompany) return byCompany;
  }

  return null;
}

export async function POST(req: NextRequest) {
  try {
    const raw = await req.json();
    const { shopSlug, items, customerName, customerPhone, customerEmail, customerAddress } = parseOrThrow(createShopOrderSchema, raw);

    const ip = getClientIp(req);
    const limited = await checkRateLimit(`shop-order:ip:${ip}`, 20, 600);
    if (!limited.allowed) {
      return NextResponse.json({ error: "Trop de commandes créées récemment. Réessayez plus tard." }, { status: 429 });
    }

    const db = adminDb();
    const shopSnap = await db.collection("shops").where("slug", "==", shopSlug).limit(1).get();
    if (shopSnap.empty) return NextResponse.json({ error: "Boutique introuvable" }, { status: 404 });

    const shopDoc = shopSnap.docs[0];
    const shop = shopDoc.data();
    if (!shop.isActive) return NextResponse.json({ error: "Cette boutique est actuellement fermée" }, { status: 404 });

    const companySnap = await db.collection("companies").doc(shop.companyId).get();
    if (!companySnap.exists) return NextResponse.json({ error: "Entreprise introuvable" }, { status: 404 });
    const company = companySnap.data()!;

    if (company.kycStatus !== "approved") {
      return NextResponse.json({ error: "Cette boutique n'est pas encore en mesure d'accepter des paiements" }, { status: 403 });
    }
    if (company.suspended === true) {
      return NextResponse.json({ error: "Cette boutique est temporairement indisponible" }, { status: 403 });
    }

    // Recalcul du total côté serveur — jamais confiance aux montants client
    const orderItems: ShopOrderItem[] = [];
    let totalAmount = 0;

    for (const item of items) {
      const productSnap = await db.collection("shopProducts").doc(item.productId).get();
      if (!productSnap.exists) {
        return NextResponse.json({ error: "Un produit de votre panier n'est plus disponible" }, { status: 400 });
      }
      const product = productSnap.data()!;
      if (product.shopId !== shop.id || !product.isActive) {
        return NextResponse.json({ error: "Un produit de votre panier n'est plus disponible" }, { status: 400 });
      }
      if (product.stock !== null && product.stock < item.quantity) {
        return NextResponse.json({ error: `Stock insuffisant pour "${product.name}"` }, { status: 400 });
      }

      const lineTotal = product.price * item.quantity;
      totalAmount += lineTotal;
      orderItems.push({
        productId: product.id,
        productName: product.name,
        unitPrice: product.price,
        quantity: item.quantity,
      });
    }

    if (totalAmount < 100) {
      return NextResponse.json({ error: "Le montant total de la commande est trop faible" }, { status: 400 });
    }

    // Résolution du country_uuid requis par JoonaPay
    const miscRes = await getJoonapayMisc({ payment_enabled: true });
    const country = resolveCountry(miscRes.data?.countries ?? [], customerPhone, company.countryCode);

    if (!country) {
      return NextResponse.json(
        { error: "Impossible de déterminer le pays pour ce paiement. Vérifiez le numéro de téléphone (format international, ex: +22961000000)." },
        { status: 400 }
      );
    }

    // Les prix de la boutique sont en XOF : conversion vers la devise du pays du client.
    const plan = await planCharge({ amount: totalAmount, currency: "XOF", targetCurrency: country.currency, minLedger: 100, maxLedger: 50_000_000 });

    const dueDate = computeDueDate(DEFAULT_DUE_DAYS);
    const resolvedCustomerName = customerName?.trim() || "Client Verzapay";

    const joonaRes = await createJoonapayPayment({
      amount: plan.chargeAmount,
      currency: plan.chargeCurrency,
      country_uuid: country.uuid,
      due_date: dueDate,
      description: `Commande boutique ${shop.name}`,
      customer_name: resolvedCustomerName,
      customer_phone: customerPhone ?? undefined,
      customer_email: customerEmail ?? undefined,
      webhook_url: `${process.env.NEXT_PUBLIC_APP_URL}/api/webhooks/joonapay`,
    });

    if (!joonaRes.success) {
      return NextResponse.json({ error: "Erreur lors de la création du paiement" }, { status: 502 });
    }

    const commission = Math.round(totalAmount * (company.commissionRate ?? 0.005));
    const netAmount = totalAmount - commission;

    const joonapayPaymentUuid = joonaRes.data?.uuid ?? null;
    const paymentLink = joonaRes.data?.payment_link ?? "#";

    const txRef = db.collection("companies").doc(shop.companyId).collection("transactions").doc();
    const tx: Transaction = {
      id: txRef.id,
      companyId: shop.companyId,
      joonapayPaymentId: joonapayPaymentUuid,
      amount: totalAmount,
      currency: "XOF",
      ...planFields(plan),
      commission,
      netAmount,
      method: "mobile_money",
      status: "pending",
      description: `Commande boutique ${shop.name}`,
      customerName: resolvedCustomerName,
      customerPhone: customerPhone ?? null,
      customerEmail: customerEmail ?? null,
      createdAt: Date.now(),
      completedAt: null,
    };
    await txRef.set(tx);

    const orderRef = db.collection("shopOrders").doc();
    const order = {
      id: orderRef.id,
      shopId: shop.id,
      companyId: shop.companyId,
      items: orderItems,
      totalAmount,
      customerName: resolvedCustomerName,
      customerPhone: customerPhone ?? null,
      customerEmail: customerEmail ?? null,
      customerAddress: customerAddress ?? null,
      status: "pending",
      joonapayPaymentId: joonapayPaymentUuid,
      transactionId: txRef.id,
      createdAt: Date.now(),
      paidAt: null,
    };
    await orderRef.set(order);

    return NextResponse.json({
      orderId: orderRef.id,
      checkoutUrl: paymentLink,
      totalAmount,
    });
  } catch (err) {
    if (err instanceof FxError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("POST /api/shop/orders:", err);
    const message = err instanceof Error ? err.message : "Erreur serveur";
    const isValidationError = message.startsWith("Donnée invalide");
    return NextResponse.json({ error: isValidationError ? message : "Une erreur est survenue" }, { status: isValidationError ? 400 : 500 });
  }
}