import { NextResponse } from "next/server";
import { z } from "zod";
import { createAuthedConvexClient } from "@/lib/convex-client";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { handleApiError, reportApiError } from "@/lib/api-errors";
import { ideAuth, isConvexAuthError } from "@/lib/ide-auth";

const VALID_ENVIRONMENTS = ["development", "staging", "production"];

const requestVariableSchema = z.object({
  projectId: z.string().min(1),
  key: z
    .string()
    .regex(/^[A-Z][A-Z0-9_]*$/, "Key must be UPPER_SNAKE_CASE")
    .max(100),
  value: z.string().min(1).max(10000),
  description: z.string().max(500).optional(),
  environments: z
    .array(z.enum(["development", "staging", "production"]))
    .min(1, "Pick at least one environment"),
  isSensitive: z.boolean().optional(),
});

/**
 * POST /api/ide/request-variables - Submit a variable request (value encrypted
 * server-side by the createWithValue action). Same approval flow as the web.
 */
export async function POST(request: Request) {
  try {
    const session = await ideAuth(request);
    if (!session) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const body = await request.json();
    const parsed = requestVariableSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const created = await createAuthedConvexClient(session.token).action(
      api.features.variables.requests.actions.createWithValue,
      {
        projectId: parsed.data.projectId as Id<"projects">,
        key: parsed.data.key,
        value: parsed.data.value,
        environments: parsed.data.environments,
        isSensitive: parsed.data.isSensitive ?? true,
        description: parsed.data.description,
      }
    );
    return NextResponse.json({ request: created }, { status: 201 });
  } catch (error) {
    reportApiError(error, "POST /api/ide/request-variables");
    if (isConvexAuthError(error)) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }
    return handleApiError(error, "Failed to submit variable request");
  }
}
