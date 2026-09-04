#!/usr/bin/env bash
#
# Build and run the CLI without ever touching production.
#
# WHY THIS EXISTS
# The developer has the real @envpilot/cli installed globally and logged in to
# production. Two things have to be impossible:
#
#   1. A dev build reading or writing the production login. `conf` locates that
#      config through $HOME, so the run must have a throwaway $HOME. A dev build
#      that reaches the production login tries to WorkOS-refresh the stored
#      token, fails, and WIPES the account. That has happened once.
#   2. A build reading the production working folder. Build values come from
#      scripts/sandbox.env and nowhere else. There is no fallback to the repo's
#      .env.local, to ~/Code, or to the ambient environment, because a fallback
#      is the thing that quietly reintroduces the problem.
#
# Both are enforced below rather than documented and hoped for. The script also
# fingerprints the production config before and after and aborts if it changed.
#
# USAGE
#   scripts/sandbox.sh build              build the CLI
#   scripts/sandbox.sh build-extension    build the VS Code extension
#   scripts/sandbox.sh build-jetbrains    build the JetBrains plugin zip
#   scripts/sandbox.sh doctor             build if needed, then run
#   scripts/sandbox.sh run -- bun dev     any envpilot command
#   scripts/sandbox.sh shell              a subshell with the sandbox HOME
#   scripts/sandbox.sh reset              wipe the sandbox home
#
set -euo pipefail

CLI_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="$CLI_DIR/scripts/sandbox.env"
REAL_HOME="${HOME:?HOME must be set}"

die() {
  printf '\033[31m✗ %s\033[0m\n' "$1" >&2
  shift
  for line in "$@"; do printf '  %s\n' "$line" >&2; done
  exit 1
}
note() { printf '\033[2m→ %s\033[0m\n' "$1" >&2; }

# ── Production tripwire ─────────────────────────────────────────────────────
# Fingerprint the real config so an accidental write is caught, not discovered
# weeks later when a login stops working.
PROD_CONFIG="$REAL_HOME/Library/Preferences/envpilot-nodejs/config.json"
[[ "$(uname -s)" == "Linux" ]] && PROD_CONFIG="${XDG_CONFIG_HOME:-$REAL_HOME/.config}/envpilot-nodejs/config.json"

fingerprint_prod() {
  [[ -f "$PROD_CONFIG" ]] || { echo "absent"; return; }
  shasum -a 256 "$PROD_CONFIG" 2>/dev/null | cut -d' ' -f1
}
PROD_BEFORE="$(fingerprint_prod)"

check_prod_untouched() {
  local after
  after="$(fingerprint_prod)"
  if [[ "$after" != "$PROD_BEFORE" ]]; then
    die "PRODUCTION CLI CONFIG CHANGED during this sandbox run." \
      "That must never happen. Restore it from:" \
      "  $PROD_CONFIG.pre-multiaccount.bak" \
      "and report this, because the isolation has a hole."
  fi
}
trap check_prod_untouched EXIT

# ── Sandbox env file ────────────────────────────────────────────────────────
if [[ ! -f "$ENV_FILE" ]]; then
  die "No sandbox env file at scripts/sandbox.env" \
    "Create it (it is gitignored) and fill in the two PUBLIC build values:" \
    "  cp apps/cli/scripts/sandbox.env.example apps/cli/scripts/sandbox.env" \
    "" \
    "This script deliberately has NO fallback to .env.local or to your" \
    "production working folder. Populating that file is the only way in."
fi

# Read ONLY the keys we expect, and only from this file. `source` would let a
# stray line in that file export anything it liked into the build.
read_key() {
  sed -n "s/^[[:space:]]*$1[[:space:]]*=[[:space:]]*//p" "$ENV_FILE" | tail -1 | tr -d '"'"'"'\r'
}
SB_CLIENT_ID="$(read_key WORKOS_CLIENT_ID)"
SB_CONVEX_URL="$(read_key NEXT_PUBLIC_CONVEX_URL)"
SB_HOME="$(read_key ENVPILOT_SANDBOX_HOME)"
SB_API_URL="$(read_key ENVPILOT_SANDBOX_API_URL)"
SB_SERVER_URL="$(read_key ENVPILOT_SERVER_URL)"
SB_JAVA_HOME="$(read_key JAVA_HOME)"
SB_HOME="${SB_HOME:-/tmp/envpilot-sandbox}"

[[ -n "$SB_CLIENT_ID" && "$SB_CLIENT_ID" != "client_replace_me" ]] ||
  die "WORKOS_CLIENT_ID is unset or still the placeholder in scripts/sandbox.env"
[[ -n "$SB_CONVEX_URL" && "$SB_CONVEX_URL" != *replace-me* ]] ||
  die "NEXT_PUBLIC_CONVEX_URL is unset or still the placeholder in scripts/sandbox.env"

# ── Home isolation, enforced ────────────────────────────────────────────────
case "$SB_HOME" in
  "$REAL_HOME" | "$REAL_HOME"/*)
    die "ENVPILOT_SANDBOX_HOME is inside your real home ($SB_HOME)." \
      "That defeats the isolation. Use a path under /tmp." ;;
  /*) ;;
  *) die "ENVPILOT_SANDBOX_HOME must be an absolute path, got: $SB_HOME" ;;
esac
mkdir -p "$SB_HOME"

# ── Commands ────────────────────────────────────────────────────────────────
build() {
  note "building CLI with sandbox values (convex: $SB_CONVEX_URL)"
  # env -i so NOTHING ambient reaches the build. Only PATH, a temp HOME and the
  # two public values the bundler bakes in. An inherited WORKOS_* or
  # NEXT_PUBLIC_CONVEX_URL from the caller's shell cannot leak into the artifact.
  env -i \
    PATH="$PATH" \
    HOME="$SB_HOME" \
    WORKOS_CLIENT_ID="$SB_CLIENT_ID" \
    NEXT_PUBLIC_CONVEX_URL="$SB_CONVEX_URL" \
    bash -c "cd '$CLI_DIR' && bun run build"

  # The build is worthless if the values did not actually land in the artifact.
  grep -q "$SB_CONVEX_URL" "$CLI_DIR"/dist/*.js ||
    die "Build finished but the Convex URL is not in the artifact." \
      "The bundler did not receive the sandbox values."
  note "built: $CLI_DIR/dist/index.js"
}

# The extension bakes the same two public values through esbuild `define`, so it
# gets the same treatment: values from sandbox.env only, nothing ambient.
build_extension() {
  local ext_dir
  ext_dir="$(cd "$CLI_DIR/../vscode-extension" && pwd)"
  note "building extension with sandbox values (convex: $SB_CONVEX_URL)"
  env -i \
    PATH="$PATH" \
    HOME="$SB_HOME" \
    WORKOS_CLIENT_ID="$SB_CLIENT_ID" \
    NEXT_PUBLIC_CONVEX_URL="$SB_CONVEX_URL" \
    ENVPILOT_SERVER_URL="${SB_SERVER_URL:-$SB_API_URL}" \
    bash -c "cd '$ext_dir' && node scripts/build.mjs"
  note "built: $ext_dir/dist"
}

# The JetBrains plugin bakes the same values through generateBuildConfig. Gradle
# keeps its dependency cache in the real ~/.gradle (not production data), and
# needs a JDK 21; java_home finds none on this machine, so the path is explicit.
build_jetbrains() {
  local jb_dir jdk
  jb_dir="$(cd "$CLI_DIR/../jetbrains-plugin" && pwd)"
  jdk="${SB_JAVA_HOME:-/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home}"
  [[ -x "$jdk/bin/java" ]] || die "No JDK at $jdk" "Set JAVA_HOME in scripts/sandbox.env to a JDK 21."
  note "building JetBrains plugin with sandbox values (convex: $SB_CONVEX_URL)"
  env -i \
    PATH="$PATH" \
    HOME="$SB_HOME" \
    JAVA_HOME="$jdk" \
    GRADLE_USER_HOME="$REAL_HOME/.gradle" \
    WORKOS_CLIENT_ID="$SB_CLIENT_ID" \
    NEXT_PUBLIC_CONVEX_URL="$SB_CONVEX_URL" \
    ENVPILOT_SERVER_URL="${SB_SERVER_URL:-$SB_API_URL}" \
    bash -c "cd '$jb_dir' && ./gradlew -Porg.gradle.java.installations.paths='$jdk' buildPlugin"
  note "built: $jb_dir/build/distributions"
}

run_cli() {
  [[ -f "$CLI_DIR/dist/index.js" ]] || build
  note "sandbox config=$SB_HOME/config (production config untouched)"
  # ENVPILOT_CONFIG_DIR, NOT HOME. Overriding HOME isolates envpilot's config
  # but every child inherits it, so `run -- bun run dev` sent convex looking
  # for ~/.convex in an empty directory and it exited 1. The child needs the
  # real home; only envpilot needs the sandbox.
  #
  # Runs from the CALLER's directory so `doctor` and `run` see the repo you
  # are actually in.
  ENVPILOT_CONFIG_DIR="$SB_HOME/config" \
  ENVPILOT_SANDBOX=1 \
    node "$CLI_DIR/dist/index.js" "$@"
}

case "${1-}" in
  build) build ;;
  build-extension) build_extension ;;
  build-jetbrains) build_jetbrains ;;
  reset)
    [[ "$SB_HOME" == /tmp/* ]] || die "Refusing to delete $SB_HOME (not under /tmp)"
    rm -rf "$SB_HOME"
    note "wiped $SB_HOME" ;;
  shell)
    note "subshell using the sandbox envpilot config. Type exit to leave."
    ENVPILOT_CONFIG_DIR="$SB_HOME/config" "${SHELL:-/bin/bash}" ;;
  "") die "Nothing to do." "Try: scripts/sandbox.sh doctor" ;;
  *) run_cli "$@" ;;
esac
