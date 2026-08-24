#!/usr/bin/env bash
# Build the plugin against the LOCAL dev server with dev credentials baked in.
# Reads WORKOS_CLIENT_ID from the monorepo root .env.local (never echoes it).
set -euo pipefail

cd "$(dirname "$0")/.."

ROOT_ENV="$(cd ../.. && pwd)/.env.local"
if [[ ! -f "$ROOT_ENV" ]]; then
  echo "error: $ROOT_ENV not found — run 'bun run setup' first" >&2
  exit 1
fi

WORKOS_CLIENT_ID="${WORKOS_CLIENT_ID:-$(grep -E '^WORKOS_CLIENT_ID=' "$ROOT_ENV" | head -1 | cut -d= -f2- | tr -d '"' | tr -d "'")}"
if [[ -z "$WORKOS_CLIENT_ID" ]]; then
  echo "error: WORKOS_CLIENT_ID missing (env or root .env.local)" >&2
  exit 1
fi
export WORKOS_CLIENT_ID

export JAVA_HOME="${JAVA_HOME:-/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home}"
export ENVPILOT_SERVER_URL="${ENVPILOT_SERVER_URL:-http://localhost:3000}"

echo "building with server=$ENVPILOT_SERVER_URL (client id loaded)"
./gradlew buildPlugin "$@"
echo ""
echo "zip ready: $(pwd)/build/distributions/"
ls -1 build/distributions/
