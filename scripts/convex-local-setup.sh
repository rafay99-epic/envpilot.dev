#!/usr/bin/env bash
set -euo pipefail

# ─────────────────────────────────────────────────────────────────────────────
# Local Convex bootstrap — run ONCE after switching to a local deployment.
#
# WHY: the cloud dev deployment burns the team's Database I/O quota; a local
# deployment runs on this machine (state in ~/.convex) and costs nothing.
#
# HOW TO SWITCH (two terminals):
#
#   Terminal 1:  bunx convex dev --configure existing --dev-deployment local
#       (On this CLI version, plain `--local` does NOT switch an already-
#       configured project.) First run configures a LOCAL deployment and rewrites the root
#       .env.local (CONVEX_DEPLOYMENT + NEXT_PUBLIC_CONVEX_URL) to point at
#       it. Keep this running — the local backend only exists while
#       `convex dev` is up. (A cloud-deployment backup of those two lines is
#       written by this script, see below.)
#
#   Terminal 2:  ./scripts/convex-local-setup.sh   (this script)
#       Pushes the env vars the backend needs (auth breaks without
#       WORKOS_CLIENT_ID), seeds tiers + feature registry, prints next steps.
#
#   Then:        bun run dev:web   — the site now talks to the local backend.
#       Sign in as usual (WorkOS auth works locally — the backend fetches
#       WorkOS's JWKS over the network). The database starts EMPTY: create
#       your org/projects fresh; nothing from the cloud dev DB carries over.
#
# SWITCHING BACK: restore the two lines from .env.local.cloud-backup into
# .env.local (or run `bunx convex dev` and pick the cloud dev deployment).
# ─────────────────────────────────────────────────────────────────────────────

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

DEPLOYMENT_LINE=$(grep -E "^CONVEX_DEPLOYMENT=" .env.local || true)
if [[ "$DEPLOYMENT_LINE" != *"local"* && "$DEPLOYMENT_LINE" != *"anonymous"* ]]; then
  echo "✗ .env.local does not point at a local deployment yet."
  echo "  Run 'bunx convex dev --configure existing --dev-deployment local' in another terminal first (keep it running)."
  exit 1
fi

# Snapshot the cloud settings once, so switching back is a two-line restore.
if [[ ! -f .env.local.cloud-backup ]]; then
  {
    echo "# Cloud dev deployment settings — restore these lines into .env.local to switch back"
    echo "CONVEX_DEPLOYMENT=dev:scrupulous-weasel-692"
    echo "NEXT_PUBLIC_CONVEX_URL=https://scrupulous-weasel-692.convex.cloud"
  } > .env.local.cloud-backup
  echo "→ wrote .env.local.cloud-backup (switch-back instructions)"
fi

env_from_dotenv() {
  grep -E "^$1=" .env.local | head -1 | cut -d= -f2- || true
}

echo "→ pushing backend env vars to the LOCAL deployment"
for var in WORKOS_CLIENT_ID WORKOS_API_KEY BILLING_WEBHOOK_BRIDGE_SECRET RESEND_API_KEY FROM_EMAIL; do
  value=$(env_from_dotenv "$var")
  if [[ -n "$value" ]]; then
    bunx convex env set "$var" "$value" >/dev/null
    echo "   ✓ $var"
  else
    echo "   – $var not in .env.local, skipped"
  fi
done

# Admin panel access: set ADMIN_EMAILS (comma-separated) on the deployment.
if ! bunx convex env get ADMIN_EMAILS >/dev/null 2>&1; then
  echo "   – ADMIN_EMAILS not set; set it to your email(s) to use the admin panel:"
  echo "     bunx convex env set ADMIN_EMAILS you@example.com"
else
  echo "   ✓ ADMIN_EMAILS (already set)"
fi

echo "→ seeding tiers, feature registry, and tier overrides"
# Internal entrypoint — runs with the deploy/dev key, no admin secret needed.
for migration in seed-tier-definitions seed-feature-registry seed-tier-features; do
  bunx convex run features/admin/migrations:run \
    "$(jq -cn --arg name "$migration" '{name: $name}')" >/dev/null
  echo "   ✓ $migration"
done

echo ""
echo "Local Convex is ready. Next:"
echo "  1. Keep 'bunx convex dev --local' running (terminal 1)."
echo "  2. bun run dev:web — the site now uses the local backend."
echo "  3. Sign in and create your org/projects fresh (local DB starts empty)."
echo "  4. Pro-tier your account for gated features:"
echo "     bunx convex run features/admin/e2e:ensureE2EUserPro '{\"email\":\"<your login email>\"}'"
echo "  Switch back: restore the two lines from .env.local.cloud-backup."
