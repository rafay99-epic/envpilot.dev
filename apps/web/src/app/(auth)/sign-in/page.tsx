import { getSignInUrl, withAuth } from "@workos-inc/authkit-nextjs";
import { redirect } from "next/navigation";

export const instant = false;

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ returnUrl?: string }>;
}) {
  // Check if user is already authenticated
  const { user } = await withAuth();

  if (user) {
    redirect("/dashboard");
  }

  const params = await searchParams;

  // Redirect directly to WorkOS — no intermediate page
  const signInUrl = await getSignInUrl({
    returnTo: params.returnUrl || undefined,
  });
  redirect(signInUrl);
}
