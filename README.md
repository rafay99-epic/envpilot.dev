# ENV Connect

Secure environment variable management for teams. ENV Connect provides a centralized platform for managing, sharing, and syncing environment variables across your development team and deployment environments.

## Features

- **Secure Variable Storage**: Environment variables encrypted and stored securely using WorkOS Vault
- **Real-Time Sync**: Changes propagate instantly across your team via Convex real-time database
- **Team Management**: Invite team members, assign roles, and control access
- **Organization Support**: Manage multiple organizations with separate projects
- **Granular Permissions**: Control who can view, edit, or manage each variable
- **Audit Logging**: Track all changes and access to environment variables
- **VS Code Extension Support**: Sync variables directly to your development environment

## Tech Stack

- **Frontend**: [Next.js 16](https://nextjs.org/) with React 19 and the React Compiler
- **Backend**: [Convex](https://convex.dev/) real-time database
- **Authentication**: [WorkOS AuthKit](https://workos.com/docs/user-management)
- **Styling**: [Tailwind CSS v4](https://tailwindcss.com/)
- **Testing**: [Playwright](https://playwright.dev/)
- **Language**: TypeScript with strict mode

## Getting Started

### Prerequisites

- Node.js 18.x or later
- npm 9.x or later

### Quick Start

```bash
# Clone the repository
git clone <repository-url>
cd ENV_Connect_2

# Install dependencies
npm install

# Set up environment variables
cp .env.example .env.local
# Edit .env.local with your configuration

# Start development servers
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to view the application.

### Environment Variables

Copy `.env.example` to `.env.local` and configure:

| Variable                 | Description                       |
| ------------------------ | --------------------------------- |
| `NEXT_PUBLIC_CONVEX_URL` | Your Convex deployment URL        |
| `WORKOS_API_KEY`         | WorkOS API key                    |
| `WORKOS_CLIENT_ID`       | WorkOS client ID                  |
| `WORKOS_COOKIE_PASSWORD` | Cookie encryption key (32+ chars) |
| `NEXT_PUBLIC_APP_URL`    | Application URL                   |

See the [Development Guide](./docs/DEVELOPMENT.md) for detailed setup instructions.

## Available Scripts

| Command                 | Description                                  |
| ----------------------- | -------------------------------------------- |
| `npm run dev`           | Start Next.js and Convex development servers |
| `npm run build`         | Build for production                         |
| `npm run start`         | Start production server                      |
| `npm run lint`          | Run ESLint                                   |
| `npm run test:e2e`      | Run Playwright E2E tests                     |
| `npm run convex:deploy` | Deploy Convex functions                      |

## Project Structure

```
├── convex/              # Convex backend functions and schema
├── src/
│   ├── app/             # Next.js App Router pages
│   │   ├── (auth)/      # Authentication routes
│   │   ├── (dashboard)/ # Dashboard routes
│   │   └── api/         # API routes
│   ├── components/      # React components
│   ├── hooks/           # Custom React hooks
│   └── lib/             # Utility libraries
├── docs/                # Documentation
├── public/              # Static assets
└── tests/               # E2E tests
```

## Documentation

- [Development Guide](./docs/DEVELOPMENT.md) - Local development setup and workflow
- [Deployment Guide](./docs/DEPLOYMENT.md) - Production deployment instructions

## Architecture

### Authentication Flow

1. User initiates sign-in via WorkOS AuthKit
2. WorkOS handles authentication (email, OAuth, SAML)
3. Callback route creates session and syncs user to Convex
4. Protected routes verify session via middleware

### Data Flow

1. Frontend components use Convex React hooks
2. Convex provides real-time subscriptions
3. Sensitive values stored in WorkOS Vault
4. Audit logs track all operations

### Database Schema

Key entities:

- **Users**: Synced from WorkOS
- **Organizations**: Team containers
- **Projects**: Logical groupings of variables
- **Environment Variables**: Key-value pairs with vault references
- **Permissions**: Granular access control
- **Audit Logs**: Complete activity history

## Security

- All sensitive values encrypted via WorkOS Vault
- Role-based access control (Admin, Team Lead, Member)
- Variable-level permissions
- Session management with secure cookies
- Comprehensive audit logging

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Run tests: `npm run test:e2e`
5. Submit a pull request

## License

Private - All rights reserved
