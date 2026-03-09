# ENV Connect - VS Code Extension

Securely sync environment variables from ENV Connect to your local projects. This extension works with both VS Code and Cursor.

## Features

- **Secure Authentication**: Sign in with your ENV Connect account using OAuth
- **Project Linking**: Link your workspace to an ENV Connect project
- **Automatic Sync**: Environment variables are synced to your local `.env` file
- **Permission-Aware**: When permissions are revoked, synced files are automatically removed
- **Multi-Environment**: Sync variables for development, staging, or production
- **Real-time Updates**: Periodic checking for permission changes

## Requirements

- VS Code 1.85.0 or higher (or Cursor)
- An ENV Connect account with Pro tier (extension access is a Pro feature)
- A project in ENV Connect with environment variables

## Installation

1. Install the extension from the VS Code marketplace
2. Open the Command Palette (`Cmd/Ctrl + Shift + P`)
3. Run `ENV Connect: Sign In`
4. Complete authentication in your browser
5. Link a project with `ENV Connect: Link Project`

## Usage

### Sign In

1. Open the Command Palette
2. Run `ENV Connect: Sign In`
3. A browser window will open for authentication
4. After signing in, click "Check Sign In" in VS Code

### Link a Project

1. Ensure you're signed in
2. Open the Command Palette
3. Run `ENV Connect: Link Project`
4. Select your organization and project
5. Variables will be synced to your configured target file (default: `.env.local`)

### Pull Variables

Variables are synced automatically, but you can manually pull:

1. Open the Command Palette
2. Run `ENV Connect: Pull Variables`

### Unlink a Project

1. Open the Command Palette
2. Run `ENV Connect: Unlink Project`
3. This will remove the synced `.env` file

## Configuration

Open VS Code settings and search for "ENV Connect" to configure:

| Setting                          | Description                          | Default                 |
| -------------------------------- | ------------------------------------ | ----------------------- |
| `envConnect.serverUrl`           | ENV Connect server URL               | `http://localhost:3000` |
| `envConnect.autoSync`            | Auto-sync on workspace open          | `true`                  |
| `envConnect.syncInterval`        | Permission check interval (seconds)  | `300`                   |
| `envConnect.targetFile`          | Target file for synced variables     | `.env.local`            |
| `envConnect.environment`         | Default environment                  | `development`           |
| `envConnect.preventCopyOnRevoke` | Delete .env when permissions revoked | `true`                  |

## Security

- **No plaintext secrets in storage**: Authentication tokens are stored securely in VS Code's secret storage
- **Permission revocation**: When your access is revoked, the synced `.env` file is automatically deleted
- **Token expiration**: Access tokens expire after 30 days and are automatically refreshed
- **Audit logging**: All extension activity is logged in ENV Connect's audit log

## Activity Bar

The extension adds an "ENV Connect" view to your Activity Bar with:

- **Projects**: Browse and link projects
- **Variables**: View synced variables for the linked project

## Status Bar

The status bar shows:

- Connection status (signed in/out)
- Linked project information
- Last sync time
- Click to see detailed status and quick actions

## Commands

| Command                       | Description                         |
| ----------------------------- | ----------------------------------- |
| `ENV Connect: Sign In`        | Authenticate with ENV Connect       |
| `ENV Connect: Sign Out`       | Sign out and clear credentials      |
| `ENV Connect: Link Project`   | Link current workspace to a project |
| `ENV Connect: Unlink Project` | Unlink and remove synced variables  |
| `ENV Connect: Pull Variables` | Manually sync variables             |
| `ENV Connect: Refresh`        | Refresh the project tree            |
| `ENV Connect: Open Dashboard` | Open ENV Connect in browser         |
| `ENV Connect: Show Status`    | Show status and quick actions       |

## Troubleshooting

### "Extension access requires Pro tier"

Extension access is only available for Pro tier organizations. Upgrade your organization to Pro to use this feature.

### "Token has been revoked"

Your access to the project has been revoked by an administrator. Contact your team lead or admin to restore access.

### "Token has expired"

Your access token has expired. Sign out and sign in again to refresh your credentials.

### Variables not syncing

1. Check that you're signed in
2. Verify a project is linked to your workspace
3. Try manually pulling variables with `ENV Connect: Pull Variables`
4. Check the output panel for error messages

## Privacy

- The extension only accesses environment variables for linked projects
- Authentication tokens are stored locally in VS Code's secure storage
- No data is sent to third parties
- All communication is with your ENV Connect server

## Support

For issues and feature requests, visit the [ENV Connect GitHub repository](https://github.com/env-connect/env-connect).

## License

MIT
