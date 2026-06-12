# Envpilot - VS Code Extension

Securely sync environment variables from Envpilot to your local projects. This extension works with both VS Code and Cursor.

## Features

- **Secure Authentication**: Sign in with your Envpilot account using OAuth
- **Project Linking**: Link your workspace to an Envpilot project
- **Automatic Sync**: Environment variables are synced to your local `.env` file
- **Real-time Revocation**: When permissions are revoked, synced files are instantly removed via WebSocket
- **Clipboard Protection**: Copy/paste of secrets is blocked for read-only variables
- **File Protection**: Read-only `.env` files are automatically reverted if edited
- **Commit Guard**: Dual-layer protection prevents accidental `.env` commits (VS Code staging guard + pre-commit hook)
- **Multi-Environment**: Sync variables for development, staging, or production
- **Multi-Directory**: Link multiple directories within the same project
- **CodeLens Annotations**: Inline sync status and actions above `.env` files
- **Dashboard Panel**: Built-in webview dashboard for project overview
- **Role-Based Access**: Admin, Team Lead, and Member roles with granular permissions
- **Real-time Updates**: Convex WebSocket subscriptions for instant change detection

## Requirements

- VS Code 1.85.0 or higher (or Cursor)
- An Envpilot account with Pro tier (extension access is a Pro feature)
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

| Setting                                | Description                                        | Default       |
| -------------------------------------- | -------------------------------------------------- | ------------- |
| `envpilot.serverUrl`                   | Envpilot server URL                                | Set at build  |
| `envpilot.autoSync`                    | Auto-sync on workspace open                        | `true`        |
| `envpilot.syncInterval`                | Permission check interval (seconds)                | `300`         |
| `envpilot.targetFile`                  | Target file for synced variables                   | `.env.local`  |
| `envpilot.environment`                 | Default environment                                | `development` |
| `envpilot.preventCopyOnRevoke`         | Delete .env when permissions revoked               | `true`        |
| `envpilot.defaultConflictResolution`   | Action when existing .env files found              | `prompt`      |
| `envpilot.enableMultiDirectorySync`    | Allow linking multiple directories                 | `true`        |
| `envpilot.syncOnDirectoryOpen`         | Auto-sync when opening a linked directory          | `true`        |
| `envpilot.enableCodeLens`              | Show CodeLens annotations above .env files         | `true`        |
| `envpilot.commitGuard.enabled`         | Enable dual-layer .env commit protection           | `true`        |
| `envpilot.commitGuard.autoInstallHook` | Auto-install pre-commit hook to block .env commits | `true`        |

## Security

- **No plaintext secrets in storage**: Authentication tokens are stored securely in VS Code's secret storage
- **Real-time revocation**: When access is revoked, synced `.env` files are instantly deleted via WebSocket
- **Clipboard protection**: Copy/paste is blocked for read-only environment files
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

| Command                          | Description                         |
| -------------------------------- | ----------------------------------- |
| `Envpilot: Sign In`              | Authenticate with Envpilot          |
| `Envpilot: Sign Out`             | Sign out and clear credentials      |
| `Envpilot: Link Project`         | Link current workspace to a project |
| `Envpilot: Unlink Project`       | Unlink and remove synced variables  |
| `Envpilot: Pull Variables`       | Manually sync variables             |
| `Envpilot: Refresh`              | Refresh the project tree            |
| `Envpilot: Open Dashboard`       | Open Envpilot in browser            |
| `Envpilot: Open Dashboard Panel` | Open built-in dashboard panel       |
| `Envpilot: Show Status`          | Show status and quick actions       |
| `Envpilot: Add Directory`        | Add a sync directory to a project   |
| `Envpilot: Remove Directory`     | Remove a sync directory             |
| `Envpilot: Select Environments`  | Choose environments to sync         |
| `Envpilot: Request Variable`     | Request access to a variable        |
| `Envpilot: Install Commit Guard` | Install pre-commit hook             |
| `Envpilot: Remove Commit Guard`  | Remove pre-commit hook              |

## Troubleshooting

### "Extension access requires Pro tier"

Extension access is only available for Pro tier organizations. Upgrade your organization to Pro to use this feature.

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
