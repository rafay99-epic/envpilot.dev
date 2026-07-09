#!/usr/bin/env bash
# ------------------------------------------------------------------
# update-homebrew-formula.sh
#
# Downloads the npm-published tarball for the given version, computes
# its SHA256, and writes (or prints) a complete Homebrew formula.
#
# The formula is added to the EXISTING public tap
# (rafay99-epic/homebrew-apps), NOT a separate repo — so the main
# monorepo stays private.
#
# Usage:
#   ./update-homebrew-formula.sh <version> [--tap-dir <path>]
#
# With --tap-dir:  writes Formula/envpilot.rb directly into the tap
#                  checkout (use this in CI after cloning the tap).
# Without:         prints the formula to stdout (dry-run / local use).
# ------------------------------------------------------------------
set -euo pipefail

VERSION="${1:?Usage: $0 <version> [--tap-dir <path>]}"
TAP_DIR=""

if [ "${2:-}" = "--tap-dir" ] && [ -n "${3:-}" ]; then
  TAP_DIR="$3"
fi

NPM_TARBALL="https://registry.npmjs.org/@envpilot/cli/-/envpilot-cli-${VERSION}.tgz"

echo "==> Fetching tarball from npm registry ..." >&2
echo "    $NPM_TARBALL" >&2

SHA256="$(curl -sL "$NPM_TARBALL" | shasum -a 256 | cut -d' ' -f1)"
echo "    SHA256: $SHA256" >&2

# ---- Build the formula ---------------------------------------------------
# Uses the npm-registry tarball + Homebrew's `depends_on "node"` so the
# formula ships the same bytes that `npm install -g @envpilot/cli` would
# install. The main monorepo stays private — only the SHA256-verified
# tarball URL lives in the public formula.
read -r -d '' FORMULA << RUBY || true
class Envpilot < Formula
  desc "Envpilot CLI \u2014 sync and manage environment variables from the terminal"
  homepage "https://www.envpilot.dev"
  url "https://registry.npmjs.org/@envpilot/cli/-/envpilot-cli-${VERSION}.tgz"
  version "${VERSION}"
  sha256 "${SHA256}"
  license "UNLICENSED"

  depends_on "node"

  def install
    system "npm", "install", *std_npm_args
    bin.install_symlink libexec/"bin/envpilot"
  end

  test do
    assert_match version.to_s, shell_output("\#{bin}/envpilot --version")
  end
end
RUBY

# ---- Write or print -----------------------------------------------------
if [ -n "$TAP_DIR" ]; then
  FORMULA_DIR="$TAP_DIR/Formula"
  mkdir -p "$FORMULA_DIR"
  printf "%s\n" "$FORMULA" > "$FORMULA_DIR/envpilot.rb"
  echo "==> Written $FORMULA_DIR/envpilot.rb" >&2
else
  printf "%s\n" "$FORMULA"
fi
