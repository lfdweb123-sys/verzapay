import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { generateApiPublicKey } from "@/lib/crypto-utils";
import { notifyAdmin } from "@/lib/notify-admin";
import { createCompanySchema, parseOrThrow } from "@/lib/validation";
import { checkRateLimit } from "@/lib/rate-limit";

function colorForName(name: string): string {
  const colors = ["#0C447C", "#3B6D11", "#854F0B", "#993556", "#534AB7", "#993C1D"];
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return colors[Math.abs(hash) % colors.length];
}

export async function POST(req: NextRequest) {
  try {
    const raw = await req.json();
    const { uid, name, legalName, sector, country } = parseOrThrow(createCompanySchema, raw);

    const limited = await checkRateLimit(`company-create:uid:${uid}`, 10, 3600); // 10 créations / heure
    if (!limited.allowed) {
      return NextResponse.json({ error: "Trop de tentatives. Réessayez plus tard." }, { status: 429 });
    }

    const db = adminDb();
    const userSnap = await db.collection("users").doc(uid).get();
    if (!userSnap.exists) return NextResponse.json({ error: "Utilisateur introuvable" }, { status: 404 });
    const userData = userSnap.data()!;

    const companyRef = db.collection("companies").doc();
    const company = {
      id: companyRef.id,
      name: name.trim(),
      legalName: legalName ? legalName.trim() : null,
      sector: sector || null,
      country,
      ownerUid: uid,
      members: [uid],
      role: "Root",
      createdAt: Date.now(),
      kycStatus: "not_started",
      kycVerificationId: null,
      kycSessionId: null,
      kycRiskLevel: null,
      kycReviewedAt: null,
      commissionRate: 0.015,
      joonapayConfigured: false,
      apiKeyPublic: generateApiPublicKey(),
      apiKeySecretGenerated: false,
      logoColor: colorForName(name),
      walletBalance: 0,
      suspended: false,
      legalInfo: {},
    };

    await companyRef.set(company);
    await db.collection("users").doc(uid).update({ activeCompanyId: companyRef.id });

    await notifyAdmin({
      title: "Nouvelle entreprise créée",
      body: `<strong>${userData.displayName ?? userData.email}</strong> a créé l'entreprise <strong>${company.name}</strong> (${country}).`,
      ctaLabel: "Voir dans l'admin",
      ctaUrl: `${process.env.NEXT_PUBLIC_APP_URL}/admin`,
    });

    return NextResponse.json({ companyId: companyRef.id });
  } catch (err) {
    console.error("POST /api/companies/create:", err);
    const message = err instanceof Error ? err.message : "Erreur serveur";
    const isValidationError = message.startsWith("Donnée invalide");
    return NextResponse.json({ error: isValidationError ? message : "Une erreur est survenue" }, { status: isValidationError ? 400 : 500 });
  }
}
