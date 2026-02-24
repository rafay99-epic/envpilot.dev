import { withAuth } from '@workos-inc/authkit-nextjs'
import { redirect } from 'next/navigation'
import { AuthProvider } from '@/components/auth'
import { DashboardNav } from '@/components/dashboard/dashboard-nav'
import type { AuthUser, Organization } from '@/lib/auth'
import { ROLES } from '@/lib/auth'

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  // Server-side auth check
  const { user, organizationId, role } = await withAuth()

  if (!user) {
    redirect('/sign-in')
  }

  // Transform to our AuthUser type
  const authUser: AuthUser = {
    id: user.id,
    email: user.email,
    firstName: user.firstName ?? null,
    lastName: user.lastName ?? null,
    profilePictureUrl: user.profilePictureUrl ?? null,
    organizationId: organizationId ?? null,
    role: role ?? null,
    permissions: [...(ROLES[role as keyof typeof ROLES]?.permissions ?? ROLES.MEMBER.permissions)],
    createdAt: new Date(user.createdAt),
    updatedAt: new Date(user.updatedAt),
  }

  // Mock organization data (would be fetched from database/WorkOS in production)
  const organization: Organization | null = organizationId
    ? {
        id: organizationId,
        name: 'My Organization',
        slug: 'my-org',
        createdAt: new Date(),
        updatedAt: new Date(),
      }
    : null

  return (
    <AuthProvider initialUser={authUser} initialOrganization={organization}>
      <div className="flex min-h-screen bg-zinc-50 dark:bg-zinc-950">
        {/* Sidebar Navigation */}
        <DashboardNav />

        {/* Main Content */}
        <main className="flex-1 overflow-auto">
          <div className="container mx-auto px-4 py-8 md:px-6 lg:px-8">
            {children}
          </div>
        </main>
      </div>
    </AuthProvider>
  )
}
