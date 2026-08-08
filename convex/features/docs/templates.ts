/**
 * Starter markdown for a new page.
 *
 * `type: "api"` is a TEMPLATE, not a structured record. Request and response
 * schemas would be opaque strings in a typed field either way, so structure
 * would buy no validation while costing a second authoring mode the reviewer
 * also has to learn. A template gets the same consistency for one function.
 *
 * The API template names the base-URL VARIABLE rather than a URL. Docs never
 * carry values: readers resolve them through their own Envpilot access, which
 * is what keeps a documentation read from becoming a credential read.
 */

const API_TEMPLATE = `## Overview

One paragraph: what this endpoint does and when to call it.

## Request

\`\`\`http
POST /api/v1/resource
Authorization: Bearer <token>
Content-Type: application/json
\`\`\`

Base URL comes from the \`API_BASE_URL\` variable for the target environment —
pull it with your own Envpilot access, it is not stored here.

| Field | Type | Required | Notes |
| ----- | ---- | -------- | ----- |
| \`id\` | string | yes | |

## Response

\`\`\`json
{
  "id": "abc123",
  "status": "ok"
}
\`\`\`

## Errors

| Status | Meaning | Recovery |
| ------ | ------- | -------- |
| 400 | Invalid payload | Fix the request body |
| 401 | Missing or expired token | Re-authenticate |
| 429 | Rate limited | Back off and retry |

## Notes

Anything the caller cannot infer from the shapes above — ordering guarantees,
idempotency, pagination, gotchas.
`;

const GUIDE_TEMPLATE = `## Summary

What this covers and who needs it.

## Details

Write the thing. Link to the code where it helps.

## Related

- Other pages in this module
`;

export function templateFor(type: "api" | "guide"): string {
  return type === "api" ? API_TEMPLATE : GUIDE_TEMPLATE;
}
