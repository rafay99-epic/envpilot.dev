/**
 * Throwaway Envpilot API, for testing the image without touching a real
 * deployment.
 *
 * It answers the two endpoints the binary reads with fixed, deliberately
 * awkward values — spaces, `#`, `?`, `&`, a multi-line PEM — because those are
 * exactly what naive dotenv quoting mangles. Every value here is fake.
 *
 * Used by `scripts/smoke.sh` locally and by
 * .github/workflows/smoke-docker-image.yml in CI. Nothing in this file ever
 * ships inside the image.
 */

const PORT = Number(process.env.STUB_PORT ?? 41777);

const VARIABLES = [
  { key: "DB_URL", value: "postgres://x?a=1&b=2" },
  { key: "MSG", value: "hello world # not a comment" },
  { key: "PEM", value: "-----BEGIN-----\nline two\n-----END-----" },
  { key: "EMPTY", value: "" },
];

const FILE = {
  name: "key.pem",
  path: "certs/key.pem",
  mode: "0400",
  size: 5,
  sha256: "0".repeat(64),
};
const FILE_BODY = Buffer.from("SECRT").toString("base64");

Bun.serve({
  port: PORT,
  fetch(request) {
    const url = new URL(request.url);

    if (url.pathname === "/healthz") return new Response("ok");

    // Mirrors the real contract closely enough to be worth testing against:
    // an unknown credential gets one uniform answer, never a hint about which
    // part was wrong.
    const auth = request.headers.get("authorization") ?? "";
    if (!auth.startsWith("Bearer envpk_")) {
      return Response.json(
        { error: "Invalid or revoked API key" },
        { status: 401 }
      );
    }

    // Exercise the Retry-After backoff on demand rather than on a timer, so
    // the test stays deterministic.
    if (url.searchParams.get("force") === "429") {
      return Response.json(
        { error: "Rate limit exceeded" },
        { status: 429, headers: { "retry-after": "1" } }
      );
    }

    if (url.pathname.match(/^\/api\/v1\/projects\/[^/]+\/variables$/)) {
      if (!url.searchParams.get("environment")) {
        return Response.json(
          { error: "Missing required query param: environment" },
          { status: 400 }
        );
      }
      return Response.json({ variables: VARIABLES });
    }

    if (url.pathname === "/api/v1/files") {
      const metadataOnly =
        url.searchParams.get("metadataOnly") === "1" ||
        url.searchParams.get("metadataOnly") === "true";
      return Response.json({
        project: { slug: url.searchParams.get("project") },
        environment: url.searchParams.get("environment"),
        files: [metadataOnly ? FILE : { ...FILE, content: FILE_BODY }],
      });
    }

    return Response.json({ error: "Not found" }, { status: 404 });
  },
});

process.stderr.write(`stub-api listening on http://127.0.0.1:${PORT}\n`);
