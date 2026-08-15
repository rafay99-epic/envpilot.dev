// The HTML parser ends a <script> body at the first "</script", so raw JSON in
// `dangerouslySetInnerHTML` can break out of the tag. Escaping the three
// HTML-significant characters as unicode escapes keeps the JSON valid while
// making that impossible.
const HTML_ESCAPES: Record<string, string> = {
  "<": "\\u003c",
  ">": "\\u003e",
  "&": "\\u0026",
};

/** Serialize a JSON-LD payload for safe embedding in a <script> tag. */
export function jsonLdScript(data: unknown): string {
  return JSON.stringify(data).replace(
    /[<>&]/g,
    (char) => HTML_ESCAPES[char] ?? char
  );
}
