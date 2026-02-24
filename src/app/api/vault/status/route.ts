import { NextResponse } from 'next/server'
import { isVaultConfigured } from '@/lib/vault'

/**
 * GET /api/vault/status - Check vault configuration status
 * This endpoint is public and can be used to check if vault is available
 */
export async function GET() {
  const configured = isVaultConfigured()

  return NextResponse.json({
    success: true,
    data: {
      configured,
      status: configured ? 'ready' : 'not_configured',
      features: {
        secretStorage: configured,
        clientSideEncryption: configured,
        dataKeyManagement: configured,
        envelopeEncryption: configured,
      },
    },
  })
}
