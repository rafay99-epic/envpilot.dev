import { checkBotId } from "botid/server";
import { NextResponse } from "next/server";

/**
 * Verifies the request is not from a bot using Vercel BotID.
 * Returns null if the request is legitimate, or a 403 response if a bot is detected.
 */
export async function verifyNotBot(): Promise<NextResponse | null> {
  const verification = await checkBotId();

  if (verification.isBot) {
    return NextResponse.json(
      { error: "Access denied: bot detected" },
      { status: 403 },
    );
  }

  return null;
}
