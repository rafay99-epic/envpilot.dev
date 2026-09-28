import { exportJWK, generateKeyPair, SignJWT } from "jose";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const ISSUER = "https://auth.example.test";
const RESOURCE = "https://app.example.test/api/mcp";

let privateKey: CryptoKey;
let verifyMcpToken: typeof import("@/lib/mcp/auth").verifyMcpToken;

async function sign(
  claims: { aud?: string; iss?: string; exp?: number },
  key: CryptoKey = privateKey
): Promise<string> {
  return new SignJWT({ client_id: "claude" })
    .setProtectedHeader({ alg: "RS256", kid: "k1" })
    .setSubject("user_123")
    .setIssuer(claims.iss ?? ISSUER)
    .setAudience(claims.aud ?? RESOURCE)
    .setIssuedAt()
    .setExpirationTime(claims.exp ?? Math.floor(Date.now() / 1000) + 300)
    .sign(key);
}

beforeAll(async () => {
  const pair = await generateKeyPair("RS256");
  privateKey = pair.privateKey;
  const jwk = { ...(await exportJWK(pair.publicKey)), kid: "k1", alg: "RS256" };
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => Response.json({ keys: [jwk] }))
  );
  vi.stubEnv("MCP_OAUTH_ISSUER", ISSUER);
  vi.stubEnv("MCP_OAUTH_RESOURCE", RESOURCE);
  ({ verifyMcpToken } = await import("@/lib/mcp/auth"));
});

afterAll(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

const request = new Request(RESOURCE);

describe("verifyMcpToken", () => {
  it("passes API keys through for Convex to enforce", async () => {
    const info = await verifyMcpToken(request, "envpk_abc");
    expect(info?.extra?.kind).toBe("key");
  });

  it("accepts a token issued for this resource", async () => {
    const info = await verifyMcpToken(request, await sign({}));
    expect(info?.extra?.kind).toBe("oauth");
    expect(info?.clientId).toBe("claude");
  });

  it("rejects a token issued for another audience", async () => {
    const token = await sign({ aud: "https://app.example.test" });
    expect(await verifyMcpToken(request, token)).toBeUndefined();
  });

  it("rejects a token from another issuer", async () => {
    const token = await sign({ iss: "https://evil.example.test" });
    expect(await verifyMcpToken(request, token)).toBeUndefined();
  });

  it("rejects an expired token", async () => {
    const token = await sign({ exp: Math.floor(Date.now() / 1000) - 60 });
    expect(await verifyMcpToken(request, token)).toBeUndefined();
  });

  it("rejects a token signed by an unknown key", async () => {
    const other = await generateKeyPair("RS256");
    const token = await sign({}, other.privateKey);
    expect(await verifyMcpToken(request, token)).toBeUndefined();
  });

  it("rejects a missing header", async () => {
    expect(await verifyMcpToken(request, undefined)).toBeUndefined();
  });
});
