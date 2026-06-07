# Envpilot Roadmap

Planned features and enhancements for future development.

---

## High Impact

### Secret Rotation & Expiry (DONE)

- Auto-expire secrets after a configurable TTL
- Rotation reminders and notifications via email
- Rotation history tracking in audit logs
- Dashboard widget showing soon-to-expire secrets

### Environment Cloning

- Clone all variables from one environment to another (e.g., staging to production)
- Selective clone with diff preview before applying
- CLI command: `envpilot clone --from staging --to production`

### Webhooks / Event Notifications

- Notify external services (Slack, Discord, PagerDuty) when variables change
- Configurable per-project webhook URLs
- Event types: variable created/updated/deleted, permission changed, member added

### Secret Sharing (Time-Limited Links) (DONE)

- Generate a one-time or time-limited link to share a secret value
- Auto-expires after view or TTL
- Audit logged with viewer info

### Variable Groups / Tags (DONE)

- Group related variables (e.g., "Database", "AWS", "API Keys")
- Filter and search by tag in dashboard, CLI, and extension
- Bulk operations on groups

---

## Medium Impact

### Environment Comparison (Cross-Project)

- Extend existing env diff to compare across projects
- Useful for microservices that should share certain configs

### Import/Export Formats (Done)

- Import from YAML, JSON, docker-compose.yml, AWS Parameter Store, Vercel, Netlify
- Export to those same formats
- CLI: `envpilot pull --format docker-compose`

### Variable Validation Rules 

- Define regex patterns or value constraints per variable (e.g., URL format, port range)
- Warn on push if values don't match rules
- Template-level validation defaults

### Personal / Local Overrides

- Let developers define personal overrides that layer on top of shared variables
- Never synced to other team members
- Useful for `DEBUG=true` or local ports

### CLI `run` Command. (Done)

- `envpilot run -- node server.js` — inject env vars into a subprocess without writing `.env`
- Prevents secrets from ever touching disk
- Similar to `doppler run` or `infisical run`

---

## Nice to Have

### Variable References / Interpolation

- Support `${VAR_NAME}` referencing other variables
- Resolve at pull/sync time
- Reduces duplication across environments
- Circular reference detection required

### Branch-Based Environments 

- Auto-create environment configs tied to git branches
- Preview environment support for CI/CD
- Extend the environments field to allow arbitrary names

### Two-Person Rule for Production

- Require approval from 2+ admins before production variable changes take effect
- Extend existing variable request workflow with quorum requirements
- Notification emails to required approvers

### SDK / Language Libraries

- Lightweight SDKs (Node, Python, Go) that fetch secrets at runtime
- No `.env` file needed in production
- Auto-refresh on change via WebSocket
- Packages: `packages/sdk-node/`, `packages/sdk-python/`, `packages/sdk-go/`

### Dashboard Analytics Charts (DONE)

- Charts for variable change frequency, most active projects, team activity
- Security insights: unused variables, overly broad permissions, stale access tokens
- Charting library integration (recharts or chart.js)

### Terraform / IaC Provider

- Terraform provider to manage Envpilot projects and variables as code
- Resources: `envpilot_project`, `envpilot_variable`
- GitOps workflow for environment configuration
- Publish to Terraform Registry
