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
application key restricted to that bucket and grant only the operations needed
by this service: list the bucket, read files, write files, and delete files.
Do not use the account master key and do not make the bucket public.

Configure the bucket's S3-compatible CORS policy with:

- the exact production web origin (and the local development origin if needed),
- `PUT`, `GET`, and `HEAD` operations,
- request header `Content-Type`,
- exposed response header `ETag`,
- a bounded preflight cache such as 300 seconds.

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
  artifacts per project.
- Configure a B2 lifecycle rule to hide/delete incomplete multipart uploads and
  stale deleted objects. Keep the application key restricted to the artifact
  bucket so a leaked web credential cannot reach other storage.

## Client surface rollout

The dashboard slice is the first release and provides the canonical upload,
download, integrity-check, delete, RBAC, audit, and tier-gate behavior. CLI,
VS Code, and GitHub Action support should call a dedicated machine-artifact
endpoint using the existing API-key authorization core; they should never be
given direct B2 account credentials. That endpoint is the next slice for
machine clients and should preserve project, environment/surface scope,
short-lived URLs, and audit logging.
