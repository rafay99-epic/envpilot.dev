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

if ! command -v envpilot > /dev/null 2>&1; then
  echo "envpilot: note - ${GLOBAL_BIN} is not on \$PATH in this build step." >&2
  echo "envpilot: it is normally on \$PATH for the container user at runtime." >&2
fi

echo "envpilot: ${VERSION_OUT} ready. Sign in with 'envpilot login'."
