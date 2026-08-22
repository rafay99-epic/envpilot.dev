#!/usr/bin/env bash
set -euo pipefail

# Convex plus whichever app surfaces you name, and nothing else.
#
# `bun run dev:all` starts five Node processes at once (web, admin, blog,
# docs, convex). On a machine already running an editor and a browser that is
# enough to swap, and a wedged box takes the dev server down with it. Convex
# is always on because every surface talks to it; the rest is opt-in.
#
#   bun run dev              convex + web          (the daily pair)
#   bun run dev admin        convex + admin
#   bun run dev web docs     convex + web + docs
#   bun run dev:all          everything, the old behaviour
#
# Ctrl+C stops the whole group.

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

surfaces=("$@")
[ ${#surfaces[@]} -eq 0 ] && surfaces=(web)

# Ports are only used for the already-in-use check below. Admin runs on Vite's
# default; keep this in sync if a surface ever moves.
port_for() {
  case "$1" in
  web) echo 3000 ;;
  blog) echo 3001 ;;
  docs) echo 3002 ;;
  admin) echo 5173 ;;
  *) echo "" ;;
  esac
}

names=(convex)
commands=("bun --bun convex dev")
colors=(green)
palette=(blue magenta cyan yellow)

for surface in "${surfaces[@]}"; do
  case "$surface" in
  web | admin | blog | docs) ;;
  *)
    echo "✗ Unknown surface '$surface'. Pick from: web, admin, blog, docs." >&2
    exit 1
    ;;
  esac

  # A second server on an occupied port is the failure that starts as a
  # confusing 500 and ends with two full Next builds fighting for the machine.
  port="$(port_for "$surface")"
  if [ -n "$port" ] && lsof -iTCP:"$port" -sTCP:LISTEN -t >/dev/null 2>&1; then
    echo "✗ Port $port is already serving ($surface). Stop that process first:" >&2
    echo "    lsof -iTCP:$port -sTCP:LISTEN" >&2
    exit 1
  fi

  names+=("$surface")
  commands+=("bun run --cwd apps/$surface dev")
  colors+=("${palette[$(((${#names[@]} - 2) % ${#palette[@]}))]}")
done

# The symlinks Next reads env through. A fresh worktree has the root
# .env.local but not these, and every route 500s until they exist.
for app in web blog docs; do
  if [ ! -e "apps/$app/.env.local" ] && [ -f ".env.local" ]; then
    ln -s ../../.env.local "apps/$app/.env.local"
    echo "→ linked apps/$app/.env.local"
  fi
done

printf '→ starting: %s\n' "$(
  IFS=', '
  echo "${names[*]}"
)"

exec bunx --bun concurrently \
  --names "$(
    IFS=,
    echo "${names[*]}"
  )" \
  --prefix-colors "$(
    IFS=,
    echo "${colors[*]}"
  )" \
  --kill-others-on-fail \
  "${commands[@]}"
