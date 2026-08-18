#!/usr/bin/env bash
#
# Cross-compile the static binaries the Dockerfile copies from.
#
# CGO_ENABLED=0 is the whole point: it produces a binary with no dynamic
# loader, so the same file runs in scratch, distroless, alpine and debian. Do
# not remove it to "fix" a build — a cgo binary silently reintroduces the libc
# dependency that made the first release unrunnable.
set -euo pipefail
cd "$(dirname "$0")"

VERSION=$(jq -r '.version' package.json)
LDFLAGS="-s -w -X main.version=${VERSION}"

for TARGET in amd64 arm64; do
  OUT="build/linux/${TARGET}/envpilot"
  mkdir -p "$(dirname "$OUT")"
  CGO_ENABLED=0 GOOS=linux GOARCH="$TARGET" \
    go build -trimpath -ldflags "$LDFLAGS" -o "$OUT" .
  echo "built $OUT ($(wc -c < "$OUT" | awk '{printf "%.1f MB", $1/1024/1024}'))"
done
