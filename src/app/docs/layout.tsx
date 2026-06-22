import { MarketingHeader } from "@/components/marketing/header";
import { MarketingFooter } from "@/components/marketing/footer";

export default function DocsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-white flex flex-col">
      <MarketingHeader />
      <main className="flex-1 pt-24 pb-20">{children}</main>
      <MarketingFooter />
    </div>
  );
}
