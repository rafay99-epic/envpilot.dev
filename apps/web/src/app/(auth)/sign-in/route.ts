import { getSignInUrl, withAuth } from "@workos-inc/authkit-nextjs";
import { redirect } from "next/navigation";
import type { NextRequest } from "next/server";

// Route handler, not a page: a handler's redirect() is a real HTTP 307 the
// browser always follows. As a Cache Components page (instant = false), the
// redirect only worked on direct document loads — client-side Link clicks
// received the NEXT_REDIRECT payload but never navigated
// (vercel/next.js#97898), leaving users stuck on the referring page.
export async function GET(req: NextRequest) {
  const { user } = await withAuth();

  if (user) {
    redirect("/dashboard");
  }

  const signInUrl = await getSignInUrl({
    returnTo: req.nextUrl.searchParams.get("returnUrl") ?? undefined,
  });
  redirect(signInUrl);
}
