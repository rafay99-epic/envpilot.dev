import { getSignUpUrl, withAuth } from "@workos-inc/authkit-nextjs";
import { redirect } from "next/navigation";

// Route handler, not a page — see sign-in/route.ts for the rationale.
export async function GET() {
  const { user } = await withAuth();

  if (user) {
    redirect("/dashboard");
  }

  redirect(await getSignUpUrl());
}
