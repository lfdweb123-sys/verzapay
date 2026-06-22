import Image from "next/image";
import { CheckCircle2, Globe2, Building2, Activity } from "lucide-react";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col lg:flex-row bg-white">
      <div className="flex-1 flex flex-col justify-center items-center px-6 sm:px-10 py-10 lg:py-0">
        <div className="w-full max-w-[400px]">{children}</div>
      </div>

      <div className="hidden lg:flex flex-1 relative bg-brand-700 overflow-hidden items-center justify-center p-10">
        <div className="absolute inset-0 opacity-[0.07]">
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[640px] h-[640px] rounded-full border border-white" />
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[440px] h-[440px] rounded-full border border-white" />
        </div>
        <div className="absolute top-[18%] left-[12%] w-1.5 h-1.5 rounded-full bg-white/40" />
        <div className="absolute top-[40%] right-[10%] w-1.5 h-1.5 rounded-full bg-white/30" />
        <div className="absolute bottom-[15%] left-[18%] w-1.5 h-1.5 rounded-full bg-white/30" />

        <div className="relative z-10 w-full max-w-[420px] flex flex-col gap-4">
          <div className="flex flex-col gap-3">
            <div className="rounded-2xl overflow-hidden border border-white/15">
              <Image
                src="/images/gestionfinancier2.png"
                alt="Gestion financière"
                width={420}
                height={160}
                className="w-full h-auto object-cover"
                priority
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="bg-white/10 border border-white/15 rounded-2xl p-4">
              <p className="text-brand-100 text-[11px] flex items-center gap-1.5 mb-1.5">
                <CheckCircle2 size={13} /> Taux de succès
              </p>
              <p className="text-white text-lg font-medium">98.2%</p>
            </div>
            <div className="bg-white/10 border border-white/15 rounded-2xl p-4">
              <p className="text-brand-100 text-[11px] flex items-center gap-1.5 mb-1.5">
                <Globe2 size={13} /> Pays couverts
              </p>
              <p className="text-white text-lg font-medium">12 pays</p>
            </div>
            <div className="bg-white/10 border border-white/15 rounded-2xl p-4">
              <p className="text-brand-100 text-[11px] flex items-center gap-1.5 mb-1.5">
                <Building2 size={13} /> Marchands
              </p>
              <p className="text-white text-lg font-medium">1 247</p>
            </div>
            <div className="bg-white/10 border border-white/15 rounded-2xl p-4">
              <p className="text-brand-100 text-[11px] flex items-center gap-1.5 mb-1.5">
                <Activity size={13} /> Uptime
              </p>
              <p className="text-white text-lg font-medium">99.9%</p>
            </div>
          </div>

          <div className="text-center mt-4">
            <h2 className="text-white text-xl font-medium leading-snug">
              La passerelle de paiement
              <br />
              pensée pour l&apos;Afrique
            </h2>
            <p className="text-brand-100 text-sm mt-2 leading-relaxed">
              Mobile Money, Carte bancaire — une seule API
              <br />
              pour tout l&apos;Ouest africain.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}