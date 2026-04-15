import { checkBotId } from "botid/server";
import { NextResponse } from "next/server";

/**
 * Verifies the request is not from a bot using Vercel BotID.
 * Returns null if the request is legitimate, or a 403 response if a bot is detected.
 *
 * `checkBotId()` calls Vercel's bot-classification API. Under load that upstream can
 * return errors or your project can see 429/503-style failures. By default we **fail open**
 * (allow the request) when verification errors so dashboards stay available; set
 * `BOTID_FAIL_OPEN_ON_ERROR=false` to return 503 instead.
 */
export async function verifyNotBot(): Promise<NextResponse | null> {
  if (process.env.BOTID_VERIFY_SERVER === "false") {
    return null;
  }

  try {
    const verification = await checkBotId();

    if (verification.isBot) {
      return NextResponse.json(
        { error: "Access denied: bot detected" },
        { status: 403 }
      );
    }

    return null;
  } catch (error) {
    const failOpen = process.env.BOTID_FAIL_OPEN_ON_ERROR !== "false";
    console.error("[botid] checkBotId failed:", error);

    if (failOpen) {
      return null;
    }

    return NextResponse.json(
      { error: "Bot verification temporarily unavailable" },
      { status: 503 }
    );
  }
}
