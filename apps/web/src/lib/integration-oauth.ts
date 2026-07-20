// Shared by the /api/integrations/[provider]/start and /callback routes —
// the CSRF nonce cookie pairing the authorize redirect with its callback.
export const OAUTH_STATE_COOKIE = "envpilot_integration_nonce";
