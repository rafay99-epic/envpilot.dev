# Secure build artifacts: B2 deployment handoff

This feature stores build files such as Firebase service-account JSON,
Android signing files, Apple signing material, SSH keys, and platform config
files as encrypted artifacts.

## Security model

The first release uses **managed client-side encryption**:

1. The browser generates a fresh AES-256-GCM key and encrypts the file locally.
2. The browser uploads only ciphertext directly to a private Backblaze B2
   bucket using a short-lived S3 presigned URL.
3. Convex stores metadata and an opaque WorkOS Vault reference to the AES key.
   It never stores the file bytes or plaintext key.
4. A download requires project authorization, then returns a short-lived B2
   URL and the key to the authorized client. The client verifies the SHA-256
   ciphertext hash before decrypting.

This is not device-independent end-to-end encryption yet: an authorized
download client can receive the decryption key. The schema leaves room for a
future `e2e` mode with per-device public-key envelopes.

## B2 setup

Create a **private** B2 bucket dedicated to Envpilot artifacts. Use an
application key restricted to that bucket. For the S3-compatible SDK flow,
enable `listAllBucketNames`, `listFiles`, `readFiles`, `writeFiles`, and
`deleteFiles`. The web service needs version listing because B2 buckets are
always versioned and a delete-by-name operation does not permanently remove
older ciphertext versions. Do not use the account master key and do not make
the bucket public.

Configure the bucket's S3-compatible CORS policy with:

- the exact production web origin (and the local development origin if needed),
- `PUT`, `GET`, and `HEAD` operations,
- request header `Content-Type`,
- exposed response header `ETag`,
- a bounded preflight cache such as 300 seconds.

For example, save the following as `b2-cors.json`, replace the origins, and
apply it with an account/admin credential that can manage the bucket. Do not
give bucket-management permission to the runtime application key.

```json
{
  "CORSRules": [
    {
      "AllowedOrigins": [
        "https://your-production-domain.example",
        "http://localhost:3000"
      ],
      "AllowedMethods": ["GET", "HEAD", "PUT"],
      "AllowedHeaders": ["Content-Type"],
      "ExposeHeaders": ["ETag"],
      "MaxAgeSeconds": 300
    }
  ]
}
```

```bash
aws s3api put-bucket-cors \
  --bucket "<private-bucket-name>" \
  --cors-configuration file://b2-cors.json \
  --endpoint-url "https://s3.<your-b2-region>.backblazeb2.com"
```

The same rule can be entered in the Backblaze bucket's CORS settings by
selecting the S3-compatible API. Keep origins exact; do not use `*` for a
private artifact bucket.

Set these server-only variables in the web/production environment. Never use a
`NEXT_PUBLIC_` prefix for them:

```bash
B2_ENDPOINT_URL=https://s3.<your-b2-region>.backblazeb2.com
B2_REGION=<your-b2-region>
B2_BUCKET=<private-bucket-name>
B2_KEY_ID=<bucket-restricted-key-id>
B2_APPLICATION_KEY=<bucket-restricted-application-key>
B2_SIGNED_URL_TTL_SECONDS=300
```

The production deployment also needs the existing `WORKOS_API_KEY` in the
Convex deployment environment because the artifact data key is kept in WorkOS
Vault, not in B2 or Convex.

## Cost and lifecycle controls

- Convex stores small metadata rows only; file bytes bypass Convex entirely.
- Encryption and decryption happen once per upload/download on the client.
- B2 signed URLs expire after five minutes by default and are never persisted.
- The implementation caps one artifact at 50 MiB and lists at most 100 ready
  artifacts per project. The Pro tier is capped at 100 active artifacts per
  organization (roughly 5 GiB at the per-file maximum).
- Upload session creation is limited to 10 per minute per organization.
  Decryption-key reads are limited to 60 per minute per user.
- Direct uploads first land in `artifact-uploads/`. After byte-count
  verification, B2 performs a server-side copy into the durable `artifacts/`
  prefix; the browser never downloads/re-uploads during promotion.
- Failed browser uploads call a cancellation endpoint that attempts to
  permanently purge every B2 object version, deletes the WorkOS Vault key, and
  then retires the Convex metadata. Key revocation and metadata retirement still
  complete if B2 is temporarily unavailable; the temporary-prefix lifecycle
  rule below removes any orphaned ciphertext. Normal deletion remains strict
  and uses the permanent version purge before retiring metadata.
- An hourly Convex job retires sessions older than one hour and retries Vault
  key cleanup until WorkOS confirms deletion.
- Configure this B2 lifecycle rule for the temporary prefix. It hides abandoned
  current versions after one day and permanently deletes them one day later:

  ```json
  {
    "fileNamePrefix": "artifact-uploads/",
    "daysFromUploadingToHiding": 1,
    "daysFromHidingToDeleting": 1,
    "daysFromStartingToCancelingUnfinishedLargeFiles": 1
  }
  ```

  This is the recovery path for a browser or network that disappears before it
  can call cancellation. Never apply that short rule to the durable
  `artifacts/` prefix.

- Keep the application key restricted to the artifact bucket so a leaked server
  credential cannot reach other storage.

The B2 account key remains server-only. Browsers receive a single-object,
five-minute PUT or GET URL; they never receive bucket credentials or list/delete
permissions.

### Values to copy from Backblaze

Envpilot does **not** use Backblaze's native bucket ID. Copy these values:

1. **Bucket name** — Buckets → your private bucket → bucket name.
2. **Region** — the region shown for the bucket, such as `us-west-004`.
3. **S3 endpoint** — `https://s3.<region>.backblazeb2.com`.
4. **Key ID and application key** — App Keys → Add a New Application Key.
   Restrict it to this bucket and grant `listAllBucketNames`, `listFiles`,
   `readFiles`, `writeFiles`, and `deleteFiles`. The application key is shown
   once; put it directly in `.env.local`/the production host, never in chat.

After setting the five `B2_*` variables, restart the already-running web
process yourself so Next.js receives them. Set `WORKOS_API_KEY` in the Convex
deployment separately. Codex can verify that the variable names are present
without printing their values.

## Artifact authorization

Artifacts do not inherit ordinary variable or project-read permissions. The
role registry exposes four separate critical-risk capabilities:

- `project.artifacts.read`
- `project.artifacts.create`
- `project.artifacts.update`
- `project.artifacts.delete`

Owner, project manager, and team lead receive all four by default. Developer,
editor, viewer, and custom roles receive none unless an administrator explicitly
grants them. This prevents a metadata-only project viewer from receiving APK,
Apple, SSH, or service-account signing material.

## Client surface rollout

All clients use short-lived object URLs and decrypt locally after verifying the
ciphertext hash. None receives B2 account credentials.

- Dashboard: project-specific list, upload, replace/version, download, delete.
- CLI: `envpilot artifacts list` and `envpilot artifacts pull`; default output
  is `.envpilot-artifacts/`, mode `0600`.
- VS Code: **Envpilot: Pull Secure Artifacts**; the user selects a linked
  project, files, linked directory, and relative destination.
- GitHub Action: set `artifacts` to a comma-separated list or `*`, plus
  `artifact-dir`. Use `pull-variables: "false"` for an artifacts-only key.

The dashboard/JWT clients use the caller's project artifact capabilities. The
Action uses the existing API-key authorization core and requires a key scoped
to exactly one project, the GitHub Action surface, and the `artifacts`
resource. Machine credentials are read-only.

## End-to-end test checklist before merge

1. Run the feature/tier and role seed migrations against the development
   Convex deployment.
2. Sign in as an owner/project manager/team lead and upload a small test file.
3. Download it and compare its SHA-256 hash with the original.
4. Replace it; confirm the row advances to the next version and downloads the
   replacement.
5. Run `envpilot artifacts pull --name <artifact> --dir <scratch-dir>` through
   `apps/cli/scripts/cli-dev.sh`; compare the file and confirm mode `0600`.
6. Run **Envpilot: Pull Secure Artifacts** in the development extension host and
   compare the output.
7. Create a one-project GitHub Action key with `artifacts` scope, store it as a
   repository secret, and run a workflow with a disposable artifact.
8. Delete the dashboard artifact; confirm the list updates and a subsequent
   CLI/Action pull fails.
9. Run the focused Playwright artifact spec. Then the developer runs the full
   local Playwright suite, as required by this repository, before merge.
