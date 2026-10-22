import { MarketingHeader } from "@/components/marketing/header";
import { Hero } from "@/components/marketing/hero";
import { TrustBar } from "@/components/marketing/trust-bar";
import { HowItWorks } from "@/components/marketing/how-it-works";
import { PaymentMethods } from "@/components/marketing/payment-methods";
import { KycSection } from "@/components/marketing/kyc-section";
import { PlatformFeatures } from "@/components/marketing/platform-features";
import { Pricing } from "@/components/marketing/pricing";
import { Faq } from "@/components/marketing/faq";
import { FinalCta } from "@/components/marketing/final-cta";
import { MarketingFooter } from "@/components/marketing/footer";
import { ScrollToTop } from "@/components/marketing/scroll-to-top";
import { WhatsAppChat } from "@/components/marketing/whatsapp-chat";

export default function HomePage() {
  return (
    <div className="min-h-screen bg-white">
      <MarketingHeader />
      <main>
        <Hero />
        <TrustBar />
        <HowItWorks />
        <PaymentMethods />
        <KycSection />
        <PlatformFeatures />
        <Pricing />
        <Faq />
        <FinalCta />
      </main>
      <MarketingFooter />
      <ScrollToTop />
      <WhatsAppChat />
    </div>
  );
}
