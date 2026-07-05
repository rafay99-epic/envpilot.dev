import { NextResponse } from "next/server";

/**
 * GET /api/vault/status - Check vault configuration status.
 *
 * Vault crypto now lives entirely in Convex (see convex/vault.ts); the web app
 * no longer imports any vault client. This endpoint reports whether the WorkOS
 * credentials the platform relies on are present in the web runtime — a simple
 * env presence check, no vault client required. It is public.
 */
export async function GET() {
  const configured = Boolean(
    process.env.WORKOS_API_KEY && process.env.WORKOS_CLIENT_ID
  );

  return NextResponse.json({
    success: true,
    data: {
      configured,
      status: configured ? "ready" : "not_configured",
      features: {
        secretStorage: configured,
        clientSideEncryption: configured,
        dataKeyManagement: configured,
        envelopeEncryption: configured,
      },
    },
  });
}
