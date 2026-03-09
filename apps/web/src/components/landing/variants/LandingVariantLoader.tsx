"use client";

import { useState, useSyncExternalStore, Suspense } from "react";
import dynamic from "next/dynamic";
import VariantSwitcher, { type VariantId } from "./VariantSwitcher";
import { ENABLED_VARIANTS } from "./feature-flags";

const TerminalLanding = dynamic(() => import("./TerminalLanding"), {
  ssr: false,
  loading: () => <VariantSkeleton />,
});

const GlassmorphismLanding = dynamic(() => import("./GlassmorphismLanding"), {
  ssr: false,
  loading: () => <VariantSkeleton />,
});

const NeobrutalLanding = dynamic(() => import("./NeobrutalLanding"), {
  ssr: false,
  loading: () => <VariantSkeleton />,
});

const SwissMinimalLanding = dynamic(() => import("./SwissMinimalLanding"), {
  ssr: false,
  loading: () => <VariantSkeleton />,
});

const CyberpunkLanding = dynamic(() => import("./CyberpunkLanding"), {
  ssr: false,
  loading: () => <VariantSkeleton />,
});

const BentoGridLanding = dynamic(() => import("./BentoGridLanding"), {
  ssr: false,
  loading: () => <VariantSkeleton />,
});

const StorytellingLanding = dynamic(() => import("./StorytellingLanding"), {
  ssr: false,
  loading: () => <VariantSkeleton />,
});

const GradientMeshLanding = dynamic(() => import("./GradientMeshLanding"), {
  ssr: false,
  loading: () => <VariantSkeleton />,
});

const RetroPixelLanding = dynamic(() => import("./RetroPixelLanding"), {
  ssr: false,
  loading: () => <VariantSkeleton />,
});

const EditorialLanding = dynamic(() => import("./EditorialLanding"), {
  ssr: false,
  loading: () => <VariantSkeleton />,
});

const VARIANT_COMPONENTS: Record<VariantId, React.ComponentType> = {
  terminal: TerminalLanding,
  glass: GlassmorphismLanding,
  neobrutal: NeobrutalLanding,
  swiss: SwissMinimalLanding,
  cyberpunk: CyberpunkLanding,
  bento: BentoGridLanding,
  story: StorytellingLanding,
  mesh: GradientMeshLanding,
  retro: RetroPixelLanding,
  editorial: EditorialLanding,
};

const STORAGE_KEY = "envpilot-landing-variant";

function VariantSkeleton() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-950">
      <div className="flex flex-col items-center gap-4">
        <div className="h-10 w-10 animate-spin rounded-full border-2 border-zinc-700 border-t-white" />
        <p className="text-sm text-zinc-500">Loading variant...</p>
      </div>
    </div>
  );
}

function getStoredVariant(): VariantId {
  if (typeof window === "undefined") return "terminal";
  const saved = localStorage.getItem(STORAGE_KEY) as VariantId | null;
  if (saved && saved in VARIANT_COMPONENTS && ENABLED_VARIANTS[saved]) {
    return saved;
  }
  return "terminal";
}

function subscribeToStorage(callback: () => void) {
  window.addEventListener("storage", callback);
  return () => window.removeEventListener("storage", callback);
}

function getServerSnapshot(): VariantId {
  return "terminal";
}

export default function LandingVariantLoader() {
  const storedVariant = useSyncExternalStore(
    subscribeToStorage,
    getStoredVariant,
    getServerSnapshot
  );
  const [variant, setVariant] = useState<VariantId>(storedVariant);
  const isHydrated = useSyncExternalStore(
    subscribeToStorage,
    () => true,
    () => false
  );

  const handleChange = (id: VariantId) => {
    setVariant(id);
    localStorage.setItem(STORAGE_KEY, id);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  if (!isHydrated) {
    return <VariantSkeleton />;
  }

  const ActiveVariant = VARIANT_COMPONENTS[variant];

  return (
    <>
      <Suspense fallback={<VariantSkeleton />}>
        <ActiveVariant />
      </Suspense>
      <VariantSwitcher current={variant} onChange={handleChange} />
    </>
  );
}
