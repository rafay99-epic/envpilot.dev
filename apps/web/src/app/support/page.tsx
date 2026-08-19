import { MarketingShell, PageHero, terminal } from "@/components/marketing";
import { SupportSidebar } from "@/components/support/SupportSidebar";
import { SupportTicketPanel } from "@/components/support/SupportTicketPanel";

export default function SupportPage() {
  return (
    <MarketingShell>
      <PageHero
        eyebrow="support"
        title="We've got your back."
        description="Run into an issue or need help with Envpilot? Open a ticket and we'll get back to you — usually within a day."
      />

      <section className="pb-24">
        <div className={terminal.shell}>
          <div className="grid gap-10 lg:grid-cols-3">
            {/* Sidebar - Quick help */}
            <div className="lg:col-span-1">
              <SupportSidebar />
            </div>

            {/* Main form */}
            <div className="lg:col-span-2">
              <SupportTicketPanel />
            </div>
          </div>
        </div>
      </section>
    </MarketingShell>
  );
}
