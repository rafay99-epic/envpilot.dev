"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ENABLED_VARIANTS } from "./feature-flags";

const VARIANTS = [
  {
    id: "terminal",
    label: "Terminal",
    shortLabel: "01",
    description: "Dark terminal aesthetic, CLI-inspired",
    color: "from-green-500 to-emerald-600",
    accent: "#22c55e",
  },
  {
    id: "glass",
    label: "Aurora Glass",
    shortLabel: "02",
    description: "Frosted glass, aurora gradients",
    color: "from-purple-500 to-blue-600",
    accent: "#8b5cf6",
  },
  {
    id: "neobrutal",
    label: "Neobrutalism",
    shortLabel: "03",
    description: "Bold colors, thick borders, playful",
    color: "from-pink-500 to-orange-500",
    accent: "#f43f5e",
  },
  {
    id: "swiss",
    label: "Swiss Minimal",
    shortLabel: "04",
    description: "Ultra-clean, typographic, precise",
    color: "from-red-600 to-red-700",
    accent: "#dc2626",
  },
  {
    id: "cyberpunk",
    label: "Cyberpunk",
    shortLabel: "05",
    description: "Neon glows, futuristic, HUD-style",
    color: "from-cyan-400 to-fuchsia-500",
    accent: "#06b6d4",
  },
  {
    id: "bento",
    label: "Bento Grid",
    shortLabel: "06",
    description: "Product showcase, visual bento cards",
    color: "from-emerald-400 to-cyan-500",
    accent: "#34d399",
  },
  {
    id: "story",
    label: "Storytelling",
    shortLabel: "07",
    description: "Scroll-driven narrative, chapters",
    color: "from-rose-500 to-red-600",
    accent: "#f43f5e",
  },
  {
    id: "mesh",
    label: "Gradient Mesh",
    shortLabel: "08",
    description: "Premium SaaS, mesh gradients",
    color: "from-orange-500 to-amber-500",
    accent: "#f97316",
  },
  {
    id: "retro",
    label: "Retro Pixel",
    shortLabel: "09",
    description: "8-bit gaming, achievements, XP",
    color: "from-indigo-500 to-violet-600",
    accent: "#6366f1",
  },
  {
    id: "editorial",
    label: "Editorial",
    shortLabel: "10",
    description: "Magazine-style, serif typography",
    color: "from-stone-600 to-stone-800",
    accent: "#78716c",
  },
] as const;

export type VariantId = (typeof VARIANTS)[number]["id"];

const VISIBLE_VARIANTS = VARIANTS.filter((v) => ENABLED_VARIANTS[v.id]);

interface VariantSwitcherProps {
  current: VariantId;
  onChange: (id: VariantId) => void;
}

export default function VariantSwitcher({
  current,
  onChange,
}: VariantSwitcherProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  if (!isMounted) return null;

  const currentVariant = VARIANTS.find((v) => v.id === current);

  return (
    <>
      {/* Floating Toggle Button */}
      <motion.div
        className="fixed bottom-6 right-6 z-[9999]"
        initial={{ scale: 0, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ delay: 1, type: "spring", stiffness: 200 }}
      >
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="group flex h-14 w-14 items-center justify-center rounded-full border border-white/20 bg-black/90 shadow-2xl backdrop-blur-xl transition-all hover:scale-110 hover:shadow-[0_0_30px_rgba(139,92,246,0.3)]"
          style={{ boxShadow: `0 0 20px ${currentVariant?.accent}33` }}
        >
          <svg
            className="h-6 w-6 text-white transition-transform group-hover:rotate-90"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={1.5}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M9.53 16.122a3 3 0 0 0-5.78 1.128 2.25 2.25 0 0 1-2.4 2.245 4.5 4.5 0 0 0 8.4-2.245c0-.399-.078-.78-.22-1.128Zm0 0a15.998 15.998 0 0 0 3.388-1.62m-5.043-.025a15.994 15.994 0 0 1 1.622-3.395m3.42 3.42a15.995 15.995 0 0 0 4.764-4.648l3.876-5.814a1.151 1.151 0 0 0-1.597-1.597L14.146 6.32a15.996 15.996 0 0 0-4.649 4.763m3.42 3.42a6.776 6.776 0 0 0-3.42-3.42"
            />
          </svg>
        </button>

        {/* Variant label badge */}
        <motion.div
          className="absolute -top-2 -left-2 rounded-full bg-gradient-to-r px-2 py-0.5 text-[10px] font-bold text-white shadow-lg"
          style={{
            background: `linear-gradient(to right, ${currentVariant?.accent}, ${currentVariant?.accent}dd)`,
          }}
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ delay: 1.3 }}
        >
          {currentVariant?.shortLabel}
        </motion.div>
      </motion.div>

      {/* Panel */}
      <AnimatePresence>
        {isOpen && (
          <>
            {/* Backdrop */}
            <motion.div
              className="fixed inset-0 z-[9998] bg-black/60 backdrop-blur-sm"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsOpen(false)}
            />

            {/* Switcher Panel */}
            <motion.div
              className="fixed right-6 bottom-24 z-[9999] w-80 overflow-hidden rounded-2xl border border-white/10 bg-zinc-950/95 shadow-2xl backdrop-blur-xl"
              initial={{ opacity: 0, y: 20, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 20, scale: 0.95 }}
              transition={{ type: "spring", stiffness: 300, damping: 25 }}
            >
              {/* Header */}
              <div className="border-b border-white/10 px-5 py-4">
                <h3 className="text-sm font-semibold text-white">
                  Landing Page Variants
                </h3>
                <p className="mt-1 text-xs text-zinc-400">
                  Switch between {VISIBLE_VARIANTS.length} designs
                </p>
              </div>

              {/* Variant List */}
              <div className="max-h-[60vh] overflow-y-auto p-2">
                {VISIBLE_VARIANTS.map((variant, index) => {
                  const isActive = current === variant.id;
                  return (
                    <motion.button
                      key={variant.id}
                      onClick={() => {
                        onChange(variant.id);
                        setIsOpen(false);
                      }}
                      className={`group relative flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left transition-all ${
                        isActive
                          ? "bg-white/10"
                          : "hover:bg-white/5"
                      }`}
                      initial={{ opacity: 0, x: 20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: index * 0.05 }}
                    >
                      {/* Color indicator */}
                      <div
                        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br ${variant.color} text-xs font-bold text-white shadow-lg`}
                      >
                        {variant.shortLabel}
                      </div>

                      {/* Text */}
                      <div className="min-w-0 flex-1">
                        <p
                          className={`text-sm font-medium ${isActive ? "text-white" : "text-zinc-300"}`}
                        >
                          {variant.label}
                        </p>
                        <p className="truncate text-xs text-zinc-500">
                          {variant.description}
                        </p>
                      </div>

                      {/* Active indicator */}
                      {isActive && (
                        <motion.div
                          layoutId="activeVariant"
                          className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white"
                        >
                          <svg
                            className="h-3.5 w-3.5 text-black"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                            strokeWidth={3}
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              d="m4.5 12.75 6 6 9-13.5"
                            />
                          </svg>
                        </motion.div>
                      )}
                    </motion.button>
                  );
                })}
              </div>

              {/* Footer hint */}
              <div className="border-t border-white/10 px-5 py-3">
                <p className="text-center text-[11px] text-zinc-500">
                  Pick the one that resonates with your brand
                </p>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}

export { VARIANTS };
