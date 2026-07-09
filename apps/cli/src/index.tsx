#!/usr/bin/env node

import { initSentry, captureError, flushSentry } from "./lib/sentry.js";
import { createProgram } from "./lib/program.js";
import { openTUI, isInteractiveTerminal } from "./ui/render-tui.js";

initSentry();

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const shouldOpenTUI =
    process.env.ENVPILOT_TUI_CHILD !== "1" &&
    args.length === 0 &&
    isInteractiveTerminal();

  if (shouldOpenTUI) {
    await openTUI();
  } else {
    const program = createProgram();
    await program.parseAsync();
  }
}

// Run inside a function (not top-level await) so an empty event loop can never
// surface a "Detected unsettled top-level await" warning to users.
main().catch(async (err) => {
  console.error(err);
  // Commands report their own errors via handleError(); anything landing
  // here escaped that path entirely, so report before exiting.
  captureError(err, { phase: "top-level" });
  await flushSentry();
  process.exit(1);
});
