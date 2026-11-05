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
if ! envpilot --version > /dev/null 2>&1; then
  echo "envpilot: installed, but 'envpilot --version' did not run." >&2
  exit 1
fi

echo "envpilot: $(envpilot --version) ready. Sign in with 'envpilot login'."
