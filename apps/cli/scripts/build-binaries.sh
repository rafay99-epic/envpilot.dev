#!/usr/bin/env bash
set -euo pipefail

# Build standalone binaries for all supported platforms using bun compile.
# Usage: ./scripts/build-binaries.sh [version]
# Outputs binaries to apps/cli/binaries/

VERSION="${1:-$(node -p "require('./package.json').version")}"
OUTDIR="binaries"

echo "Building envpilot v${VERSION} binaries..."

rm -rf "$OUTDIR"
mkdir -p "$OUTDIR"

# Build the JS bundle first (tsup)
bun run build

TARGETS=(
  "bun-linux-x64"
  "bun-linux-arm64"
  "bun-darwin-arm64"
  "bun-darwin-x64"
  "bun-windows-x64"
)

NAMES=(
  "envpilot-linux-x64"
  "envpilot-linux-arm64"
  "envpilot-darwin-arm64"
  "envpilot-darwin-x64"
  "envpilot-windows-x64.exe"
)

for i in "${!TARGETS[@]}"; do
  target="${TARGETS[$i]}"
  name="${NAMES[$i]}"
  echo "  Compiling ${name}..."
  bun build dist/index.js --compile --target="${target}" --outfile "${OUTDIR}/${name}" 2>&1 | tail -1
done

# Create checksums
echo "  Generating checksums..."
cd "$OUTDIR"
shasum -a 256 envpilot-* > checksums.txt
cd ..

echo ""
echo "Binaries built in ${OUTDIR}/:"
ls -lh "$OUTDIR"/
