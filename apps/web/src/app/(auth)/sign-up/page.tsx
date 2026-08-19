import { getSignUpUrl, withAuth } from "@workos-inc/authkit-nextjs";
import { redirect } from "next/navigation";

// Nothing renders here: the page resolves the session and redirects, so there
// is no shell to prerender and the navigation is server-bound by definition.
export const instant = false;

export default async function SignUpPage() {
  // Check if user is already authenticated
  const { user } = await withAuth();

  if (user) {
    redirect("/dashboard");
  }

  // Redirect directly to WorkOS — no intermediate page
  const signUpUrl = await getSignUpUrl();
  redirect(signUpUrl);
}
