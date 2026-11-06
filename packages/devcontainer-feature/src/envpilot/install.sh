#!/usr/bin/env bash
# Installs the Envpilot CLI into a dev container.
#
# Why this feature exists: a fresh container has no .env file, because .env is
# gitignored. Without a way to fetch the environment, the first thing anyone
# (or any agent) does in a new Codespace is ask a human to paste secrets into
# a chat. With the CLI present, `envpilot pull` or `envpilot run --` does it.
#
# The option id `version` arrives as $VERSION: the spec uppercases option ids
# and writes them to devcontainer-features.env before this script runs.
set -euo pipefail

VERSION="${VERSION:-latest}"

if ! command -v npm > /dev/null 2>&1; then
  echo "envpilot: npm was not found." >&2
  echo "envpilot: this feature installs an npm package, so add the node feature first:" >&2
  echo 'envpilot:   "ghcr.io/devcontainers/features/node:1": {}' >&2
  echo "envpilot: installsAfter only orders features that are already requested; it does not add one." >&2
  exit 1
fi

echo "envpilot: installing @envpilot/cli@${VERSION}"
npm install -g "@envpilot/cli@${VERSION}"

# Fail the build rather than hand over a container with a broken binary.
#
# The global bin directory is not always on $PATH while a Feature runs: base
# images differ on whether npm's prefix is /usr/local or a user-local path, so
# a plain `envpilot --version` can fail for a CLI that installed correctly.
# Resolve the prefix and look there.
GLOBAL_BIN="$(npm prefix -g 2>/dev/null)/bin"
if [ -x "${GLOBAL_BIN}/envpilot" ]; then
  ENVPILOT_BIN="${GLOBAL_BIN}/envpilot"
elif command -v envpilot > /dev/null 2>&1; then
  ENVPILOT_BIN="$(command -v envpilot)"
else
  echo "envpilot: installed, but no envpilot binary was found." >&2
  echo "envpilot: looked in ${GLOBAL_BIN} and on \$PATH." >&2
  exit 1
fi

if ! VERSION_OUT="$("$ENVPILOT_BIN" --version 2>&1)"; then
  echo "envpilot: found ${ENVPILOT_BIN}, but --version did not run:" >&2
  echo "envpilot: ${VERSION_OUT}" >&2
  exit 1
fi

# Make it reachable rather than hope. A user-local npm prefix is not
# necessarily on the container user's PATH at runtime, which would leave
# `envpilot` as "command not found" in the Codespace even though the install
# succeeded. install.sh runs as root, so link it somewhere that always is.
#
# A failure here is fatal: reporting a successful install while the binary is
# unreachable is the kind of quiet half-success this Feature should not ship.
LINK_DIR=/usr/local/bin
LINK_PATH="${LINK_DIR}/envpilot"

if [ "$ENVPILOT_BIN" = "$LINK_PATH" ]; then
  : # Already installed exactly where we would link it.
elif [ -e "$LINK_PATH" ] && [ ! -L "$LINK_PATH" ]; then
  # Something else owns this path. Replacing a real binary from another
  # install silently would be worse than leaving it alone.
  echo "envpilot: ${LINK_PATH} already exists and is not a symlink; leaving it alone." >&2
  echo "envpilot: using ${ENVPILOT_BIN}. Ensure it is on PATH for the container user." >&2
else
  mkdir -p "$LINK_DIR"
  # -n as well as -f: without it, a destination symlink pointing at a
  # directory is FOLLOWED, so the link lands inside that directory and the
  # command succeeds while envpilot stays unusable.
  if ! ln -sfn "$ENVPILOT_BIN" "$LINK_PATH"; then
    echo "envpilot: could not link ${ENVPILOT_BIN} to ${LINK_PATH}." >&2
    echo "envpilot: refusing to report a successful install for a binary the container cannot run." >&2
    exit 1
  fi
  echo "envpilot: linked ${ENVPILOT_BIN} to ${LINK_PATH}"
fi

echo "envpilot: ${VERSION_OUT} ready. Sign in with 'envpilot login'."
