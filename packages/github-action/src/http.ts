/**
 * Safely parse a JSON error body from a Response, returning a fallback
 * if the body is not valid JSON (e.g., HTML error pages, empty bodies).
 */
export async function safeReadBody(
  response: Response
): Promise<{ error?: string; code?: string }> {
  try {
    return (await response.json()) as { error?: string; code?: string };
  } catch {
    return { error: response.statusText };
  }
}
