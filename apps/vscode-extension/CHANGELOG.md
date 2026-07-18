# Changelog

All notable changes to the Envpilot VS Code extension are documented here.

## 1.16.0 — 2026-07-18

### Added

- **Clipboard lockdown** — copy/cut is now blocked in every Envpilot-managed
  .env file for all roles by default. New setting
  `envpilot.clipboardGuard.scope`: `all-managed` (default), `readonly-roles`
  (previous behavior), or `off`. Applies live, no reload needed. The
  "Copy With Syntax Highlighting" command is now covered too, and protection
  is re-armed at startup, follows file renames, and resolves symlinked or
  differently-cased paths.
- **Value cloaking** — secret values in managed .env files render as masked
  bullets (`envpilot.cloakValues`, default on). New commands:
  `Envpilot: Toggle Cloaking` and `Envpilot: Reveal values` (shows values for
  30 seconds, then re-masks). Note: the editor minimap, peek, and diff views
  render raw text — cloaking is a visual deterrent, not a security boundary.
- **Secret-name autocomplete** — variable names from your linked project
  complete inside env accessors (`process.env.`, `os.environ`, `ENV[`,
  `getenv(...)`, and more) across 13 languages. Names only, never values,
  served from the local metadata cache. `envpilot.autocomplete.enable`
  (default on). Portions derived from DopplerHQ/vscode (Apache-2.0) — see
  THIRD_PARTY_NOTICES.md.
- **Masked hover** — hovering an env reference shows the project,
  environments, and a masked value with a role-gated "Reveal value" action.
  `envpilot.hover.enable` (default on).

### Fixed

- Remote variable changes no longer trigger a false "You cannot edit it
  directly" warning and redundant re-sync for read-only roles.
- Variable changes made while the window was idle-paused (or during any
  subscription refresh) are no longer silently skipped — the local .env
  catches up on resume.
- Multi-root workspaces: linked projects in any workspace folder are restored
  on activation, not just the first folder.
- Env file writes are now atomic (temp file + rename) and serialized per
  project and directory — concurrent syncs can no longer corrupt the managed
  file manifest or fail with permission errors. Stale temp files are cleaned
  up at startup.
- A lagged real-time access snapshot can no longer delete the files of a
  project you just linked — revocation cleanup re-checks access
  authoritatively first.
- Revoking access now clears cached API data immediately, closing a window
  where the hover reveal could still show a revoked project's value.
- Account switching re-authenticates the real-time connection immediately;
  previously it could act as the old account for up to five minutes.
- A transient token-refresh failure (for example, waking from sleep before
  Wi-Fi is up) no longer permanently disables real-time sync.
- Expired sessions self-heal: API calls refresh the token and retry once
  before prompting to sign in, and clock skew no longer causes repeated
  "Session expired" prompts.
- Signing out releases file protection — synced .env files are no longer left
  read-only with active revert watchers.
- Version checks now run hourly and honor cached results, so update notices
  and compatibility blocks reach long-lived windows.
- Dashboard panel: the per-directory Remove button works, and the "Syncing…"
  indicator no longer sticks when a pull has nothing to sync.
- The Request Variable value input is masked while typing.
- `envpilot.defaultConflictResolution` is now honored when linking a project;
  removed two settings that had no effect (`enableMultiDirectorySync`,
  `syncOnDirectoryOpen`).

## 1.15.0 and earlier

See the repository release notes.
