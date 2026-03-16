#!/bin/bash
set -e

echo "========================================="
echo "  Envpilot — Full Build & Deploy"
echo "========================================="
echo ""

SCRIPTS_DIR="$(dirname "$0")"
ROOT_DIR="$SCRIPTS_DIR/.."

# Step 1: Verify everything
echo "[1/4] Running checks..."
cd "$ROOT_DIR"
bun run typecheck
bun run lint
echo ""

# Step 2: Build all
echo "[2/4] Building all packages..."
bun run build
echo ""

# Step 3: Deploy CLI
echo "[3/4] Deploying CLI..."
bash "$SCRIPTS_DIR/deploy-cli.sh"
echo ""

# Step 4: Deploy Extension
echo "[4/4] Deploying Extension..."
bash "$SCRIPTS_DIR/deploy-extension.sh"
echo ""

echo "========================================="
echo "  All deployments complete!"
echo "========================================="
