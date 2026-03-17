"use client";

import type { ReactNode } from "react";
import { useGlobalNavShortcuts } from "@/hooks/useKeyboardShortcuts";
import { ShortcutsHelpDialog } from "./shortcuts-help-dialog";
import { KeyboardShortcutsLoader } from "./keyboard-shortcuts-loader";

function GlobalShortcuts() {
  useGlobalNavShortcuts();
  return null;
}

export function KeyboardShortcutsProvider({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <>
      <KeyboardShortcutsLoader />
      <GlobalShortcuts />
      <ShortcutsHelpDialog />
      {children}
    </>
  );
}
