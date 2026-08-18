import { v } from "convex/values";

/**
 * Machine surfaces that can present an API key, and the registry flag that
 * gates each one.
 *
 * THE single definition. It lives in lib/ (a leaf with no Convex imports)
 * because `schema.ts` and `features/api/keys.ts` both need it, and a second
 * copy in the schema is exactly how a new surface ends up accepted by the
 * mutation and rejected by the table validator.
 *
 * Adding a surface is a four-line change here plus its feature-registry seed
 * (`SEED_FEATURES` in lib/seedData.ts) and tier overrides
 * (`tierConfigs` in features/admin/migrations.ts). Nothing else re-derives it.
 */

export const SURFACES = [
  "github_action",
  "rest_api",
  "mcp_server",
  "docker",
] as const;

export type Surface = (typeof SURFACES)[number];

export const surfaceValidator = v.union(
  v.literal("github_action"),
  v.literal("rest_api"),
  v.literal("mcp_server"),
  v.literal("docker")
);

/** Registry feature keys that gate a surface. */
export type SurfaceGate = "public_api" | "mcp_server" | "docker_image";

/**
 * Which registry flag gates a surface, at BOTH mint time and request time.
 *
 * `github_action` rides `public_api` on purpose: the Action pulls through
 * /api/v1/secrets, which is the REST surface wearing a different hat.
 *
 * `docker` deliberately does NOT. The image is independently sellable and
 * independently revocable: turning off the REST API must not silently kill
 * every running container, and a plan can include container delivery without
 * including the whole public API. A surface that borrows another surface's
 * flag cannot be priced, disabled, or audited on its own.
 */
export const SURFACE_GATE: Record<Surface, SurfaceGate> = {
  github_action: "public_api",
  rest_api: "public_api",
  mcp_server: "mcp_server",
  docker: "docker_image",
};

/** Upgrade copy per gate, so a denial names the thing the user must buy. */
export const SURFACE_GATE_MESSAGE: Record<SurfaceGate, string> = {
  public_api:
    "The public API is available on the Pro plan. Upgrade to create API keys.",
  mcp_server:
    "The MCP server is available on the Pro plan. Upgrade to create MCP keys.",
  docker_image:
    "The Docker image is available on the Pro plan. Upgrade to create Docker keys.",
};

/**
 * Per-surface numeric limit: how many ACTIVE keys of this surface an org may
 * hold. Undefined means the surface has no count limit of its own.
 *
 * The unit is KEYS, not pulls — a key is a standing credential that reads
 * plaintext on every use, so what is worth bounding is how many are in
 * circulation. Pull VOLUME is bounded separately by the rate limiter.
 *
 * rest_api and mcp_server are deliberately absent: their boolean gates are
 * the whole control, and they were shipped without a count. Adding one later
 * is a seed entry plus a line here.
 */
export const SURFACE_LIMIT: Partial<Record<Surface, string>> = {
  docker: "docker_image_limit",
  github_action: "github_action_limit",
};

/** Human label for a surface, used in denial messages and admin copy. */
export const SURFACE_LABEL: Record<Surface, string> = {
  github_action: "GitHub Action",
  rest_api: "REST API",
  mcp_server: "MCP server",
  docker: "Docker",
};
