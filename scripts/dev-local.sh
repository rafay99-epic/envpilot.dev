#!/usr/bin/env bash
set -euo pipefail

# Full local dev stack: web + LOCAL Convex backend + admin panel.
#
# Requires a ONE-TIME interactive switch first (the Convex CLI prompts for
# the project, so it can't be automated here):
#
#   bunx convex dev --configure existing --dev-deployment local
#
# That writes CONVEX_DEPLOYMENT=local:... into .env.local; afterwards plain
# `convex dev` keeps using the local deployment and this script just runs
# the trio. Switch back to cloud by restoring the two lines from
# .env.local.cloud-backup.

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

DEPLOYMENT=$(grep -E "^CONVEX_DEPLOYMENT=" .env.local | cut -d= -f2- || true)
case "$DEPLOYMENT" in
  local:* | anonymous:*) ;;
  *)
    echo "✗ CONVEX_DEPLOYMENT in .env.local is '${DEPLOYMENT:-<missing>}' — not a local deployment."
    echo "  One-time setup (interactive, pick the envpilot project when prompted):"
    echo "    bunx convex dev --configure existing --dev-deployment local"
    echo "  Then Ctrl+C it and re-run: bun run dev:local"
    exit 1
    ;;
esac

exec bunx concurrently --names web,convex,admin --prefix-colors blue,green,magenta \
  "turbo dev --filter=@envpilot/web" \
  "convex dev" \
  "turbo dev --filter=@envpilot/admin"
