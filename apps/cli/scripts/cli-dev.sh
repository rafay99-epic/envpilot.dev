#!/usr/bin/env bash
#
# Isolated dev runner for the new WorkOS device-flow CLI.
#
# WHY: the CLI stores accounts/tokens in a global config that `conf` locates via
# $HOME (~/Library/Preferences/envpilot-nodejs on macOS). This wrapper points
# $HOME at a throwaway directory so the dev build NEVER reads or writes your
# real production login. It also runs from a scratch working directory so the
# per-directory `.envpilot` link state stays out of the repo.
#
# The dev build talks to the DEV Convex deployment (baked in at build time) and,
# for the vault value routes, to whatever `apiUrl` you set below — point it at
# your local dev server, NOT production.
#
# USAGE:
#   apps/cli/scripts/cli-dev.sh login
#   apps/cli/scripts/cli-dev.sh whoami
#   apps/cli/scripts/cli-dev.sh list orgs
#   ... any envpilot command ...
#
# One-time (already done by setup, safe to re-run): point vault routes at local
#   apps/cli/scripts/cli-dev.sh config set apiUrl http://localhost:3000
#
# To wipe the sandbox and start fresh: rm -rf "${ENVPILOT_DEV_HOME:-/tmp/envpilot-dev-home}"

set -euo pipefail

# Resolve the built binary to an ABSOLUTE path BEFORE changing directory.
DIST="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/dist/index.js"
if [[ ! -f "$DIST" ]]; then
  echo "Build the CLI first: (cd apps/cli && bun run build)" >&2
  exit 1
fi

# Isolated, throwaway HOME → isolated global config. Override with ENVPILOT_DEV_HOME.
export HOME="${ENVPILOT_DEV_HOME:-/tmp/envpilot-dev-home}"
mkdir -p "$HOME"

# Scratch working directory so `.envpilot` link state never lands in the repo.
WORKDIR="$HOME/workdir"
mkdir -p "$WORKDIR"
cd "$WORKDIR"

exec node "$DIST" "$@"
