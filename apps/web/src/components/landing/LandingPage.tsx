import { MarketingShell } from "@/components/marketing";
import type { PricingData } from "@/components/pricing/PricingContent";
import { Access } from "./Access";
import { Audit } from "./Audit";
import { Chrome } from "./Chrome";
import { Intro } from "./Intro";
import { Plans } from "./Plans";
import { ProofRail } from "./ProofRail";
import { Start } from "./Start";
import { Surfaces } from "./Surfaces";
import { Vault } from "./Vault";
import { Why } from "./Why";

export default function LandingPage({
  pricingData = null,
  paymentsEnabled = null,
}: {
  pricingData?: PricingData | null;
  paymentsEnabled?: boolean | null;
}) {
  return (
    <MarketingShell>
      <div className="pb-9 font-sans">
        <Chrome />
        <Intro />
        <ProofRail />
        <Vault />
        <Surfaces />
        <Access />
        <Audit />
        <Plans pricingData={pricingData} paymentsEnabled={paymentsEnabled} />
        <Why />
        <Start />
      </div>
    </MarketingShell>
  );
}
