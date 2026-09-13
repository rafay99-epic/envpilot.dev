#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"

VERSION=$(jq -r '.version' package.json)
LDFLAGS="-s -w -X main.version=${VERSION}"

PIDS=()
for TARGET in amd64 arm64; do
  (
    OUT="build/linux/${TARGET}/envpilot"
    mkdir -p "$(dirname "$OUT")"
    CGO_ENABLED=0 GOOS=linux GOARCH="$TARGET" \
      go build -trimpath -ldflags "$LDFLAGS" -o "$OUT" .
    echo "built $OUT ($(wc -c < "$OUT" | awk '{printf "%.1f MB", $1/1024/1024}'))"
  ) &
  PIDS+=($!)
done

for pid in "${PIDS[@]}"; do
  wait "$pid" || exit 1
done
