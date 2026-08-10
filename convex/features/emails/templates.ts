// ============================================================
// Email HTML template helpers
// (split out of the former root emails.ts — pure move, no logic changes)
// ============================================================

export function escapeHtml(text: string): string {
  const map: Record<string, string> = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;",
  };
  return text.replace(/[&<>"']/g, (char) => map[char]);
}

// ── Brand tokens ────────────────────────────────────────────────────────────
// Envpilot's identity is a dark terminal aesthetic with a signature green
// accent (mirrors apps/web globals.css + the `$ envpilot` prompt wordmark).
export const FONT_SANS =
  "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif";
export const FONT_MONO =
  "'SF Mono', ui-monospace, 'Cascadia Code', 'JetBrains Mono', 'Roboto Mono', Menlo, Consolas, monospace";
export const BRAND_GREEN = "#22c55e";
export const PAGE_BG = "#09090b"; // zinc-950
export const CARD_BG = "#0a0a0a";
export const CHROME_BG = "#18181b"; // zinc-900
export const BORDER = "#27272a"; // zinc-800

// Inline monospace token (e.g. a variable name) styled for the dark theme.
export const CODE_STYLE = `background:${CHROME_BG}; border:1px solid ${BORDER}; padding:2px 7px; border-radius:5px; color:#4ade80; font-family:${FONT_MONO}; font-size:13px;`;

/**
 * Outer shell for every transactional email.
 *
 * `title` and `preheader` are escaped HERE rather than at each call site.
 * They are the two slots that regularly carry stored, user-supplied text — a
 * document title, a display name — and unlike `body` they are not assembled
 * from already-escaped row helpers, so an unescaped one is injected markup in
 * a message sent from the organization's own domain.
 */
export function emailWrapper(
  rawTitle: string,
  body: string,
  rawPreheader = ""
): string {
  const title = escapeHtml(rawTitle);
  const preheader = escapeHtml(rawPreheader);
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="color-scheme" content="dark">
  <meta name="supported-color-schemes" content="dark">
  <title>${title}</title>
</head>
<body style="margin: 0; padding: 0; width: 100%; background-color: ${PAGE_BG}; -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%;">
  ${preheader ? `<div style="display:none; max-height:0; overflow:hidden; opacity:0; color:${PAGE_BG}; font-size:1px; line-height:1px;">${preheader}</div>` : ""}
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color: ${PAGE_BG};">
    <tr>
      <td align="center" style="padding: 40px 20px;">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width: 100%; max-width: 600px; background-color: ${CARD_BG}; border: 1px solid ${BORDER}; border-radius: 14px; overflow: hidden;">
          <tr>
            <td style="padding: 14px 18px; background-color: ${CHROME_BG}; border-bottom: 1px solid ${BORDER};">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td width="70" valign="middle" style="line-height: 0;">
                    <span style="display:inline-block; width:11px; height:11px; border-radius:50%; background-color:#ff5f56;">&nbsp;</span>
                    <span style="display:inline-block; width:11px; height:11px; border-radius:50%; background-color:#febc2e; margin-left:6px;">&nbsp;</span>
                    <span style="display:inline-block; width:11px; height:11px; border-radius:50%; background-color:#28c840; margin-left:6px;">&nbsp;</span>
                  </td>
                  <td valign="middle" align="center" style="font-family: ${FONT_MONO}; font-size: 12px; color: #71717a; letter-spacing: 0.02em;">bash — envpilot</td>
                  <td width="70">&nbsp;</td>
                </tr>
              </table>
            </td>
          </tr>
          ${body}
        </table>
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width: 100%; max-width: 600px;">
          <tr>
            <td align="center" style="padding: 26px 20px 0 20px;">
              <span style="font-family: ${FONT_MONO}; font-size: 14px; font-weight: 600; color: #71717a;"><span style="color: ${BRAND_GREEN};">$</span> envpilot</span>
              <div style="font-family: ${FONT_SANS}; font-size: 11px; color: #3f3f46; padding-top: 8px;">Secure environment variables for modern teams</div>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

export function iconRow(initial: string, accent = BRAND_GREEN): string {
  return `<tr>
  <td style="padding: 44px 40px 18px 40px; text-align: center;">
    <table role="presentation" cellpadding="0" cellspacing="0" align="center" style="margin: 0 auto;">
      <tr>
        <td width="64" height="64" align="center" valign="middle" style="width: 64px; height: 64px; background-color: ${CHROME_BG}; border: 1px solid ${accent}59; border-radius: 16px; font-family: ${FONT_MONO}; font-size: 28px; font-weight: 700; color: ${accent};">${escapeHtml(initial)}</td>
      </tr>
    </table>
  </td>
</tr>`;
}

export function headingRow(text: string): string {
  return `<tr>
  <td style="padding: 0 40px 14px 40px; text-align: center;">
    <h1 style="margin: 0; font-family: ${FONT_SANS}; font-size: 23px; font-weight: 700; letter-spacing: -0.02em; color: #fafafa;">${text}</h1>
  </td>
</tr>`;
}

export function paragraphRow(
  text: string,
  style = `font-size: 15px; line-height: 1.6; color: #a1a1aa;`
): string {
  return `<tr>
  <td style="padding: 0 40px 28px 40px; text-align: center;">
    <p style="margin: 0; font-family: ${FONT_SANS}; ${style}">${text}</p>
  </td>
</tr>`;
}

/**
 * Call-to-action button.
 *
 * The href is escaped HERE rather than at each call site: it is the one
 * attribute in these templates that regularly carries a value assembled from
 * stored data, and an unescaped `"` in it closes the attribute and lets the
 * rest become markup — in a message sent from the organization's own sending
 * domain. Escaping `&` to `&amp;` is correct inside an attribute; browsers
 * decode it before navigating, so query strings are unaffected.
 */
export function buttonRow(rawHref: string, label: string): string {
  const href = escapeHtml(rawHref);
  return `<tr>
  <td style="padding: 4px 40px 30px 40px; text-align: center;">
    <table role="presentation" cellpadding="0" cellspacing="0" align="center" style="margin: 0 auto;">
      <tr>
        <td align="center" bgcolor="${BRAND_GREEN}" style="border-radius: 9px;">
          <a href="${href}" style="display: inline-block; padding: 14px 34px; font-family: ${FONT_SANS}; font-size: 15px; font-weight: 700; letter-spacing: -0.01em; color: #06140b; text-decoration: none; border-radius: 9px;">${label}</a>
        </td>
      </tr>
    </table>
  </td>
</tr>`;
}

export function footerRow(text: string): string {
  return `<tr>
  <td style="padding: 22px 40px; border-top: 1px solid ${BORDER}; text-align: center;">
    <p style="margin: 0; font-family: ${FONT_SANS}; font-size: 12px; line-height: 1.6; color: #52525b;">${text}</p>
  </td>
</tr>`;
}
