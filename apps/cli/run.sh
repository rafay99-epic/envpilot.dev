#!/bin/bash
# Build and run envpilot CLI locally
# Usage: ./run.sh <command> [args...]
# Examples:
#   ./run.sh sync
#   ./run.sh pull --all
#   ./run.sh list linked
#   ./run.sh --help

cd "$(dirname "$0")" && bun run build --silent 2>/dev/null && node dist/index.js "$@"
