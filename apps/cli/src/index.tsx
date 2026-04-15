#!/usr/bin/env node

import { initSentry } from "./lib/sentry.js";
import { createProgram } from "./lib/program.js";
import { openTUI } from "./ui/render-tui.js";

initSentry();

const args = process.argv.slice(2);
const shouldOpenTUI =
  process.env.ENVPILOT_TUI_CHILD !== "1" && args.length === 0;

if (shouldOpenTUI) {
  await openTUI();
} else {
  const program = createProgram();
  await program.parseAsync();
}
