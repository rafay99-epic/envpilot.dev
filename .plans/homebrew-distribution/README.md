# Homebrew Distribution

Distribute the `envpilot` CLI via Homebrew while keeping the monorepo **private**.

## Architecture

| Concept              | Choice                                                        | Reason                                                             |
| -------------------- | ------------------------------------------------------------- | ------------------------------------------------------------------ |
| **Tap repo**         | `rafay99-epic/homebrew-apps` (existing public tap)            | Already has `Formula/cvx.rb` + multiple casks — no new repo needed |
| **Download source**  | npm registry tarball (`registry.npmjs.org/@envpilot/cli/...`) | Always public, no auth needed, no source leak                      |
| **Integrity**        | SHA256 computed in CI from the same tarball                   | Tamper-proof; verified by `brew install`                           |
| **CI trigger**       | After `deploy-cli` publishes to npm                           | Atomic: npm must succeed first                                     |
| **Formula approach** | `npm install` via `std_npm_args`                              | Standard Homebrew pattern for npm CLIs                             |

## Flow (main branch push with CLI changes)

```
main push (CLI changes)
  → CI quality checks
  → build-cli (npm pack — used for GitHub Release)
  → deploy-cli: npm publish (bun publish --ignore-scripts --access public)
  → deploy-homebrew (only if published == true):
      1. Compute SHA256 of npm tarball for this version
      2. Clone rafay99-epic/homebrew-apps (via PAT)
      3. Write Formula/envpilot.rb
      4. Commit + push + tag (envpilot-v{version})
  → GitHub Release with Homebrew install in notes
```

## Files created

| File                                          | Purpose                                               |
| --------------------------------------------- | ----------------------------------------------------- |
| `apps/cli/scripts/update-homebrew-formula.sh` | Generates `envpilot.rb` from the npm tarball (SHA256) |
| `.github/workflows/deploy-homebrew.yml`       | Reusable workflow: clones tap, runs script, pushes    |
| `.plans/homebrew-distribution/README.md`      | This document                                         |

## Modified files

| File                       | Change                                                                                     |
| -------------------------- | ------------------------------------------------------------------------------------------ |
| `.github/workflows/ci.yml` | Added `deploy-homebrew` job (after `deploy-cli`), added to `release` needs + release notes |

## Prerequisites

1. **Ensure `HOMEBREW_TAP_PAT` secret exists** — a GitHub PAT with `contents:write`
   scope on `rafay99-epic/homebrew-apps`. No new repo needed.
2. Nothing else — `homebrew-apps` is already public.

## User install

Users who already tapped can just `brew upgrade envpilot`. First-time install:

```bash
brew install rafay99-epic/apps/envpilot
```

Or with an explicit tap:

```bash
brew tap rafay99-epic/apps
brew install envpilot
```

## Formula anatomy

```ruby
class Envpilot < Formula
  url "https://registry.npmjs.org/@envpilot/cli/-/envpilot-cli-{version}.tgz"
  sha256 "{sha256}"
  depends_on "node"

  def install
    system "npm", "install", *std_npm_args
    bin.install_symlink libexec/"bin/envpilot"
  end

  test do
    assert_match version.to_s, shell_output("#{bin}/envpilot --version")
  end
end
```

Uses `npm install` internally — Homebrew resolves `node` from its own `depends_on "node"`. The SHA256 matches the npm tarball bytes verbatim.

## Security model

- **SHA256 verification:** `curl -sL <tarball> | shasum -a 256` in CI — same bytes npm serves. Tampered tarball → checksum mismatch → `brew install` errors.
- **No source leak:** Only the tarball URL and checksum live in the public formula. The monorepo stays private.
- **PAT scoped:** `HOMEBREW_TAP_PAT` needs only `contents:write` on `homebrew-apps`.

## Edge cases

| Scenario                    | Behaviour                                                                       |
| --------------------------- | ------------------------------------------------------------------------------- |
| npm publish fails           | `deploy-homebrew` never runs (`published == true` guard)                        |
| Same version already on tap | `git diff --quiet` skips the push — no empty commits                            |
| Tag collision on tap        | Prefixed with `envpilot-` (`envpilot-v1.14.0`), guarded by `if ! git rev-parse` |
| PAT rotation                | Only need the single `HOMEBREW_TAP_PAT` secret                                  |
