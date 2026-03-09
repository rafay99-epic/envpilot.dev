#!/usr/bin/env bash
set -euo pipefail

# Envpilot CLI installer
# Usage: curl -fsSL https://raw.githubusercontent.com/YOUR_ORG/envpilot/main/apps/cli/scripts/install.sh | bash

REPO="YOUR_ORG/envpilot"
INSTALL_DIR="${ENVPILOT_INSTALL_DIR:-/usr/local/bin}"
BINARY_NAME="envpilot"

# Detect platform
detect_platform() {
  local os arch

  os="$(uname -s)"
  arch="$(uname -m)"

  case "$os" in
    Linux)  os="linux" ;;
    Darwin) os="darwin" ;;
    MINGW*|MSYS*|CYGWIN*) os="windows" ;;
    *) echo "Error: Unsupported OS: $os" >&2; exit 1 ;;
  esac

  case "$arch" in
    x86_64|amd64) arch="x64" ;;
    aarch64|arm64) arch="arm64" ;;
    *) echo "Error: Unsupported architecture: $arch" >&2; exit 1 ;;
  esac

  echo "${os}-${arch}"
}

# Get latest version from GitHub releases
get_latest_version() {
  local version
  version=$(curl -fsSL "https://api.github.com/repos/${REPO}/releases/latest" \
    | grep '"tag_name"' \
    | sed -E 's/.*"tag_name": *"cli-v([^"]+)".*/\1/')

  if [ -z "$version" ]; then
    echo "Error: Could not determine latest version" >&2
    exit 1
  fi
  echo "$version"
}

main() {
  local platform version url tmp_dir binary_path extension=""

  platform="$(detect_platform)"
  version="${ENVPILOT_VERSION:-$(get_latest_version)}"

  if [[ "$platform" == windows-* ]]; then
    extension=".exe"
  fi

  echo "Installing envpilot v${version} (${platform})..."

  url="https://github.com/${REPO}/releases/download/cli-v${version}/envpilot-${platform}${extension}"
  tmp_dir="$(mktemp -d)"
  binary_path="${tmp_dir}/${BINARY_NAME}${extension}"

  # Download
  echo "  Downloading from ${url}..."
  if ! curl -fsSL "$url" -o "$binary_path"; then
    echo "Error: Download failed. Check that the release exists for your platform." >&2
    rm -rf "$tmp_dir"
    exit 1
  fi

  # Verify checksum if available
  local checksums_url="https://github.com/${REPO}/releases/download/cli-v${version}/checksums.txt"
  local checksums_file="${tmp_dir}/checksums.txt"
  if curl -fsSL "$checksums_url" -o "$checksums_file" 2>/dev/null; then
    echo "  Verifying checksum..."
    local expected_hash actual_hash
    expected_hash=$(grep "envpilot-${platform}${extension}" "$checksums_file" | awk '{print $1}')
    actual_hash=$(shasum -a 256 "$binary_path" | awk '{print $1}')
    if [ "$expected_hash" != "$actual_hash" ]; then
      echo "Error: Checksum verification failed!" >&2
      rm -rf "$tmp_dir"
      exit 1
    fi
  fi

  # Install
  chmod +x "$binary_path"

  if [ -w "$INSTALL_DIR" ]; then
    mv "$binary_path" "${INSTALL_DIR}/${BINARY_NAME}${extension}"
  else
    echo "  Installing to ${INSTALL_DIR} (requires sudo)..."
    sudo mv "$binary_path" "${INSTALL_DIR}/${BINARY_NAME}${extension}"
  fi

  rm -rf "$tmp_dir"

  echo ""
  echo "envpilot v${version} installed to ${INSTALL_DIR}/${BINARY_NAME}${extension}"
  echo ""
  echo "Get started:"
  echo "  envpilot login"
  echo "  envpilot init"
  echo "  envpilot pull"
}

main
