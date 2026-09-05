/**
 * Content for the /vs/[slug] competitor comparison pages.
 *
 * Keep claims about competitors general and durable — capabilities, not
 * exact prices or plan names, which go stale. Each entry intentionally
 * includes an honest "when to choose them" list: credible comparisons
 * convert better than one-sided ones, and they rank better too.
 */

export interface ComparisonRow {
  feature: string;
  envpilot: string;
  competitor: string;
}

export interface ComparisonFaq {
  q: string;
  a: string;
}

export interface Comparison {
  slug: string;
  /** Competitor display name, e.g. "Doppler" */
  name: string;
  title: string;
  metaTitle: string;
  metaDescription: string;
  intro: string[];
  rows: ComparisonRow[];
  chooseEnvpilot: string[];
  chooseCompetitor: string[];
  faq: ComparisonFaq[];
}

export const COMPARISONS: Comparison[] = [
  {
    slug: "doppler",
    name: "Doppler",
    title: "Envpilot vs Doppler",
    metaTitle: "Envpilot vs Doppler — Secrets Manager Comparison",
    metaDescription:
      "An honest comparison of Envpilot and Doppler for managing environment variables and secrets: encryption, access control, CLI workflow, pricing model, and when to choose each.",
    intro: [
      "Doppler is one of the most established secrets managers for development teams, with a mature product and a broad integration catalog. Envpilot is a newer, terminal-first alternative focused on doing the core job — encrypted storage, per-variable access control, and runtime injection — with less surface area and a generous free tier.",
      'Both eliminate shared .env files. The difference is philosophy: Doppler aims to be the secrets platform for your whole infrastructure; Envpilot aims to be the fastest path from "secrets in Slack" to "secrets done right" for product teams.',
    ],
    rows: [
      {
        feature: "Encryption at rest",
        envpilot:
          "AES-256 via an isolated vault (WorkOS Vault); only references stored in the app database",
        competitor: "AES-256, managed key infrastructure",
      },
      {
        feature: "Access control",
        envpilot:
          "Six capability-backed roles (Owner to Viewer) plus per-variable and per-file grants",
        competitor: "Role-based, per-project and per-config scoping",
      },
      {
        feature: "Runtime injection (no .env file on disk)",
        envpilot: "envpilot run -- <command>",
        competitor: "doppler run -- <command>",
      },
      {
        feature: "Beyond variables",
        envpilot:
          "Secret files (keystores, SSH keys, service-account JSON) and shared logins, same roles and audit trail",
        competitor: "Variables, including multi-line values",
      },
      {
        feature: "Client surfaces",
        envpilot:
          "CLI, VS Code and JetBrains, web dashboard, GitHub Action, Docker image, REST API, MCP server for agents",
        competitor: "CLI, web dashboard, broad CI/CD and cloud integrations",
      },
      {
        feature: "Audit trail",
        envpilot: "40+ event types with full attribution, exportable",
        competitor: "Activity logs, retention varies by plan",
      },
      {
        feature: "Versioning & rollback",
        envpilot: "Per-variable version history with rollback",
        competitor: "Config version history with rollback",
      },
      {
        feature: "Pricing model",
        envpilot: "Free tier; flat per-organization Pro plan",
        competitor: "Free developer tier; paid plans priced per seat",
      },
      {
        feature: "Maturity & ecosystem",
        envpilot: "Newer product, focused integration set",
        competitor: "Mature platform, large integration catalog",
      },
    ],
    chooseEnvpilot: [
      "You want flat per-organization pricing instead of per-seat costs that grow with the team",
      "Your team lives in the terminal and wants a CLI-first workflow with a native VS Code extension",
      "You need per-variable access grants (e.g. a contractor who can see exactly one API key)",
      "You want the simplest possible migration off shared .env files",
    ],
    chooseCompetitor: [
      "You need a long tail of prebuilt infrastructure integrations today",
      "You're standardizing secrets across a large org where a mature, widely-adopted platform matters",
      "You need enterprise compliance features that only established vendors currently offer",
    ],
    faq: [
      {
        q: "Can I migrate from Doppler to Envpilot?",
        a: "Yes. Export your secrets from Doppler (doppler secrets download), then bulk-import them into Envpilot via the dashboard or CLI. Per-project setup takes a few minutes.",
      },
      {
        q: "Does Envpilot have a free plan?",
        a: "Yes — the free tier includes the CLI, VS Code extension, and web dashboard with AES-256 encryption and role-based access control. No credit card required.",
      },
      {
        q: "Do both tools support runtime injection?",
        a: "Yes. Both inject variables directly into your process at runtime so no plaintext .env file is written to disk. The commands are nearly identical: envpilot run vs doppler run.",
      },
    ],
  },
  {
    slug: "infisical",
    name: "Infisical",
    title: "Envpilot vs Infisical",
    metaTitle: "Envpilot vs Infisical — Secrets Manager Comparison",
    metaDescription:
      "An honest comparison of Envpilot and Infisical: managed simplicity vs open-source self-hosting, encryption, access control, CLI workflow, and when to choose each.",
    intro: [
      "Infisical is an open-source secrets management platform — you can self-host it or use their cloud, and it has grown a wide feature surface including secret scanning, certificate management, and Kubernetes operators. Envpilot is a managed, terminal-first service focused on team environment variables specifically.",
      "The core question between them is usually self-hosting: if running your own secrets infrastructure is a requirement, Infisical is the natural pick. If you want the problem solved without operating anything, Envpilot keeps the footprint small.",
    ],
    rows: [
      {
        feature: "Hosting model",
        envpilot: "Fully managed cloud; no self-hosted option",
        competitor: "Self-hosted (open source) or managed cloud",
      },
      {
        feature: "Source model",
        envpilot: "Open source (MIT) on GitHub, hosted as a service",
        competitor: "Open source core (MIT-licensed components)",
      },
      {
        feature: "Encryption at rest",
        envpilot:
          "AES-256 via an isolated vault; zero plaintext in the app database",
        competitor:
          "AES-256; supports bring-your-own configurations when self-hosting",
      },
      {
        feature: "Access control",
        envpilot: "Role-based plus per-variable grants",
        competitor: "Role-based with environment-level scoping",
      },
      {
        feature: "Runtime injection",
        envpilot: "envpilot run -- <command>",
        competitor: "infisical run -- <command>",
      },
      {
        feature: "Editor integration",
        envpilot: "VS Code and JetBrains plugins with real-time sync",
        competitor: "CLI-centric; community editor tooling",
      },
      {
        feature: "Beyond variables",
        envpilot:
          "Secret files and shared logins in the same project, same roles, same audit trail",
        competitor: "SSH and PKI as separate products in the platform",
      },
      {
        feature: "Scope",
        envpilot: "Focused: what a product team shares, done well",
        competitor: "Broad: secrets, PKI, SSH, scanning, K8s operator",
      },
      {
        feature: "Operational burden",
        envpilot: "None — managed",
        competitor: "You run it (self-hosted) or none (their cloud)",
      },
    ],
    chooseEnvpilot: [
      "You want a managed service with zero infrastructure to operate or upgrade",
      "Your team wants tight editor integration (VS Code) alongside the CLI",
      "You need per-variable access grants for contractors or partial access",
      "You prefer a focused tool over a broad platform you'll use 10% of",
    ],
    chooseCompetitor: [
      "Self-hosting is a hard requirement (data residency, air-gapped environments, policy)",
      "You need the broader platform features: secret scanning, PKI, Kubernetes operator",
    ],
    faq: [
      {
        q: "Is Envpilot open source?",
        a: "Yes. The whole platform is MIT-licensed and public at github.com/rafay99-epic/envpilot.dev, and the CLI is on npm. What Envpilot does not offer is self-hosting: the hosted service is the only deployment. If running it yourself is a requirement, Infisical is the better fit.",
      },
      {
        q: "Can I migrate from Infisical to Envpilot?",
        a: "Yes. Export secrets via the Infisical CLI or dashboard, then bulk-import them into Envpilot. Both tools use the same .env-compatible format, so migration is mostly copy-paste.",
      },
      {
        q: "Which is easier to set up?",
        a: "For a managed experience both are quick. If you self-host Infisical you take on database, upgrades, and availability — Envpilot has no self-hosted option but also nothing to operate.",
      },
    ],
  },
  {
    slug: "phase",
    name: "Phase",
    title: "Envpilot vs Phase",
    metaTitle: "Envpilot vs Phase — Secrets Manager Comparison",
    metaDescription:
      "An honest comparison of Envpilot and Phase for team secrets: hosting, encryption, access control, what each stores beyond environment variables, pricing model, and when to choose each.",
    intro: [
      "Phase is an open-source, end-to-end encrypted secrets platform you can self-host or use as a cloud service, with a console, CLI, SDKs and a Kubernetes operator. Envpilot is a managed service built around what a product team actually shares: environment variables, the secret files that never fit in one, and the shared logins that usually live in the group chat.",
      "Both replace the .env in Slack. Phase leans toward infrastructure teams who want to run their own secrets platform and wire it into deployment tooling. Envpilot leans toward small teams who want the sharing problem gone, in the terminal, the editor and the agent, without operating anything.",
    ],
    rows: [
      {
        feature: "Hosting model",
        envpilot: "Fully managed cloud; no self-hosted option",
        competitor: "Self-hosted (Docker, Kubernetes, cloud) or managed cloud",
      },
      {
        feature: "Source model",
        envpilot: "Open source (MIT) on GitHub, hosted as a service",
        competitor: "Open source",
      },
      {
        feature: "Encryption at rest",
        envpilot:
          "AES-256 via an isolated vault (WorkOS Vault); only references stored in the app database",
        competitor: "End-to-end encrypted, client-side keys",
      },
      {
        feature: "Access control",
        envpilot:
          "Six capability-backed roles plus per-variable and per-file grants with optional expiry",
        competitor: "Role-based, scoped by app and environment",
      },
      {
        feature: "Runtime injection",
        envpilot: "envpilot run -- <command>",
        competitor: "phase run -- <command>",
      },
      {
        feature: "Beyond variables",
        envpilot:
          "Secret files (keystores, SSH keys, service-account JSON) and shared logins, same roles and audit trail",
        competitor: "Variables, with secret referencing and personal overrides",
      },
      {
        feature: "Editor and agent access",
        envpilot:
          "VS Code and JetBrains plugins, plus a read-only MCP server with scoped keys",
        competitor: "CLI and SDKs; integrations for deployment targets",
      },
      {
        feature: "Change control",
        envpilot:
          "Protected environments: writes become change requests a second person approves",
        competitor: "Role-based write access per environment",
      },
      {
        feature: "Pricing model",
        envpilot: "Free tier; flat per-organization Pro plan",
        competitor: "Free tier; paid plans priced per user",
      },
    ],
    chooseEnvpilot: [
      "You share more than variables: signing keystores, service-account JSON, SSH keys, a vendor dashboard login",
      "You want flat per-organization pricing instead of per-user costs",
      "Your team wants secrets in the editor and in the coding agent, not only in the shell",
      "Production changes should need a second approval before they land",
    ],
    chooseCompetitor: [
      "Self-hosting is a hard requirement (data residency, air-gapped environments, policy)",
      "You want end-to-end encryption where the server never holds a decryption key",
      "You are wiring secrets into Kubernetes and deployment platforms and want a native operator",
    ],
    faq: [
      {
        q: "Can I migrate from Phase to Envpilot?",
        a: "Yes. Export each environment from the Phase CLI or console as dotenv text, then bulk-import it into Envpilot from the dashboard or with envpilot push. Files and shared logins are added separately, since Phase has no equivalent object.",
      },
      {
        q: "Is Envpilot end-to-end encrypted like Phase?",
        a: "No, and the difference matters. Phase encrypts on the client so its server cannot read your secrets. Envpilot decrypts server-side through an isolated vault so that the dashboard, share links, MCP tools and the audit trail can work on values. If a server that never holds a key is your requirement, Phase is the right pick.",
      },
      {
        q: "Does Envpilot self-host?",
        a: "No. Envpilot is open source under MIT, but the hosted service is the only deployment. Phase and Infisical both offer self-hosting.",
      },
    ],
  },
  {
    slug: "dotenv",
    name: ".env files",
    title: "Envpilot vs .env files",
    metaTitle: "Envpilot vs .env Files (dotenv) — When to Graduate from .env",
    metaDescription:
      "When do .env files stop being enough? A practical comparison of plain dotenv files vs a managed environment variable platform: sharing, rotation, access control, and auditability.",
    intro: [
      "The dotenv pattern — a gitignored .env file loaded at startup — is how almost every project starts, and for a solo developer it's genuinely fine. The problems start when a second person needs the values, because .env files have no story for sharing, rotation, access control, or auditing.",
      "This isn't a takedown of dotenv; it's a map of where the pattern breaks and what a managed platform adds when it does.",
    ],
    rows: [
      {
        feature: "Storage",
        envpilot: "AES-256 encrypted in an isolated vault",
        competitor: "Plaintext file on every developer's disk",
      },
      {
        feature: "Sharing with teammates",
        envpilot: "Add them to the project; they pull with the CLI",
        competitor: "Slack/email/copy-paste — unencrypted and permanent",
      },
      {
        feature: "Rotating a secret",
        envpilot: "Update once; everyone gets it on next run",
        competitor: "Update N copies by hand; drift until everyone catches up",
      },
      {
        feature: "Access control",
        envpilot: "Role-based + per-variable grants",
        competitor: "None — whoever has the file has everything in it",
      },
      {
        feature: "Offboarding",
        envpilot: "Remove the member; access ends immediately",
        competitor: "Impossible — their copy of the file still works",
      },
      {
        feature: "Audit trail",
        envpilot: "Every read/write/share logged with attribution",
        competitor: "None",
      },
      {
        feature: "Accidental commits",
        envpilot: "Nothing to commit — values injected at runtime",
        competitor: "One missing .gitignore line from leaking",
      },
      {
        feature: "Cost & setup",
        envpilot: "Free tier; a few minutes of setup",
        competitor: "Free; zero setup",
      },
    ],
    chooseEnvpilot: [
      "More than one person needs the values — sharing is where .env files break first",
      "You have production credentials that would hurt if they leaked",
      "You need to offboard people without rotating every secret they ever saw",
      "Compliance asks how secrets are distributed and who has access",
    ],
    chooseCompetitor: [
      "Solo project, no shared secrets, nothing sensitive at stake",
      "Throwaway prototypes and hackathon code",
      "Fully offline development with no network access",
    ],
    faq: [
      {
        q: "Do I have to delete my .env files to use Envpilot?",
        a: "You import them once, then stop maintaining them. envpilot run injects variables directly into your process, so no plaintext file needs to exist on disk at all.",
      },
      {
        q: "Does this work with dotenv-based frameworks like Next.js or Vite?",
        a: "Yes — runtime injection puts values into process.env before your app starts, which is exactly where dotenv would have put them. No code changes required.",
      },
      {
        q: "What about .env.vault and encrypted variants?",
        a: "Encrypted-file approaches fix storage but not the rest: key distribution, revocation, per-secret access, and audit logging still have no answer. They're a patch on the pattern rather than a replacement for it.",
      },
    ],
  },
];

export function getComparisonBySlug(slug: string): Comparison | null {
  return COMPARISONS.find((c) => c.slug === slug) ?? null;
}
