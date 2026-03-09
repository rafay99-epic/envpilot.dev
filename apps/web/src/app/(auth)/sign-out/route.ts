import { signOut } from "@workos-inc/authkit-nextjs";

export async function GET() {
  return signOut({
    returnTo: process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000",
  });
}
