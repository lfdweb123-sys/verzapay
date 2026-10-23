import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { companyLegalInfoSchema, parseOrThrow } from "@/lib/validation";
import { z } from "zod";
import { verifyRequestUid } from "@/lib/auth-token";

const requestSchema = z.object({
  companyId: z.string().min(1).max(128),
  uid: z.string().min(1).max(128),
  legalInfo: companyLegalInfoSchema,
});

export async function POST(req: NextRequest) {
  try {
    const raw = await req.json();
    const { companyId, uid, legalInfo } = parseOrThrow(requestSchema, raw);
    if (!(await verifyRequestUid(uid))) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }


    const db = adminDb();
    const companyRef = db.collection("companies").doc(companyId);
    const companySnap = await companyRef.get();
    if (!companySnap.exists) {
      return NextResponse.json({ error: "Entreprise introuvable" }, { status: 404 });
    }

    const company = companySnap.data()!;
    if (!Array.isArray(company.members) || !company.members.includes(uid)) {
      return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
    }

    // Si un nouveau PDF est fourni, on horodate l'upload. Si rccmDocumentBase64
    // est explicitement absent du payload (undefined), on NE TOUCHE PAS au
    // document déjà stocké — seul un envoi explicite de null l'efface.
    const existingLegalInfo = company.legalInfo ?? {};
    const updatedLegalInfo: Record<string, unknown> = {
      ...existingLegalInfo,
      ifuNumber: legalInfo.ifuNumber ?? existingLegalInfo.ifuNumber ?? null,
      rccmNumber: legalInfo.rccmNumber ?? existingLegalInfo.rccmNumber ?? null,
      legalCategory: legalInfo.legalCategory ?? existingLegalInfo.legalCategory ?? null,
      taxRegime: legalInfo.taxRegime ?? existingLegalInfo.taxRegime ?? null,
      ownerFullName: legalInfo.ownerFullName ?? existingLegalInfo.ownerFullName ?? null,
      address: legalInfo.address ?? existingLegalInfo.address ?? null,
      activityDescription: legalInfo.activityDescription ?? existingLegalInfo.activityDescription ?? null,
    };

    if (legalInfo.rccmDocumentBase64 !== undefined) {
      if (legalInfo.rccmDocumentBase64 === null) {
        updatedLegalInfo.rccmDocumentBase64 = null;
        updatedLegalInfo.rccmDocumentUploadedAt = null;
      } else {
        updatedLegalInfo.rccmDocumentBase64 = legalInfo.rccmDocumentBase64;
        updatedLegalInfo.rccmDocumentUploadedAt = Date.now();
      }
    }

    await companyRef.update({ legalInfo: updatedLegalInfo });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("POST /api/company/legal-info:", err);
    const message = err instanceof Error ? err.message : "Erreur serveur";
    const isValidationError = message.startsWith("Donnée invalide");
    return NextResponse.json(
      { error: isValidationError ? message : "Une erreur est survenue lors de la sauvegarde" },
      { status: isValidationError ? 400 : 500 }
    );
  }
}