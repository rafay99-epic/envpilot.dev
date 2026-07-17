# Security Policy

Envpilot is a secrets-management platform — security is the product. We take
vulnerabilities seriously and appreciate responsible disclosure.

## Reporting a vulnerability

**Do not open a public GitHub issue for security problems.** Public issues
expose users before a fix ships.

Instead, report privately through one of:

- **GitHub Security Advisories** (preferred): open a private report at
  [github.com/rafay99-epic/envpilot.dev/security/advisories/new](https://github.com/rafay99-epic/envpilot.dev/security/advisories/new).
- **Email:** send details to the maintainer at **backend@tudotechlab.com** with
  subject line `SECURITY: Envpilot`.

Please include:

- A description of the vulnerability and its impact.
- Steps to reproduce (proof-of-concept if possible).
- Affected component(s): web app, CLI, VS Code extension, GitHub Action, or backend.
- Any suggested remediation.

## What to expect

- **Acknowledgement** within 72 hours.
- An initial assessment and severity rating shortly after.
- Coordinated disclosure: we'll work with you on a fix and a disclosure
  timeline, and credit you in the release notes unless you prefer to remain
  anonymous.

Please give us a reasonable window to remediate before any public disclosure.

## Supported versions

Security fixes target the latest released version of each surface. Older
CLI/extension builds are covered by the minimum-supported-version enforcement
(`apps/web/src/lib/versions.ts`): clients below the floor are prompted to
upgrade rather than left running vulnerable code.

| Surface           | Supported                                   |
| ----------------- | ------------------------------------------- |
| Web / backend     | Latest deployed                             |
| CLI               | Latest published + `minCli` and above       |
| VS Code extension | Latest published + `minExtension` and above |
| GitHub Action     | Latest `v1` tag                             |

## Scope

In scope: the code in this repository — the web app and API, CLI, VS Code
extension, GitHub Action, and Convex backend functions.

Out of scope: vulnerabilities in third-party services Envpilot integrates with
(WorkOS, Convex, Vercel, Polar, Resend) — report those to the respective
vendor. Findings that require a compromised developer machine, social
engineering, or physical access are also out of scope.

## Handling of secrets

Actual secret **values** are stored in WorkOS Vault, never in the Convex
database (which holds only vault reference IDs). If you believe a secret could
be exposed through the platform, treat it as in scope and report it privately.
