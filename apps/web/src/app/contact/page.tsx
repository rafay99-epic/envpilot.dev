import { MarketingShell } from "@/components/marketing";
import { ContactBody } from "@/components/contact/ContactBody";

// The page itself stays on the server so the marketing shell prerenders; only
// the form island below it ships as client JS.
export default function ContactPage() {
  return (
    <MarketingShell>
      <ContactBody />
    </MarketingShell>
  );
}
