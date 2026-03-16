#!/bin/bash
set -e

echo "========================================="
echo "  Envpilot VS Code Extension — Build & Deploy"
echo "========================================="
echo ""

cd "$(dirname "$0")/../apps/vscode-extension"

# Check vsce is installed
if ! command -v vsce &>/dev/null; then
  echo "Installing @vscode/vsce..."
  npm i -g @vscode/vsce
  echo ""
fi

# Check login
echo "Checking VS Code Marketplace auth..."
if ! vsce ls-publishers 2>/dev/null | grep -q .; then
  echo "Not logged in. You need a Personal Access Token from:"
  echo "  https://dev.azure.com → User Settings → Personal Access Tokens"
  echo "  Scopes: Marketplace (Manage)"
  echo ""
  read -p "Enter your publisher name: " PUBLISHER
  vsce login "$PUBLISHER"
  echo ""
fi

# Build
echo "Building extension..."
bun run build
echo ""

# Package
echo "Packaging .vsix..."
vsce package
echo ""

VSIX=$(ls -t *.vsix | head -1)
echo "Created: $VSIX"
echo ""

# Confirm
read -p "Publish to VS Code Marketplace? (y/N) " -n 1 -r
echo ""
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
  echo "Aborted. You can install locally with:"
  echo "  code --install-extension $VSIX"
  exit 0
fi

# Publish
vsce publish
echo ""
echo "Done! Extension published to VS Code Marketplace."
