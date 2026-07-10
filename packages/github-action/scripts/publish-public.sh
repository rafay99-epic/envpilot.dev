#!/usr/bin/env bash
# Publish the built action to the public mirror repo (rafay99-epic/envpilot-action).
#
# GitHub Actions must be resolved from a public repo tag (`uses: owner/repo@v1`),
# and the referenced repo must contain action.yml + a committed dist/ at that
# ref — it cannot pull from a private monorepo subdirectory for third-party
# consumers. This script copies the built artifacts from this package into a
# checkout of that public repo and commits them; it does NOT push or tag.
#
# DO NOT RUN THIS YET — the public repo (rafay99-epic/envpilot-action) does
# not exist yet. This script is here so the publish step is documented and
# ready once the repo is created.
#
# Usage:
#   1. Build first:        bun run build   (from packages/github-action)
#   2. Clone the public repo somewhere, e.g.:
#        git clone git@github.com:rafay99-epic/envpilot-action.git /tmp/envpilot-action
#   3. Run this script:
#        PUBLIC_REPO_DIR=/tmp/envpilot-action ./scripts/publish-public.sh
#   4. Review the diff in $PUBLIC_REPO_DIR, then push and tag:
#        cd "$PUBLIC_REPO_DIR"
#        git push origin main
#        git tag -f v1 && git push -f origin v1   # moving major tag
#        git tag "v$VERSION" && git push origin "v$VERSION"

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PACKAGE_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

if [[ -z "${PUBLIC_REPO_DIR:-}" ]]; then
  echo "error: PUBLIC_REPO_DIR is not set." >&2
  echo "Usage: PUBLIC_REPO_DIR=/path/to/envpilot-action-checkout $0" >&2
  exit 1
fi

if [[ ! -d "$PUBLIC_REPO_DIR/.git" ]]; then
  echo "error: PUBLIC_REPO_DIR ($PUBLIC_REPO_DIR) is not a git checkout." >&2
  exit 1
fi

if [[ ! -f "$PACKAGE_DIR/dist/index.js" ]]; then
  echo "error: dist/index.js is missing. Run 'bun run build' in $PACKAGE_DIR first." >&2
  exit 1
fi

VERSION="$(node -p "require('$PACKAGE_DIR/package.json').version")"

echo "Publishing @envpilot/github-action v$VERSION -> $PUBLIC_REPO_DIR"

rsync -a --delete "$PACKAGE_DIR/dist/" "$PUBLIC_REPO_DIR/dist/"
cp "$PACKAGE_DIR/action.yml" "$PUBLIC_REPO_DIR/action.yml"
cp "$PACKAGE_DIR/README.md" "$PUBLIC_REPO_DIR/README.md"
cp "$PACKAGE_DIR/LICENSE" "$PUBLIC_REPO_DIR/LICENSE"

pushd "$PUBLIC_REPO_DIR" >/dev/null
git add action.yml dist README.md LICENSE
if git diff --cached --quiet; then
  echo "Nothing changed — public repo is already at v$VERSION."
else
  git commit -m "release: v$VERSION"
  echo
  echo "Committed. Next steps (not run by this script):"
  echo "  cd \"$PUBLIC_REPO_DIR\""
  echo "  git push origin main"
  echo "  git tag -f v1 && git push -f origin v1   # move the major-version tag"
  echo "  git tag v$VERSION && git push origin v$VERSION"
fi
popd >/dev/null
