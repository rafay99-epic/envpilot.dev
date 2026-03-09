import { getSignUpUrl, withAuth } from "@workos-inc/authkit-nextjs";
import { redirect } from "next/navigation";

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
