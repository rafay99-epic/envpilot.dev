import { describe, expect, it } from "vitest";

import { getBearerToken, parseMetadataOnly } from "@/lib/public-api";

function request(headers: Record<string, string> = {}): Request {
  return new Request("https://example.test/api/v1/secrets", { headers });
}

describe("getBearerToken", () => {
  it("accepts the canonical form", () => {
    expect(getBearerToken(request({ authorization: "Bearer envpk_abc" }))).toBe(
      "envpk_abc"
    );
  });

  it("matches the scheme case insensitively", () => {
    // RFC 7235 defines the scheme as case insensitive. A client sending
    // lowercase used to get 401 MISSING_TOKEN and conclude its key was bad.
    for (const scheme of ["bearer", "BEARER", "BeArEr"]) {
      expect(
        getBearerToken(request({ authorization: `${scheme} envpk_abc` })),
        scheme
      ).toBe("envpk_abc");
    }
  });

  it("tolerates extra whitespace", () => {
    expect(
      getBearerToken(request({ authorization: "  Bearer   envpk_abc  " }))
    ).toBe("envpk_abc");
  });

  it("rejects a missing, empty or non-bearer credential", () => {
    expect(getBearerToken(request())).toBeNull();
    expect(getBearerToken(request({ authorization: "Bearer" }))).toBeNull();
    expect(getBearerToken(request({ authorization: "Bearer " }))).toBeNull();
    expect(
      getBearerToken(request({ authorization: "Basic dXNlcjpwYXNz" }))
    ).toBeNull();
    // Not a prefix match on some other scheme that happens to start the same.
    expect(
      getBearerToken(request({ authorization: "Bearerish envpk_abc" }))
    ).toBeNull();
  });
});

describe("parseMetadataOnly", () => {
  it("is undefined when the parameter is absent", () => {
    expect(parseMetadataOnly(new URLSearchParams())).toBeUndefined();
  });

  it("accepts both spellings", () => {
    // Two routes used metadata_only, a third metadataOnly, so ?metadata_only=1
    // parsed as false and then 400d asking for an environment.
    expect(parseMetadataOnly(new URLSearchParams("metadata_only=true"))).toBe(
      true
    );
    expect(parseMetadataOnly(new URLSearchParams("metadataOnly=true"))).toBe(
      true
    );
  });

  it("accepts the usual truthy words, in any case", () => {
    for (const raw of ["1", "true", "TRUE", "yes", "on", " true "]) {
      expect(
        parseMetadataOnly(new URLSearchParams(`metadata_only=${raw}`)),
        raw
      ).toBe(true);
    }
  });

  it("is false for anything else, not undefined", () => {
    for (const raw of ["0", "false", "no", "maybe", ""]) {
      expect(
        parseMetadataOnly(new URLSearchParams(`metadata_only=${raw}`)),
        raw
      ).toBe(false);
    }
  });
});
