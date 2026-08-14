/**
 * Serialize structured data for a `<script type="application/ld+json">` body.
 *
 * `JSON.stringify` does not HTML-escape, so a `</script>` anywhere in the data
 * closes the tag early and everything after it is parsed as markup — an XSS
 * sink the moment any serialized value comes from user input or a route param.
 * Always use this instead of `JSON.stringify` for JSON embedded in markup.
 *
 * `<` closes a tag, `&` starts an entity, and U+2028/U+2029 are raw line
 * terminators to a JS parser. All four are legal inside a JSON string, so
 * escaping them keeps the payload valid JSON: `\u003c` decodes back to `<`,
 * and consumers see the original values.
 */
export function jsonLd(data: unknown): string {
  return JSON.stringify(data).replace(/[<>&\u2028\u2029]/g, (c) => ESCAPES[c]);
}

const ESCAPES: Record<string, string> = {
  "<": "\\u003c",
  ">": "\\u003e",
  "&": "\\u0026",
  "\u2028": "\\u2028",
  "\u2029": "\\u2029",
};
