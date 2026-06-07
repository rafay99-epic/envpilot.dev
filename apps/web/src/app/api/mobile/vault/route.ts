import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  authenticateMobileRequest,
  unauthorizedResponse,
} from "@/lib/mobile-auth";
import { convex } from "@/lib/convex-client";
import { readSecret, isVaultConfigured, VaultError } from "@/lib/vault";
import { createLogger, clientIp, since } from "@/lib/logger";

const decryptSchema = z.object({
  vaultRef: z.string().min(1).max(255),
});

export async function POST(request: NextRequest) {
  const start = Date.now();
  const log = createLogger("mobile-vault/decrypt", { ip: clientIp(request) });

  if (!isVaultConfigured()) {
    return NextResponse.json(
      { error: "Vault service is not available" },
      { status: 503 }
    );
  }

  const auth = await authenticateMobileRequest(request, convex);
  if (!auth.valid) {
    return unauthorizedResponse(auth.error);
  }

  try {
    const body = await request.json();
    const result = decryptSchema.safeParse(body);

    if (!result.success) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }

    const value = await readSecret(result.data.vaultRef);

    log.info("decrypt_complete", {
      duration_ms: since(start),
    });

    return NextResponse.json({ value });
  } catch (error) {
    if (error instanceof VaultError && error.code === "NOT_FOUND") {
      return NextResponse.json({ error: "Secret not found" }, { status: 404 });
    }

    const message = error instanceof Error ? error.message : String(error);
    log.error("decrypt_failed", { error: message, duration_ms: since(start) }, error);
    return NextResponse.json({ error: "Failed to decrypt" }, { status: 500 });
  }
}
