# Envpilot - VS Code Extension

Securely sync environment variables from Envpilot to your local projects. This extension works with both VS Code and Cursor.

## Features

- **Secure Authentication**: Sign in with your Envpilot account in the browser (device code flow); several accounts can be signed in at once
- **Project Linking**: Link your workspace to an Envpilot project
- **Automatic Sync**: Environment variables are synced to your local `.env` file
- **Real-time Revocation**: When permissions are revoked, synced files are instantly removed via WebSocket
- **Clipboard Protection**: Copy/cut is blocked in every Envpilot-managed file by default (`envpilot.clipboardGuard.scope`)
- **File Protection**: Read-only `.env` files are automatically reverted if edited
- **Commit Guard**: Dual-layer protection prevents accidental `.env` commits (VS Code staging guard + pre-commit hook in repositories that contain a linked directory). `.env.example`, `.env.sample`, `.env.template` and `.env.dist` are allowed
- **Multi-Environment**: Sync variables for development, staging, or production
- **Multi-Directory**: Link multiple directories within the same project
- **CodeLens Annotations**: Inline sync status and actions above `.env` files
- **Role-Based Access**: Owner, project manager, team lead, developer and custom roles; what you can do (write, request, reveal) follows the capabilities your organization gives your role
- **Real-time Updates**: Convex WebSocket subscriptions for instant change detection

## Requirements

- VS Code 1.85.0 or higher (or Cursor)
- An Envpilot organization whose plan includes extension access
- A project in Envpilot with environment variables

## Installation

1. Install the extension from the VS Code marketplace
2. Open the Command Palette (`Cmd/Ctrl + Shift + P`)
3. Run `Envpilot: Sign In`
4. Complete authentication in your browser
5. Link a project with `Envpilot: Link Project`

## Usage

### Sign In

1. Open the Command Palette
2. Run `Envpilot: Sign In`
3. A browser window will open for authentication
4. Once authenticated, the extension detects it automatically

### Link a Project

1. Ensure you're signed in
2. Open the Command Palette
3. Run `Envpilot: Link Project`
4. Select your organization and project
5. Variables will be synced to your configured target file (default: `.env.local`)

### Pull Variables

Variables are synced automatically, but you can manually pull:

1. Open the Command Palette
2. Run `Envpilot: Pull Variables`

### Unlink a Project

1. Open the Command Palette
2. Run `Envpilot: Unlink Project`
3. This will remove the synced `.env` file

## Configuration

Open VS Code settings and search for "Envpilot" to configure:

| Setting                                | Description                                                                                                | Default       |
| -------------------------------------- | ---------------------------------------------------------------------------------------------------------- | ------------- |
| `envpilot.serverUrl`                   | Envpilot server URL (machine scope)                                                                        | Set at build  |
| `envpilot.autoSync`                    | Sync variables when the workspace opens                                                                    | `true`        |
| `envpilot.targetFile`                  | Default target file for synced variables                                                                   | `.env.local`  |
| `envpilot.environment`                 | Default environment for synced variables                                                                   | `development` |
| `envpilot.preventCopyOnRevoke`         | Delete synced .env files when permissions are revoked                                                      | `true`        |
| `envpilot.defaultConflictResolution`   | Action when existing .env files are found                                                                  | `prompt`      |
| `envpilot.convexUrl`                   | Convex deployment URL for real-time sync (machine scope, build-time URL if empty)                          | empty         |
| `envpilot.enableCodeLens`              | Show CodeLens annotations above .env files                                                                 | `true`        |
| `envpilot.commitGuard.enabled`         | Enable dual-layer .env commit protection (user setting only)                                               | `true`        |
| `envpilot.commitGuard.autoInstallHook` | Install the pre-commit hook in repositories containing a linked directory (user setting only)              | `true`        |
| `envpilot.clipboardGuard.scope`        | Which managed files block clipboard copy/cut: `all-managed`, `readonly-roles` or `off` (user setting only) | `all-managed` |
| `envpilot.cloakValues`                 | Mask values in managed .env editors (user setting only)                                                    | `true`        |
| `envpilot.autocomplete.enable`         | Suggest variable names from the linked project in code                                                     | `true`        |
| `envpilot.hover.enable`                | Masked hover on env references, with a role-checked reveal                                                 | `true`        |
| `envpilot.idlePauseMinutes`            | Minutes unfocused before real-time sync pauses (0 disables)                                                | `10`          |

## Security

- **No plaintext secrets in storage**: Authentication tokens are stored securely in VS Code's secret storage
- **Real-time revocation**: When access is revoked, synced `.env` files are instantly deleted via WebSocket
- **Clipboard protection**: Copy/cut is blocked in Envpilot-managed files (all of them by default, or only read-only ones with `readonly-roles`)
- **File protection**: Unauthorized edits to read-only `.env` files are automatically reverted
- **Commit guard**: Dual-layer protection prevents committing `.env` files to git
- **Token expiration**: Access tokens expire after 30 days and are automatically refreshed
- **Audit logging**: All extension activity is logged in Envpilot's audit log

## Activity Bar

The extension adds an "Envpilot" view to your Activity Bar with:

- **Projects**: Browse and link projects
- **Variables**: View synced variables for the linked project

## Status Bar

The status bar shows:

- Connection status (signed in/out)
- Linked project information
- Last sync time
- Click to see detailed status and quick actions

## Commands

| Command                                  | Description                                                               |
| ---------------------------------------- | ------------------------------------------------------------------------- |
| `Envpilot: Sign In`                      | Sign in, or add another account                                           |
| `Envpilot: Sign Out`                     | Sign out of the active account; other signed-in accounts stay             |
| `Envpilot: Sign Out of All Accounts`     | Sign out of every account on this machine                                 |
| `Envpilot: Switch Account`               | Switch between signed-in accounts                                         |
| `Envpilot: Link Project`                 | Link a directory to a project                                             |
| `Envpilot: Unlink Project`               | Unlink a project and remove its synced files                              |
| `Envpilot: Add Directory`                | Add a sync directory to a linked project                                  |
| `Envpilot: Remove Directory`             | Remove a sync directory                                                   |
| `Envpilot: Pull Variables`               | Sync variables now                                                        |
| `Envpilot: Refresh`                      | Reload projects and variables from the server                             |
| `Envpilot: Request Variable`             | Ask for a new variable to be added (roles that can submit requests)       |
| `Envpilot: Show Status`                  | Show status and quick actions                                             |
| `Envpilot: Open Dashboard`               | Open Envpilot in the browser                                              |
| `Envpilot: Install Commit Guard Hook`    | Install the pre-commit hook in repositories containing a linked directory |
| `Envpilot: Remove Commit Guard Hook`     | Remove the pre-commit hook                                                |
| `Envpilot: Toggle Value Cloaking`        | Turn value masking on or off                                              |
| `Envpilot: Reveal Values for 30 Seconds` | Unmask values briefly (roles that can reveal secrets)                     |

## Troubleshooting

### "Extension access requires Pro tier"

Your organization's plan does not include extension access. An organization owner can change the plan from the dashboard.

### "Token has been revoked"

Your access to the project has been revoked by an administrator. Contact your team lead or admin to restore access.

### "Token has expired"

Your access token has expired. Sign out and sign in again to refresh your credentials.

### Browser doesn't open on sign-in

If the browser fails to open, the sign-in URL is automatically copied to your clipboard. Paste it in your browser to continue. You can also check the Envpilot Output Channel for a clickable link.

### Variables not syncing

1. Check that you're signed in
2. Verify a project is linked to your workspace
3. Try manually pulling variables with `Envpilot: Pull Variables`
4. Check the Output panel (Envpilot) for error messages

## Uninstalling

When you uninstall the extension, a cleanup hook runs on the next VS Code
launch and deletes every synced `.env` file that hasn't been modified since
its last sync (locally edited files are never touched). For a complete
offboarding, especially on shared or organization machines, run
`Envpilot: Sign Out of All Accounts` **before** uninstalling: VS Code does not let extensions
clear their secure token storage during uninstall, so signing out first is
what removes the stored credentials. Organization admins can additionally
revoke a machine's access at any time from the dashboard (device sessions).

## Privacy

- The extension only accesses environment variables for linked projects
- Authentication tokens are stored locally in VS Code's secure storage
- No data is sent to third parties
- All communication is with your Envpilot server

## Support

For issues and feature requests, visit the [Envpilot GitHub repository](https://github.com/rafay99-epic/envpilot.dev/issues).

## Links

- [Website](https://www.envpilot.dev)
- [Documentation](https://www.envpilot.dev/docs)
- [Privacy Policy](https://www.envpilot.dev/privacy)
- [Terms of Service](https://www.envpilot.dev/terms)
