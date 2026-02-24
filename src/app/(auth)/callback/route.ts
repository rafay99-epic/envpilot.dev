import { handleAuth } from '@workos-inc/authkit-nextjs'

// Handle the OAuth callback from WorkOS
export const GET = handleAuth({ returnPathname: '/dashboard' })
