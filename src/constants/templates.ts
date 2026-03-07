/**
 * Environment variable templates for common project types
 * These provide pre-configured environment variable structures
 */

import type { Environment } from "./project";

/**
 * Template variable definition
 * Describes a single environment variable with its metadata
 */
export interface TemplateVariable {
  /** The variable key (e.g., "DATABASE_URL") */
  key: string;
  /** Human-readable description of the variable */
  description: string;
  /** Default/example value for reference */
  defaultValue?: string;
  /** Placeholder text showing expected format */
  placeholder?: string;
  /** Which environments this variable applies to */
  environments: Environment[];
  /** Whether this variable contains sensitive data */
  isSensitive: boolean;
  /** Whether this variable is required for the project to function */
  isRequired: boolean;
  /** Category for grouping related variables */
  category: TemplateVariableCategory;
}

/**
 * Categories for organizing template variables
 */
export type TemplateVariableCategory =
  | "database"
  | "authentication"
  | "api"
  | "storage"
  | "email"
  | "monitoring"
  | "payment"
  | "general"
  | "deployment";

/**
 * Project type categories
 */
export type ProjectType =
  | "nextjs"
  | "express"
  | "react-native"
  | "react"
  | "nodejs"
  | "django"
  | "flask"
  | "rails"
  | "laravel"
  | "fastapi"
  | "custom";

/**
 * Environment template definition
 * Contains all variables for a specific project type
 */
export interface EnvironmentTemplate {
  /** Unique identifier for the template */
  id: string;
  /** Display name for the template */
  name: string;
  /** Brief description of what this template is for */
  description: string;
  /** The project type this template is designed for */
  projectType: ProjectType;
  /** Icon for visual identification */
  icon: string;
  /** Color for visual identification */
  color: string;
  /** List of environment variables in this template */
  variables: TemplateVariable[];
  /** Framework/library version this template is designed for (optional) */
  version?: string;
  /** Tags for searchability */
  tags: string[];
  /** Whether this is a built-in template or user-created */
  isBuiltIn: boolean;
}

/**
 * Category display information
 */
export const VARIABLE_CATEGORIES: Record<
  TemplateVariableCategory,
  { label: string; icon: string }
> = {
  database: { label: "Database", icon: "🗄️" },
  authentication: { label: "Authentication", icon: "🔐" },
  api: { label: "API & Services", icon: "🔌" },
  storage: { label: "Storage", icon: "📦" },
  email: { label: "Email", icon: "📧" },
  monitoring: { label: "Monitoring", icon: "📊" },
  payment: { label: "Payment", icon: "💳" },
  general: { label: "General", icon: "⚙️" },
  deployment: { label: "Deployment", icon: "🚀" },
} as const;

/**
 * Project type display information
 */
export const PROJECT_TYPES: Record<
  ProjectType,
  { label: string; icon: string; color: string }
> = {
  nextjs: { label: "Next.js", icon: "▲", color: "#000000" },
  express: { label: "Express.js", icon: "⚡", color: "#000000" },
  "react-native": { label: "React Native", icon: "📱", color: "#61DAFB" },
  react: { label: "React", icon: "⚛️", color: "#61DAFB" },
  nodejs: { label: "Node.js", icon: "🟢", color: "#339933" },
  django: { label: "Django", icon: "🐍", color: "#092E20" },
  flask: { label: "Flask", icon: "🧪", color: "#000000" },
  rails: { label: "Ruby on Rails", icon: "💎", color: "#CC0000" },
  laravel: { label: "Laravel", icon: "🔺", color: "#FF2D20" },
  fastapi: { label: "FastAPI", icon: "⚡", color: "#009688" },
  custom: { label: "Custom", icon: "🔧", color: "#6B7280" },
} as const;

/**
 * Built-in environment templates for common project types
 */
export const BUILT_IN_TEMPLATES: EnvironmentTemplate[] = [
  // Next.js Full Stack Template
  {
    id: "nextjs-full-stack",
    name: "Next.js Full Stack",
    description:
      "Complete Next.js application with authentication, database, and common integrations",
    projectType: "nextjs",
    icon: "▲",
    color: "#000000",
    version: "14+",
    tags: ["nextjs", "react", "full-stack", "vercel", "prisma"],
    isBuiltIn: true,
    variables: [
      // Database
      {
        key: "DATABASE_URL",
        description: "Primary database connection string",
        placeholder: "postgresql://user:password@host:5432/dbname",
        environments: ["development", "staging", "production"],
        isSensitive: true,
        isRequired: true,
        category: "database",
      },
      {
        key: "DATABASE_URL_UNPOOLED",
        description: "Direct database connection (for migrations)",
        placeholder:
          "postgresql://user:password@host:5432/dbname?pgbouncer=false",
        environments: ["development", "staging", "production"],
        isSensitive: true,
        isRequired: false,
        category: "database",
      },
      // Authentication
      {
        key: "NEXTAUTH_URL",
        description: "Canonical URL of your application",
        defaultValue: "http://localhost:3000",
        placeholder: "https://your-app.vercel.app",
        environments: ["development", "staging", "production"],
        isSensitive: false,
        isRequired: true,
        category: "authentication",
      },
      {
        key: "NEXTAUTH_SECRET",
        description: "Secret used to encrypt session tokens",
        placeholder: "your-super-secret-key-min-32-chars",
        environments: ["development", "staging", "production"],
        isSensitive: true,
        isRequired: true,
        category: "authentication",
      },
      {
        key: "GOOGLE_CLIENT_ID",
        description: "Google OAuth client ID",
        placeholder: "123456789.apps.googleusercontent.com",
        environments: ["development", "staging", "production"],
        isSensitive: false,
        isRequired: false,
        category: "authentication",
      },
      {
        key: "GOOGLE_CLIENT_SECRET",
        description: "Google OAuth client secret",
        placeholder: "GOCSPX-...",
        environments: ["development", "staging", "production"],
        isSensitive: true,
        isRequired: false,
        category: "authentication",
      },
      // API
      {
        key: "NEXT_PUBLIC_API_URL",
        description: "Public API base URL",
        defaultValue: "http://localhost:3000/api",
        placeholder: "https://api.your-app.com",
        environments: ["development", "staging", "production"],
        isSensitive: false,
        isRequired: false,
        category: "api",
      },
      // General
      {
        key: "NODE_ENV",
        description: "Node.js environment mode",
        defaultValue: "development",
        placeholder: "development | staging | production",
        environments: ["development", "staging", "production"],
        isSensitive: false,
        isRequired: true,
        category: "general",
      },
    ],
  },

  // Next.js with Vercel Template
  {
    id: "nextjs-vercel",
    name: "Next.js + Vercel",
    description:
      "Next.js optimized for Vercel deployment with KV, Postgres, and Blob storage",
    projectType: "nextjs",
    icon: "▲",
    color: "#000000",
    version: "14+",
    tags: ["nextjs", "vercel", "kv", "postgres", "blob"],
    isBuiltIn: true,
    variables: [
      // Vercel Postgres
      {
        key: "POSTGRES_URL",
        description: "Vercel Postgres connection string",
        placeholder: "postgres://...",
        environments: ["development", "staging", "production"],
        isSensitive: true,
        isRequired: true,
        category: "database",
      },
      {
        key: "POSTGRES_PRISMA_URL",
        description: "Vercel Postgres URL for Prisma",
        placeholder: "postgres://...?pgbouncer=true",
        environments: ["development", "staging", "production"],
        isSensitive: true,
        isRequired: false,
        category: "database",
      },
      {
        key: "POSTGRES_URL_NON_POOLING",
        description: "Direct Vercel Postgres URL (no pooling)",
        placeholder: "postgres://...",
        environments: ["development", "staging", "production"],
        isSensitive: true,
        isRequired: false,
        category: "database",
      },
      // Vercel KV
      {
        key: "KV_URL",
        description: "Vercel KV Redis connection URL",
        placeholder: "redis://...",
        environments: ["development", "staging", "production"],
        isSensitive: true,
        isRequired: false,
        category: "database",
      },
      {
        key: "KV_REST_API_URL",
        description: "Vercel KV REST API URL",
        placeholder: "https://...",
        environments: ["development", "staging", "production"],
        isSensitive: false,
        isRequired: false,
        category: "database",
      },
      {
        key: "KV_REST_API_TOKEN",
        description: "Vercel KV REST API token",
        placeholder: "token_...",
        environments: ["development", "staging", "production"],
        isSensitive: true,
        isRequired: false,
        category: "database",
      },
      // Vercel Blob
      {
        key: "BLOB_READ_WRITE_TOKEN",
        description: "Vercel Blob storage read/write token",
        placeholder: "vercel_blob_...",
        environments: ["development", "staging", "production"],
        isSensitive: true,
        isRequired: false,
        category: "storage",
      },
      // Authentication
      {
        key: "AUTH_SECRET",
        description: "Auth.js (NextAuth v5) secret",
        placeholder: "your-auth-secret-min-32-chars",
        environments: ["development", "staging", "production"],
        isSensitive: true,
        isRequired: true,
        category: "authentication",
      },
    ],
  },

  // Express.js API Template
  {
    id: "express-api",
    name: "Express.js API",
    description:
      "REST API built with Express.js including database and authentication",
    projectType: "express",
    icon: "⚡",
    color: "#000000",
    tags: ["express", "nodejs", "api", "rest", "backend"],
    isBuiltIn: true,
    variables: [
      // Server
      {
        key: "PORT",
        description: "Server port number",
        defaultValue: "3000",
        placeholder: "3000",
        environments: ["development", "staging", "production"],
        isSensitive: false,
        isRequired: true,
        category: "general",
      },
      {
        key: "NODE_ENV",
        description: "Node.js environment mode",
        defaultValue: "development",
        placeholder: "development | staging | production",
        environments: ["development", "staging", "production"],
        isSensitive: false,
        isRequired: true,
        category: "general",
      },
      // Database
      {
        key: "DATABASE_URL",
        description: "Primary database connection string",
        placeholder: "postgresql://user:password@host:5432/dbname",
        environments: ["development", "staging", "production"],
        isSensitive: true,
        isRequired: true,
        category: "database",
      },
      {
        key: "REDIS_URL",
        description: "Redis connection URL for caching/sessions",
        placeholder: "redis://localhost:6379",
        environments: ["development", "staging", "production"],
        isSensitive: true,
        isRequired: false,
        category: "database",
      },
      // Authentication
      {
        key: "JWT_SECRET",
        description: "Secret key for JWT token signing",
        placeholder: "your-jwt-secret-key",
        environments: ["development", "staging", "production"],
        isSensitive: true,
        isRequired: true,
        category: "authentication",
      },
      {
        key: "JWT_EXPIRES_IN",
        description: "JWT token expiration time",
        defaultValue: "7d",
        placeholder: "7d | 24h | 3600s",
        environments: ["development", "staging", "production"],
        isSensitive: false,
        isRequired: false,
        category: "authentication",
      },
      // API
      {
        key: "CORS_ORIGIN",
        description: "Allowed CORS origins",
        defaultValue: "http://localhost:3000",
        placeholder: "https://your-frontend.com",
        environments: ["development", "staging", "production"],
        isSensitive: false,
        isRequired: false,
        category: "api",
      },
      {
        key: "API_RATE_LIMIT",
        description: "Maximum requests per minute",
        defaultValue: "100",
        placeholder: "100",
        environments: ["development", "staging", "production"],
        isSensitive: false,
        isRequired: false,
        category: "api",
      },
    ],
  },

  // React Native Mobile App Template
  {
    id: "react-native-app",
    name: "React Native App",
    description:
      "Mobile application with common services and push notifications",
    projectType: "react-native",
    icon: "📱",
    color: "#61DAFB",
    tags: ["react-native", "mobile", "ios", "android", "expo"],
    isBuiltIn: true,
    variables: [
      // API
      {
        key: "API_BASE_URL",
        description: "Backend API base URL",
        defaultValue: "http://localhost:3000/api",
        placeholder: "https://api.your-app.com",
        environments: ["development", "staging", "production"],
        isSensitive: false,
        isRequired: true,
        category: "api",
      },
      // Firebase
      {
        key: "FIREBASE_API_KEY",
        description: "Firebase API key",
        placeholder: "AIza...",
        environments: ["development", "staging", "production"],
        isSensitive: true,
        isRequired: false,
        category: "api",
      },
      {
        key: "FIREBASE_AUTH_DOMAIN",
        description: "Firebase auth domain",
        placeholder: "your-app.firebaseapp.com",
        environments: ["development", "staging", "production"],
        isSensitive: false,
        isRequired: false,
        category: "authentication",
      },
      {
        key: "FIREBASE_PROJECT_ID",
        description: "Firebase project ID",
        placeholder: "your-firebase-project",
        environments: ["development", "staging", "production"],
        isSensitive: false,
        isRequired: false,
        category: "api",
      },
      {
        key: "FIREBASE_STORAGE_BUCKET",
        description: "Firebase storage bucket",
        placeholder: "your-app.appspot.com",
        environments: ["development", "staging", "production"],
        isSensitive: false,
        isRequired: false,
        category: "storage",
      },
      {
        key: "FIREBASE_MESSAGING_SENDER_ID",
        description: "Firebase Cloud Messaging sender ID",
        placeholder: "123456789",
        environments: ["development", "staging", "production"],
        isSensitive: false,
        isRequired: false,
        category: "api",
      },
      // App Config
      {
        key: "APP_ENV",
        description: "Application environment",
        defaultValue: "development",
        placeholder: "development | staging | production",
        environments: ["development", "staging", "production"],
        isSensitive: false,
        isRequired: true,
        category: "general",
      },
      // Analytics
      {
        key: "SENTRY_DSN",
        description: "Sentry error tracking DSN",
        placeholder: "https://...@sentry.io/...",
        environments: ["staging", "production"],
        isSensitive: true,
        isRequired: false,
        category: "monitoring",
      },
    ],
  },

  // React SPA Template
  {
    id: "react-spa",
    name: "React SPA",
    description: "Single Page Application with Vite and common integrations",
    projectType: "react",
    icon: "⚛️",
    color: "#61DAFB",
    tags: ["react", "vite", "spa", "frontend"],
    isBuiltIn: true,
    variables: [
      // API
      {
        key: "VITE_API_URL",
        description: "Backend API URL (Vite public env)",
        defaultValue: "http://localhost:3001/api",
        placeholder: "https://api.your-app.com",
        environments: ["development", "staging", "production"],
        isSensitive: false,
        isRequired: true,
        category: "api",
      },
      {
        key: "VITE_APP_NAME",
        description: "Application name for display",
        defaultValue: "My React App",
        placeholder: "Your App Name",
        environments: ["development", "staging", "production"],
        isSensitive: false,
        isRequired: false,
        category: "general",
      },
      // Authentication
      {
        key: "VITE_AUTH0_DOMAIN",
        description: "Auth0 tenant domain",
        placeholder: "your-tenant.auth0.com",
        environments: ["development", "staging", "production"],
        isSensitive: false,
        isRequired: false,
        category: "authentication",
      },
      {
        key: "VITE_AUTH0_CLIENT_ID",
        description: "Auth0 application client ID",
        placeholder: "your-client-id",
        environments: ["development", "staging", "production"],
        isSensitive: false,
        isRequired: false,
        category: "authentication",
      },
      // Analytics
      {
        key: "VITE_GA_TRACKING_ID",
        description: "Google Analytics tracking ID",
        placeholder: "G-XXXXXXXXXX",
        environments: ["production"],
        isSensitive: false,
        isRequired: false,
        category: "monitoring",
      },
      // Feature Flags
      {
        key: "VITE_ENABLE_DEBUG",
        description: "Enable debug mode",
        defaultValue: "true",
        placeholder: "true | false",
        environments: ["development"],
        isSensitive: false,
        isRequired: false,
        category: "general",
      },
    ],
  },

  // Node.js Generic Template
  {
    id: "nodejs-generic",
    name: "Node.js Generic",
    description: "Basic Node.js application with essential configuration",
    projectType: "nodejs",
    icon: "🟢",
    color: "#339933",
    tags: ["nodejs", "backend", "javascript"],
    isBuiltIn: true,
    variables: [
      {
        key: "NODE_ENV",
        description: "Node.js environment mode",
        defaultValue: "development",
        placeholder: "development | staging | production",
        environments: ["development", "staging", "production"],
        isSensitive: false,
        isRequired: true,
        category: "general",
      },
      {
        key: "PORT",
        description: "Application port",
        defaultValue: "3000",
        placeholder: "3000",
        environments: ["development", "staging", "production"],
        isSensitive: false,
        isRequired: true,
        category: "general",
      },
      {
        key: "LOG_LEVEL",
        description: "Logging verbosity level",
        defaultValue: "info",
        placeholder: "debug | info | warn | error",
        environments: ["development", "staging", "production"],
        isSensitive: false,
        isRequired: false,
        category: "general",
      },
      {
        key: "DATABASE_URL",
        description: "Database connection string",
        placeholder: "postgresql://user:password@host:5432/dbname",
        environments: ["development", "staging", "production"],
        isSensitive: true,
        isRequired: false,
        category: "database",
      },
    ],
  },

  // Django Template
  {
    id: "django-web",
    name: "Django Web App",
    description:
      "Django application with database, caching, and common services",
    projectType: "django",
    icon: "🐍",
    color: "#092E20",
    tags: ["django", "python", "web", "backend"],
    isBuiltIn: true,
    variables: [
      {
        key: "DJANGO_SECRET_KEY",
        description: "Django secret key for cryptographic signing",
        placeholder: "your-super-secret-key",
        environments: ["development", "staging", "production"],
        isSensitive: true,
        isRequired: true,
        category: "general",
      },
      {
        key: "DJANGO_DEBUG",
        description: "Enable Django debug mode",
        defaultValue: "True",
        placeholder: "True | False",
        environments: ["development"],
        isSensitive: false,
        isRequired: true,
        category: "general",
      },
      {
        key: "DJANGO_ALLOWED_HOSTS",
        description: "Comma-separated list of allowed hosts",
        defaultValue: "localhost,127.0.0.1",
        placeholder: "localhost,your-domain.com",
        environments: ["development", "staging", "production"],
        isSensitive: false,
        isRequired: true,
        category: "general",
      },
      {
        key: "DATABASE_URL",
        description: "Database connection URL (dj-database-url format)",
        placeholder: "postgres://user:pass@localhost:5432/dbname",
        environments: ["development", "staging", "production"],
        isSensitive: true,
        isRequired: true,
        category: "database",
      },
      {
        key: "REDIS_URL",
        description: "Redis URL for caching and Celery",
        placeholder: "redis://localhost:6379/0",
        environments: ["development", "staging", "production"],
        isSensitive: true,
        isRequired: false,
        category: "database",
      },
      {
        key: "AWS_ACCESS_KEY_ID",
        description: "AWS access key for S3 storage",
        placeholder: "AKIA...",
        environments: ["staging", "production"],
        isSensitive: true,
        isRequired: false,
        category: "storage",
      },
      {
        key: "AWS_SECRET_ACCESS_KEY",
        description: "AWS secret key for S3 storage",
        placeholder: "your-secret-key",
        environments: ["staging", "production"],
        isSensitive: true,
        isRequired: false,
        category: "storage",
      },
      {
        key: "AWS_STORAGE_BUCKET_NAME",
        description: "S3 bucket name for file storage",
        placeholder: "your-bucket-name",
        environments: ["staging", "production"],
        isSensitive: false,
        isRequired: false,
        category: "storage",
      },
    ],
  },

  // FastAPI Template
  {
    id: "fastapi-api",
    name: "FastAPI API",
    description:
      "Modern Python API with FastAPI, async database, and authentication",
    projectType: "fastapi",
    icon: "⚡",
    color: "#009688",
    tags: ["fastapi", "python", "api", "async"],
    isBuiltIn: true,
    variables: [
      {
        key: "APP_ENV",
        description: "Application environment",
        defaultValue: "development",
        placeholder: "development | staging | production",
        environments: ["development", "staging", "production"],
        isSensitive: false,
        isRequired: true,
        category: "general",
      },
      {
        key: "DEBUG",
        description: "Enable debug mode",
        defaultValue: "true",
        placeholder: "true | false",
        environments: ["development"],
        isSensitive: false,
        isRequired: false,
        category: "general",
      },
      {
        key: "DATABASE_URL",
        description: "Async database connection string",
        placeholder: "postgresql+asyncpg://user:pass@localhost:5432/dbname",
        environments: ["development", "staging", "production"],
        isSensitive: true,
        isRequired: true,
        category: "database",
      },
      {
        key: "SECRET_KEY",
        description: "Application secret key",
        placeholder: "your-secret-key-min-32-chars",
        environments: ["development", "staging", "production"],
        isSensitive: true,
        isRequired: true,
        category: "authentication",
      },
      {
        key: "ACCESS_TOKEN_EXPIRE_MINUTES",
        description: "JWT access token expiration in minutes",
        defaultValue: "30",
        placeholder: "30",
        environments: ["development", "staging", "production"],
        isSensitive: false,
        isRequired: false,
        category: "authentication",
      },
      {
        key: "CORS_ORIGINS",
        description: "Allowed CORS origins (JSON array)",
        defaultValue: '["http://localhost:3000"]',
        placeholder: '["https://your-frontend.com"]',
        environments: ["development", "staging", "production"],
        isSensitive: false,
        isRequired: false,
        category: "api",
      },
    ],
  },

  // Ruby on Rails Template
  {
    id: "rails-web",
    name: "Ruby on Rails",
    description:
      "Full Rails application with common services and deployment config",
    projectType: "rails",
    icon: "💎",
    color: "#CC0000",
    tags: ["rails", "ruby", "web", "full-stack"],
    isBuiltIn: true,
    variables: [
      {
        key: "RAILS_ENV",
        description: "Rails environment",
        defaultValue: "development",
        placeholder: "development | test | production",
        environments: ["development", "staging", "production"],
        isSensitive: false,
        isRequired: true,
        category: "general",
      },
      {
        key: "SECRET_KEY_BASE",
        description: "Rails secret key base",
        placeholder: "your-very-long-secret-key",
        environments: ["development", "staging", "production"],
        isSensitive: true,
        isRequired: true,
        category: "general",
      },
      {
        key: "DATABASE_URL",
        description: "Database connection URL",
        placeholder: "postgres://user:pass@localhost:5432/myapp_development",
        environments: ["development", "staging", "production"],
        isSensitive: true,
        isRequired: true,
        category: "database",
      },
      {
        key: "REDIS_URL",
        description: "Redis URL for caching and ActionCable",
        placeholder: "redis://localhost:6379/1",
        environments: ["development", "staging", "production"],
        isSensitive: true,
        isRequired: false,
        category: "database",
      },
      {
        key: "RAILS_MASTER_KEY",
        description: "Master key for credentials encryption",
        placeholder: "your-master-key",
        environments: ["staging", "production"],
        isSensitive: true,
        isRequired: true,
        category: "general",
      },
      {
        key: "RAILS_LOG_LEVEL",
        description: "Logging level",
        defaultValue: "info",
        placeholder: "debug | info | warn | error",
        environments: ["development", "staging", "production"],
        isSensitive: false,
        isRequired: false,
        category: "general",
      },
    ],
  },

  // Laravel Template
  {
    id: "laravel-web",
    name: "Laravel Web App",
    description:
      "Laravel application with queue, mail, and storage configuration",
    projectType: "laravel",
    icon: "🔺",
    color: "#FF2D20",
    tags: ["laravel", "php", "web", "full-stack"],
    isBuiltIn: true,
    variables: [
      {
        key: "APP_NAME",
        description: "Application name",
        defaultValue: "Laravel",
        placeholder: "Your App Name",
        environments: ["development", "staging", "production"],
        isSensitive: false,
        isRequired: true,
        category: "general",
      },
      {
        key: "APP_ENV",
        description: "Application environment",
        defaultValue: "local",
        placeholder: "local | staging | production",
        environments: ["development", "staging", "production"],
        isSensitive: false,
        isRequired: true,
        category: "general",
      },
      {
        key: "APP_KEY",
        description: "Application encryption key",
        placeholder: "base64:your-32-char-key-here...",
        environments: ["development", "staging", "production"],
        isSensitive: true,
        isRequired: true,
        category: "general",
      },
      {
        key: "APP_DEBUG",
        description: "Enable debug mode",
        defaultValue: "true",
        placeholder: "true | false",
        environments: ["development"],
        isSensitive: false,
        isRequired: false,
        category: "general",
      },
      {
        key: "APP_URL",
        description: "Application URL",
        defaultValue: "http://localhost",
        placeholder: "https://your-app.com",
        environments: ["development", "staging", "production"],
        isSensitive: false,
        isRequired: true,
        category: "general",
      },
      {
        key: "DB_CONNECTION",
        description: "Database driver",
        defaultValue: "mysql",
        placeholder: "mysql | pgsql | sqlite",
        environments: ["development", "staging", "production"],
        isSensitive: false,
        isRequired: true,
        category: "database",
      },
      {
        key: "DB_HOST",
        description: "Database host",
        defaultValue: "127.0.0.1",
        placeholder: "localhost",
        environments: ["development", "staging", "production"],
        isSensitive: false,
        isRequired: true,
        category: "database",
      },
      {
        key: "DB_PORT",
        description: "Database port",
        defaultValue: "3306",
        placeholder: "3306",
        environments: ["development", "staging", "production"],
        isSensitive: false,
        isRequired: true,
        category: "database",
      },
      {
        key: "DB_DATABASE",
        description: "Database name",
        placeholder: "your_database",
        environments: ["development", "staging", "production"],
        isSensitive: false,
        isRequired: true,
        category: "database",
      },
      {
        key: "DB_USERNAME",
        description: "Database username",
        placeholder: "root",
        environments: ["development", "staging", "production"],
        isSensitive: true,
        isRequired: true,
        category: "database",
      },
      {
        key: "DB_PASSWORD",
        description: "Database password",
        placeholder: "your-password",
        environments: ["development", "staging", "production"],
        isSensitive: true,
        isRequired: true,
        category: "database",
      },
      {
        key: "MAIL_MAILER",
        description: "Mail driver",
        defaultValue: "smtp",
        placeholder: "smtp | mailgun | ses",
        environments: ["development", "staging", "production"],
        isSensitive: false,
        isRequired: false,
        category: "email",
      },
      {
        key: "MAIL_HOST",
        description: "Mail server host",
        placeholder: "smtp.mailtrap.io",
        environments: ["development", "staging", "production"],
        isSensitive: false,
        isRequired: false,
        category: "email",
      },
      {
        key: "QUEUE_CONNECTION",
        description: "Queue driver",
        defaultValue: "sync",
        placeholder: "sync | database | redis | sqs",
        environments: ["development", "staging", "production"],
        isSensitive: false,
        isRequired: false,
        category: "general",
      },
    ],
  },
];

/**
 * Get a template by its ID
 */
export function getTemplateById(id: string): EnvironmentTemplate | undefined {
  return BUILT_IN_TEMPLATES.find((template) => template.id === id);
}

/**
 * Get templates by project type
 */
export function getTemplatesByProjectType(
  projectType: ProjectType,
): EnvironmentTemplate[] {
  return BUILT_IN_TEMPLATES.filter(
    (template) => template.projectType === projectType,
  );
}

/**
 * Search templates by tags or name
 */
export function searchTemplates(query: string): EnvironmentTemplate[] {
  const normalizedQuery = query.toLowerCase();
  return BUILT_IN_TEMPLATES.filter(
    (template) =>
      template.name.toLowerCase().includes(normalizedQuery) ||
      template.description.toLowerCase().includes(normalizedQuery) ||
      template.tags.some((tag) => tag.toLowerCase().includes(normalizedQuery)),
  );
}

/**
 * Group template variables by category
 */
export function groupVariablesByCategory(
  variables: TemplateVariable[],
): Record<TemplateVariableCategory, TemplateVariable[]> {
  const grouped: Record<TemplateVariableCategory, TemplateVariable[]> = {
    database: [],
    authentication: [],
    api: [],
    storage: [],
    email: [],
    monitoring: [],
    payment: [],
    general: [],
    deployment: [],
  };

  for (const variable of variables) {
    grouped[variable.category].push(variable);
  }

  return grouped;
}
