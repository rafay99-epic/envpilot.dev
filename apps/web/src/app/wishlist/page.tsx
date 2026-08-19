import { MarketingShell } from "@/components/marketing";
import { WishlistBoard } from "@/components/wishlist/WishlistBoard";

// The page itself stays on the server so the marketing shell prerenders; the
// vote/submit board below it is the only part that ships as client JS.
export default function WishlistPage() {
  return (
    <MarketingShell>
      <WishlistBoard />
    </MarketingShell>
  );
}
