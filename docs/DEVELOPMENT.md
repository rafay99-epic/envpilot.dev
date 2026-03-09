# Development Guide

This guide covers setting up and running ENV Connect locally for development.

## Prerequisites

Before starting, ensure you have the following installed:

- **Node.js** 18.x or later ([download](https://nodejs.org/))
- **npm** 9.x or later (comes with Node.js)
- **Git** for version control

## Quick Start

```bash
# 1. Clone the repository
git clone <repository-url>
cd ENV_Connect_2

# 2. Install dependencies
npm install

# 3. Set up environment variables
cp .env.example .env.local

# 4. Configure your .env.local file (see Environment Variables section)

# 5. Start development servers (Next.js + Convex)
npm run dev
```

The application will be available at `http://localhost:3000`.

## Project Structure

```
ENV_Connect_2/
├── convex/                 # Convex backend
│   ├── _generated/         # Auto-generated Convex types
│   ├── schema.ts           # Database schema
│   ├── users.ts            # User functions
│   ├── organizations.ts    # Organization functions
│   ├── projects.ts         # Project functions
│   ├── variables.ts        # Environment variable functions
│   ├── permissions.ts      # Permission functions
│   ├── invitations.ts      # Invitation functions
│   ├── projectAccess.ts    # Extension access functions
│   └── auditLogs.ts        # Audit log functions
├── src/
│   ├── app/                # Next.js App Router pages
│   │   ├── (auth)/         # Authentication routes
│   │   ├── (dashboard)/    # Dashboard routes
│   │   └── api/            # API routes
│   ├── components/         # React components
│   │   ├── auth/           # Authentication components
│   │   └── dashboard/      # Dashboard components
│   ├── hooks/              # Custom React hooks
│   └── lib/                # Utility libraries
├── public/                 # Static assets
├── tests/                  # Playwright E2E tests
└── docs/                   # Documentation
```

## Environment Variables

### Required Variables

Create a `.env.local` file in the project root with the following variables:

```bash
# Convex
NEXT_PUBLIC_CONVEX_URL=<your-convex-deployment-url>

# WorkOS Authentication
WORKOS_API_KEY=<your-workos-api-key>
WORKOS_CLIENT_ID=<your-workos-client-id>
WORKOS_COOKIE_PASSWORD=<32-character-random-string>

# Application URL
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

### Optional Variables

```bash
# Custom WorkOS redirect URI (defaults to NEXT_PUBLIC_APP_URL + /callback)
WORKOS_REDIRECT_URI=http://localhost:3000/callback
```

See `.env.example` for a complete template with descriptions.

## Setting Up Services

### 1. Convex Backend

[Convex](https://convex.dev) provides the real-time backend database.

```bash
# Install Convex CLI globally (optional, included in devDependencies)
npm install -g convex

# Login to Convex
npx convex login

# Initialize a new project (first time only)
npx convex init

# Or link to existing project
npx convex dev --configure
```

After setup, Convex will provide your `NEXT_PUBLIC_CONVEX_URL`.

**Running Convex in Development:**

The `npm run dev` command runs both Next.js and Convex dev servers in parallel. If you need to run them separately:

```bash
# Terminal 1: Next.js only
npm run dev:next

# Terminal 2: Convex only
npm run dev:convex
```

### 2. WorkOS Authentication

[WorkOS](https://workos.com) provides authentication with AuthKit.

1. Create a WorkOS account at [workos.com](https://workos.com)
2. Create a new project in the WorkOS dashboard
3. Navigate to **Authentication** → **AuthKit**
4. Configure your redirect URIs:
   - Development: `http://localhost:3000/callback`
   - Production: `https://your-domain.com/callback`
5. Copy your **API Key** and **Client ID**
6. Generate a secure cookie password:
   ```bash
   openssl rand -base64 32
   ```

**WorkOS Configuration Checklist:**

- [ ] API Key added to `.env.local`
- [ ] Client ID added to `.env.local`
- [ ] Cookie password (32+ characters) added to `.env.local`
- [ ] Redirect URI configured in WorkOS dashboard
- [ ] Sign-in methods enabled (email, Google, etc.)

## Available Scripts

| Command                 | Description                                       |
| ----------------------- | ------------------------------------------------- |
| `npm run dev`           | Start both Next.js and Convex development servers |
| `npm run dev:next`      | Start only the Next.js development server         |
| `npm run dev:convex`    | Start only the Convex development server          |
| `npm run build`         | Build the Next.js application for production      |
| `npm run start`         | Start the production Next.js server               |
| `npm run lint`          | Run ESLint                                        |
| `npm run test:e2e`      | Run Playwright end-to-end tests                   |
| `npm run convex:deploy` | Deploy Convex functions to production             |

## Development Workflow

### 1. Starting Development

```bash
npm run dev
```

This runs:

- Next.js dev server on `http://localhost:3000`
- Convex dev server syncing functions and schema

### 2. Making Database Changes

Edit `convex/schema.ts` to modify the database schema. Convex will automatically apply migrations during development.

### 3. Adding Backend Functions

Create or edit files in the `convex/` directory:

```typescript
// convex/example.ts
import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

export const myQuery = query({
  args: { id: v.id("myTable") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id);
  },
});

export const myMutation = mutation({
  args: { name: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db.insert("myTable", { name: args.name });
  },
});
```

### 4. Using Convex in React

```typescript
import { useQuery, useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";

function MyComponent() {
  const data = useQuery(api.example.myQuery, { id: someId });
  const doSomething = useMutation(api.example.myMutation);

  return (
    <button onClick={() => doSomething({ name: "test" })}>
      Do Something
    </button>
  );
}
```

### 5. Running Tests

```bash
# Run all E2E tests
npm run test:e2e

# Run tests in UI mode
npx playwright test --ui

# Run specific test file
npx playwright test tests/example.spec.ts
```

## Code Style

This project uses:

- **TypeScript** for type safety
- **ESLint** for code linting
- **Tailwind CSS v4** for styling
- **React 19** with the React Compiler

### TypeScript Guidelines

- Use strict mode (enabled by default)
- Define interfaces for all component props
- Use Zod for runtime validation of external data

### Component Guidelines

```typescript
interface ButtonProps {
  label: string;
  onClick: () => void;
  variant?: 'primary' | 'secondary';
  disabled?: boolean;
}

export function Button({
  label,
  onClick,
  variant = 'primary',
  disabled
}: ButtonProps) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={variant === 'primary' ? 'bg-blue-500' : 'bg-gray-500'}
    >
      {label}
    </button>
  );
}
```

## Troubleshooting

### Convex Connection Issues

```bash
# Clear Convex cache and restart
rm -rf .convex
npx convex dev
```

### WorkOS Authentication Errors

1. **"Invalid redirect URI"**: Ensure the redirect URI in your `.env.local` matches exactly what's configured in the WorkOS dashboard.

2. **"Cookie password too short"**: The `WORKOS_COOKIE_PASSWORD` must be at least 32 characters.

3. **"API key invalid"**: Verify your `WORKOS_API_KEY` is correct and from the same environment (development/production).

### Next.js Build Errors

```bash
# Clear Next.js cache
rm -rf .next
npm run build
```

### Port Already in Use

```bash
# Find and kill process using port 3000
lsof -ti:3000 | xargs kill -9
```

## Next Steps

- See [DEPLOYMENT.md](./DEPLOYMENT.md) for production deployment
- Check the project README for feature overview
