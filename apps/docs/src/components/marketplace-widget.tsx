"use client";

import { useEffect, useRef } from "react";

declare global {
  interface Window {
    MarketplaceWidget?: {
      setupMarketplaceWidget: (
        mode: string,
        pluginId: number,
        el: Element
      ) => void;
    };
  }
}

const SCRIPT_ID = "jetbrains-mp-widget";
const SCRIPT_SRC = "https://plugins.jetbrains.com/assets/scripts/mp-widget.js";
const PLUGIN_ID = 33946;

/**
 * JetBrains Marketplace embed: `mode="card"` shows the plugin card,
 * `mode="install"` renders the one-click Install button.
 * The marketplace script targets the rendered div.
 */
export function MarketplaceWidget({
  mode = "install",
}: {
  mode?: "card" | "install";
}) {
  const host = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = host.current;
    if (!el) return;

    const setup = () =>
      window.MarketplaceWidget?.setupMarketplaceWidget(mode, PLUGIN_ID, el);
    const existing = document.getElementById(
      SCRIPT_ID
    ) as HTMLScriptElement | null;

    if (existing) {
      if (window.MarketplaceWidget) setup();
      else existing.addEventListener("load", setup, { once: true });
      return;
    }

    const script = document.createElement("script");
    script.id = SCRIPT_ID;
    script.src = SCRIPT_SRC;
    script.onload = setup;
    document.head.appendChild(script);
  }, [mode]);

  return <div ref={host} />;
}
