#!/bin/bash
set -e

echo "========================================="
echo "  Envpilot CLI — Build & Deploy"
echo "========================================="
echo ""

# Check npm login
echo "Checking npm auth..."
if ! npm whoami &>/dev/null; then
  echo "Not logged in to npm. Opening browser for login..."
  npm login
  echo ""
fi

WHOAMI=$(npm whoami)
echo "Logged in as: $WHOAMI"
echo ""

# Build
echo "Building CLI..."
cd "$(dirname "$0")/../apps/cli"
bun run build
echo ""

# Show what will be published
echo "Package contents:"
npm pack --dry-run 2>&1
echo ""

# Confirm
read -p "Publish @envpilot/cli to npm? (y/N) " -n 1 -r
echo ""
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
  echo "Aborted."
  exit 0
fi

# Publish
npm publish --access public
echo ""
echo "Done! Published @envpilot/cli"
echo "View at: https://www.npmjs.com/package/@envpilot/cli"
