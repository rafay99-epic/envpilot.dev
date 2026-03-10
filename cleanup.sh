#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

pick_dir() {
  for d in "$@"; do
    if [[ -d "$ROOT/$d" ]]; then
      echo "$ROOT/$d"
      return 0
    fi
  done
  return 1
}

rm_node_modules() {
  local dir="$1"
  local nm="$dir/node_modules"
  if [[ -d "$nm" ]]; then
    echo "Removing: $nm"
    rm -rf "$nm"
  else
    echo "Skip (not found): $nm"
  fi
}

# Remove node_modules in cli / vscode-extension / web (supports both layouts)
rm_node_modules "$(pick_dir cli apps/cli)"
rm_node_modules "$(pick_dir vscode-extension apps/vscode-extension)"
rm_node_modules "$(pick_dir web apps/web)"

# Remove root .env.local (and also .evn.local if that typo exists)
for f in ".env.local" ".evn.local"; do
  if [[ -f "$ROOT/$f" ]]; then
    echo "Removing: $ROOT/$f"
    rm -f "$ROOT/$f"
  else
    echo "Skip (not found): $ROOT/$f"
  fi
done

echo "Done."