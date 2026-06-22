"use client";

import { Suspense, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { useToast } from "@/components/ui/toast";
import { UsersRound, Loader2, CheckCircle2, XCircle } from "lucide-react";

function AcceptInviteContent() {
  const params = useSearchParams();
  const router = useRouter();
  const { user } = useAuth();
  const { show } = useToast();
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState<"accepted" | "declined" | null>(null);

  const companyId = params.get("companyId");
  const inviteId = params.get("inviteId");
  const token = params.get("token");

  async function respond(action: "accept" | "decline") {
    if (!user || !companyId || !inviteId || !token) return;
    setLoading(true);
    try {
      const res = await fetch("/api/team/respond", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companyId, inviteId, token, uid: user.uid, action }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Erreur");
      setDone(action === "accept" ? "accepted" : "declined");
      if (action === "accept") show("Invitation acceptée", "success");
    } catch (err) {
      show((err as Error).message, "error");
    } finally {
      setLoading(false);
    }
  }

  if (!companyId || !inviteId || !token) {
    return <p className="text-sm text-ink-500 text-center py-12">Lien d&apos;invitation invalide.</p>;
  }

  if (!user) {
    return (
      <div className="text-center py-12 space-y-3">
        <p className="text-sm text-ink-600">Connectez-vous pour accepter cette invitation.</p>
        <button onClick={() => router.push(`/login?redirect=${encodeURIComponent(window.location.pathname + window.location.search)}`)} className="btn-primary mx-auto">
          Se connecter
        </button>
      </div>
    );
  }

  if (done === "accepted") {
    return (
      <div className="text-center py-12 space-y-3">
        <CheckCircle2 size={36} className="text-success-700 mx-auto" />
        <p className="font-medium text-ink-900">Invitation acceptée !</p>
        <button onClick={() => router.push("/dashboard")} className="btn-primary mx-auto">Aller au tableau de bord</button>
      </div>
    );
  }

  if (done === "declined") {
    return (
      <div className="text-center py-12 space-y-3">
        <XCircle size={36} className="text-ink-400 mx-auto" />
        <p className="font-medium text-ink-900">Invitation déclinée</p>
      </div>
    );
  }

  return (
    <div className="text-center py-12 space-y-5">
      <div className="w-14 h-14 rounded-2xl bg-brand-50 flex items-center justify-center mx-auto">
        <UsersRound size={26} className="text-brand-700" />
      </div>
      <div>
        <p className="font-medium text-ink-900">Vous avez été invité(e) à rejoindre une équipe</p>
        <p className="text-sm text-ink-500 mt-1">Acceptez pour accéder à l&apos;espace Verzapay de cette entreprise.</p>
      </div>
      <div className="flex gap-2 justify-center">
        <button onClick={() => respond("decline")} disabled={loading} className="btn-secondary">Décliner</button>
        <button onClick={() => respond("accept")} disabled={loading} className="btn-primary">
          {loading && <Loader2 size={15} className="animate-spin" />}
          Accepter l&apos;invitation
        </button>
      </div>
    </div>
  );
}

export default function AcceptInvitePage() {
  return (
    <div className="max-w-md mx-auto">
      <Suspense fallback={<div className="flex justify-center py-16"><Loader2 className="animate-spin text-brand-600" /></div>}>
        <AcceptInviteContent />
      </Suspense>
    </div>
  );
}
