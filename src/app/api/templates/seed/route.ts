import { withAuth } from '@workos-inc/authkit-nextjs'
import { NextResponse } from 'next/server'
import { ConvexHttpClient } from 'convex/browser'
import { api } from '../../../../../convex/_generated/api'
import { BUILT_IN_TEMPLATES } from '@/constants/templates'

const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!)

/**
 * POST /api/templates/seed - Seed built-in templates
 *
 * Note: Built-in templates are defined in constants and used directly
 * by the client-side template selector. This endpoint is provided for
 * administrators who want to persist templates to the database for
 * custom modifications or tracking purposes.
 *
 * The actual seeding is done via a Convex internal mutation that must
 * be triggered via the Convex dashboard or a deployment script for
 * security reasons.
 */
export async function POST() {
  try {
    const { user } = await withAuth()

    if (!user) {
      return NextResponse.json(
        { error: 'Not authenticated' },
        { status: 401 }
      )
    }

    // The seedBuiltInTemplates mutation is internal and cannot be called from client code.
    // This is by design - template seeding should be done via:
    // 1. Convex dashboard
    // 2. Deployment scripts
    // 3. Admin-only internal APIs
    //
    // For normal usage, built-in templates are loaded from constants directly.
    return NextResponse.json({
      success: false,
      message: 'Template seeding must be done via Convex dashboard or deployment scripts. Built-in templates are available directly from the template selector.',
      info: 'Built-in templates are defined in src/constants/templates.ts and do not require database seeding for basic functionality.',
      availableTemplates: BUILT_IN_TEMPLATES.length,
    }, { status: 403 })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to process request'
    console.error('Failed to process seed request:', error)
    return NextResponse.json(
      { error: message },
      { status: 500 }
    )
  }
}

/**
 * GET /api/templates/seed - Check seed status
 * Returns information about available built-in templates and their database status.
 */
export async function GET() {
  try {
    const { user } = await withAuth()

    if (!user) {
      return NextResponse.json(
        { error: 'Not authenticated' },
        { status: 401 }
      )
    }

    // Get current templates from database
    const existingTemplates = await convex.query(api.templates.listBuiltIn, {})

    return NextResponse.json({
      constantsCount: BUILT_IN_TEMPLATES.length,
      databaseCount: existingTemplates.length,
      needsSeeding: existingTemplates.length < BUILT_IN_TEMPLATES.length,
      availableFromConstants: BUILT_IN_TEMPLATES.map((t) => ({
        id: t.id,
        name: t.name,
        projectType: t.projectType,
        variableCount: t.variables.length,
      })),
      existingInDatabase: existingTemplates.map((t) => ({
        id: t._id,
        name: t.name,
        projectType: t.projectType,
      })),
      info: 'Built-in templates from constants are used directly by the client. Database templates are optional for custom modifications.',
    })
  } catch (error) {
    console.error('Failed to check seed status:', error)
    return NextResponse.json(
      { error: 'Failed to check seed status' },
      { status: 500 }
    )
  }
}
