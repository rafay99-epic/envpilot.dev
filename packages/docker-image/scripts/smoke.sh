#!/usr/bin/env bash
#
# Build the Envpilot image locally and prove it works, without publishing
# anything and without touching any real Envpilot deployment.
#
#   ./scripts/smoke.sh              # against the throwaway stub API (default)
#   ./scripts/smoke.sh --dev        # against your local dev server on :3000
#
# --dev needs a DEV API key exported as ENVPILOT_TOKEN plus ENVPILOT_PROJECT
# and ENVPILOT_ENVIRONMENT. It talks to http://host.docker.internal:3000.
# It never talks to www.envpilot.dev: the default --api-url is overridden on
# every invocation below, so a missing flag fails loudly rather than silently
# reaching production.
#
# Nothing here pushes to a registry. The image is only ever --load-ed into the
# local daemon under a throwaway tag.

set -euo pipefail

cd "$(dirname "$0")/.."

MODE="stub"
[ "${1:-}" = "--dev" ] && MODE="dev"

TAG="envpilot-smoke:local"
STUB_PORT="${STUB_PORT:-41777}"
STUB_PID=""

cleanup() {
  [ -n "$STUB_PID" ] && kill "$STUB_PID" 2>/dev/null || true
  docker image rm -f "$TAG" probe-sh:local buildtime:local >/dev/null 2>&1 || true
  rm -rf /tmp/envpilot-smoke
}
trap cleanup EXIT

step() { printf '\n\033[1;34m── %s\033[0m\n' "$1"; }
ok() { printf '   \033[32m✓\033[0m %s\n' "$1"; }
die() {
  printf '   \033[31m✗ %s\033[0m\n' "$1"
  exit 1
}

command -v docker >/dev/null || die "docker is not installed or not running"

# ── Build ───────────────────────────────────────────────────────────────────

step "Compiling the binary"
bun run build
ok "linux/amd64 and linux/arm64 built"

step "Building the image (local only, never pushed)"
docker buildx build \
  --platform linux/amd64 \
  --build-arg VERSION="$(jq -r '.version' package.json)" \
  --load -t "$TAG" .
ok "$TAG loaded into the local daemon"

ACTUAL=$(docker run --rm "$TAG" --version)
EXPECTED=$(jq -r '.version' package.json)
[ "$ACTUAL" = "$EXPECTED" ] || die "image reports $ACTUAL, package.json says $EXPECTED"
ok "reports version $ACTUAL"

# ── Target API ──────────────────────────────────────────────────────────────

if [ "$MODE" = "stub" ]; then
  step "Starting the stub API on :$STUB_PORT"
  bun scripts/stub-api.ts &
  STUB_PID=$!
  for _ in $(seq 1 30); do
    curl -sf -o /dev/null "http://127.0.0.1:$STUB_PORT/healthz" && break
    sleep 0.2
  done
  curl -sf -o /dev/null "http://127.0.0.1:$STUB_PORT/healthz" || die "stub never came up"
  ok "stub ready"

  API_URL="http://127.0.0.1:$STUB_PORT"
  NET=(--network host)
  TOKEN="envpk_smoke"
  PROJECT="checkout"
  ENVIRONMENT="production"
  EXPECT_VAR="DB_URL='postgres"
else
  step "Targeting the LOCAL DEV server on :3000"
  : "${ENVPILOT_TOKEN:?set ENVPILOT_TOKEN to a DEV api key}"
  : "${ENVPILOT_PROJECT:?set ENVPILOT_PROJECT}"
  : "${ENVPILOT_ENVIRONMENT:?set ENVPILOT_ENVIRONMENT}"
  curl -sf -o /dev/null http://127.0.0.1:3000/api/version ||
    die "nothing answering on :3000 — start the dev server first"

  API_URL="http://host.docker.internal:3000"
  NET=(--add-host host.docker.internal:host-gateway)
  TOKEN="$ENVPILOT_TOKEN"
  PROJECT="$ENVPILOT_PROJECT"
  ENVIRONMENT="$ENVPILOT_ENVIRONMENT"
  EXPECT_VAR="="
  ok "dev server reachable"
fi

run() {
  docker run --rm "${NET[@]}" \
    -e ENVPILOT_TOKEN="$TOKEN" \
    -e ENVPILOT_PROJECT="$PROJECT" \
    -e ENVPILOT_ENVIRONMENT="$ENVIRONMENT" \
    -e ENVPILOT_API_URL="$API_URL" \
    "$@"
}

# ── The claim that matters: it runs in any base image ───────────────────────

step "Running inside every base image"
mkdir -p /tmp/envpilot-smoke
for BASE in alpine:3 python:3.12-slim golang:1.23 gcr.io/distroless/base-debian12; do
  printf 'FROM %s\nCOPY --from=%s /envpilot /usr/local/bin/envpilot\n' "$BASE" "$TAG" \
    >/tmp/envpilot-smoke/Dockerfile
  docker build -q -t probe:local /tmp/envpilot-smoke >/dev/null
  OUT=$(run --entrypoint /usr/local/bin/envpilot probe:local pull --quiet)
  echo "$OUT" | grep -q "$EXPECT_VAR" || die "$BASE returned nothing usable"
  ok "$BASE"
done

# ── Behaviour ───────────────────────────────────────────────────────────────

printf 'FROM alpine:3\nCOPY --from=%s /envpilot /usr/local/bin/envpilot\n' "$TAG" \
  >/tmp/envpilot-smoke/Dockerfile
docker build -q -t probe-sh:local /tmp/envpilot-smoke >/dev/null

step "exec behaviour"
# Take the first key the server actually returned and assert the child sees it
# set. Works against the stub and against a real dev project alike, without
# hardcoding a variable name that only exists in one of them.
FIRST_KEY=$(run --entrypoint /usr/local/bin/envpilot probe-sh:local pull --quiet |
  head -1 | cut -d= -f1)
[ -n "$FIRST_KEY" ] || die "the project returned no variables to test with"
run --entrypoint /usr/local/bin/envpilot probe-sh:local \
  exec --quiet -- sh -c "[ \"\${${FIRST_KEY}+set}\" = set ]" ||
  die "$FIRST_KEY never reached the child process"
ok "$FIRST_KEY reached the child process"

set +e
run --entrypoint /usr/local/bin/envpilot probe-sh:local exec --quiet -- sh -c 'exit 42'
CODE=$?
set -e
[ "$CODE" = "42" ] || die "exit code was $CODE, expected 42"
ok "exit code passes through"

set +e
run --entrypoint /usr/local/bin/envpilot probe-sh:local exec --quiet -- sh -c 'kill -TERM $$'
CODE=$?
set -e
[ "$CODE" = "143" ] || die "signal exit was $CODE, expected 143"
ok "SIGTERM reports 128+15"

step "Refusals"
set +e
docker run --rm "${NET[@]}" -e ENVPILOT_TOKEN=wrong -e ENVPILOT_PROJECT="$PROJECT" \
  -e ENVPILOT_ENVIRONMENT="$ENVIRONMENT" -e ENVPILOT_API_URL="$API_URL" \
  "$TAG" pull --quiet >/dev/null 2>&1
CODE=$?
set -e
[ "$CODE" = "1" ] || die "bad credential exited $CODE, expected 1"
ok "bad credential exits 1"

set +e
docker run --rm "${NET[@]}" -e ENVPILOT_PROJECT="$PROJECT" \
  -e ENVPILOT_ENVIRONMENT="$ENVIRONMENT" -e ENVPILOT_API_URL="$API_URL" \
  "$TAG" pull >/dev/null 2>&1
CODE=$?
set -e
[ "$CODE" = "2" ] || die "missing credential exited $CODE, expected 2"
ok "missing credential exits 2"

# ── Build-time mount, and proof the token does not survive ──────────────────

step "Build-time mount pattern"
printf '%s' "$TOKEN" >/tmp/envpilot-smoke/token
cat >/tmp/envpilot-smoke/Dockerfile <<EOF
# syntax=docker/dockerfile:1
FROM alpine:3
RUN --mount=type=secret,id=envpilot_token \\
    --mount=from=$TAG,source=/envpilot,target=/envpilot \\
    ENVPILOT_TOKEN_FILE=/run/secrets/envpilot_token \\
    ENVPILOT_API_URL=$API_URL \\
    /envpilot exec --project $PROJECT --env $ENVIRONMENT -- \\
      sh -c 'env | grep -q "=" && touch /built'
EOF
docker build --network host \
  --secret id=envpilot_token,src=/tmp/envpilot-smoke/token \
  -q -t buildtime:local /tmp/envpilot-smoke >/dev/null
ok "secrets reached the build"

docker history --no-trunc buildtime:local | grep -q "$TOKEN" &&
  die "the credential leaked into image history"
ok "credential is not in image history"

docker run --rm --entrypoint /bin/sh buildtime:local -c 'ls /run/secrets' >/dev/null 2>&1 &&
  die "the secret mount survived into the image"
ok "secret mount did not survive into the image"

printf '\n\033[1;32mAll checks passed. Nothing was published.\033[0m\n'
