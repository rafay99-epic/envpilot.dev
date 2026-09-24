function decodeJwtPayload(token: string): Record<string, unknown> | null {
  const payload = token.split(".")[1];
  if (!payload) return null;
  try {
    const parsed = JSON.parse(
      Buffer.from(payload, "base64url").toString("utf-8")
    );
    return typeof parsed === "object" && parsed !== null ? parsed : null;
  } catch {
    return null;
  }
}

export function getJwtExp(token: string): number | null {
  const payload = decodeJwtPayload(token);
  const exp = payload?.exp;
  return typeof exp === "number" ? exp : null;
}

export function getJwtSessionId(token: string): string | null {
  const payload = decodeJwtPayload(token);
  const sid = payload?.sid;
  return typeof sid === "string" ? sid : null;
}

export function getJwtSubject(token: string): string | null {
  const payload = decodeJwtPayload(token);
  const sub = payload?.sub;
  return typeof sub === "string" ? sub : null;
}

export function isTokenExpiring(token: string, skewSeconds = 60): boolean {
  const exp = getJwtExp(token);
  if (exp === null) return true;
  const nowSeconds = Date.now() / 1000;
  return exp - nowSeconds <= skewSeconds;
}
