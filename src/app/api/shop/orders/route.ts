import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { createJoonapayPayment } from "@/lib/joonapay";
import { createShopOrderSchema, parseOrThrow } from "@/lib/validation";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import type { Transaction, ShopOrderItem } from "@/types";

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

    // NOTE: `return_url` n'existe pas dans CreatePaymentRequest côté JoonaPay
    // (vérifié contre le schéma officiel — voir payments/route.ts). Le retour
    // client après paiement se gère via webhook_url + le payment_link affiché
    // sur la page de checkout, pas via un paramètre de redirection.
    const joonaRes = await createJoonapayPayment({
      amount: totalAmount,
      currency: "XOF",
      description: `Commande boutique ${shop.name}`,
      webhook_url: `${process.env.NEXT_PUBLIC_APP_URL}/api/webhooks/joonapay`,
    });

    if (!joonaRes.success) {
      return NextResponse.json({ error: "Erreur lors de la création du paiement" }, { status: 502 });
    }

    const commission = Math.round(totalAmount * (company.commissionRate ?? 0.015));
    const netAmount = totalAmount - commission;

    // Le schéma PaymentCreatedResponse expose `uuid` (pas `id`) et `payment_link`
    // (pas `checkout_url`) — voir payments/route.ts pour la même convention.
    const joonapayPaymentUuid = joonaRes.data?.uuid ?? null;
    const paymentLink = joonaRes.data?.payment_link ?? "#";

    const txRef = db.collection("companies").doc(shop.companyId).collection("transactions").doc();
    const tx: Transaction = {
      id: txRef.id,
      companyId: shop.companyId,
      joonapayPaymentId: joonapayPaymentUuid,
      amount: totalAmount,
      currency: "XOF",
      commission,
      netAmount,
      method: "mobile_money",
      status: "pending",
      description: `Commande boutique ${shop.name}`,
      customerName,
      customerPhone,
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
      customerName,
      customerPhone,
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
    console.error("POST /api/shop/orders:", err);
    const message = err instanceof Error ? err.message : "Erreur serveur";
    const isValidationError = message.startsWith("Donnée invalide");
    return NextResponse.json({ error: isValidationError ? message : "Une erreur est survenue" }, { status: isValidationError ? 400 : 500 });
  }
}