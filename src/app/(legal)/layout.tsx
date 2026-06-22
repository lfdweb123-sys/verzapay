import { MarketingHeader } from "@/components/marketing/header";
import { MarketingFooter } from "@/components/marketing/footer";

export default function LegalGroupLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-white flex flex-col">
      <MarketingHeader />
      <main className="flex-1 pt-28 pb-20">
        <div className="max-w-3xl mx-auto px-5 sm:px-6 lg:px-8">{children}</div>
      </main>
      <MarketingFooter />
    </div>
  );
}
