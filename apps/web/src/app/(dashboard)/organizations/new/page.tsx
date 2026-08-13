"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { setActiveOrganizationCookie } from "@/lib/organization-context";
import { UpgradePrompt } from "@/components/tier/UpgradePrompt";
import { useCreateOrganization } from "@/hooks";
import { sanitizeConvexError } from "@/lib/error-messages";

export default function NewOrganizationPage() {
  const router = useRouter();
  const createOrganization = useCreateOrganization();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tierLimitHit, setTierLimitHit] = useState(false);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [description, setDescription] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);

  function generateSlug(value: string): string {
    return value
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, "")
      .replace(/\s+/g, "-")
      .replace(/-+/g, "-")
      .slice(0, 50);
  }

  function handleNameChange(value: string) {
    setName(value);
    if (!slugTouched) {
      setSlug(generateSlug(value));
    }
  }

  function handleSlugChange(value: string) {
    setSlugTouched(true);
    setSlug(generateSlug(value));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);

    try {
      const organizationId = await createOrganization({
        name,
        slug,
        description: description || undefined,
      });
      setActiveOrganizationCookie(organizationId);
      router.push(`/organizations/${slug}`);
      router.refresh();
    } catch (err) {
      const message = sanitizeConvexError(err);
      if (message.toLowerCase().includes("limit")) setTierLimitHit(true);
      else setError(message);
      setIsSubmitting(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-8">
      <div>
        <Link
          href="/organizations"
          className="inline-flex items-center gap-1 text-sm text-ink-faint hover:text-ink"
        >
          <svg
            className="h-4 w-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M15 19l-7-7 7-7"
            />
          </svg>
          Back to Organizations
        </Link>
        <h1 className="mt-4 text-2xl font-bold text-ink">
          Create Organization
        </h1>
        <p className="mt-1 text-sm text-ink-muted">
          Create a new organization to collaborate with your team.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {tierLimitHit && (
          <UpgradePrompt
            reason="You've reached the organization limit on the Free plan. Upgrade to Pro for unlimited organizations."
            feature="Unlimited Organizations"
            currentTier="free"
            variant="card"
          />
        )}

        {error && !tierLimitHit && (
          <div className="rounded-lg border border-danger-line bg-danger-soft p-4">
            <p className="text-sm text-danger">{error}</p>
          </div>
        )}

        <div className="rounded-xl border p-6 border-line bg-surface">
          <div className="space-y-6">
            <div>
              <label
                htmlFor="name"
                className="block text-sm font-medium text-ink"
              >
                Organization Name
              </label>
              <input
                type="text"
                id="name"
                value={name}
                onChange={(e) => handleNameChange(e.target.value)}
                placeholder="Acme Inc."
                required
                maxLength={100}
                className="mt-2 block w-full rounded-lg border px-4 py-2.5 focus:border-line-strong focus:outline-none focus:ring-2 focus:ring-line-strong border-line bg-surface-raised text-ink placeholder:text-ink-subtle"
              />
            </div>

            <div>
              <label
                htmlFor="slug"
                className="block text-sm font-medium text-ink"
              >
                URL Slug
              </label>
              <div className="mt-2 flex items-center">
                <span className="text-sm text-ink-muted">envpilot.dev/</span>
                <input
                  type="text"
                  id="slug"
                  value={slug}
                  onChange={(e) => handleSlugChange(e.target.value)}
                  placeholder="acme-inc"
                  required
                  maxLength={50}
                  pattern="^[a-z0-9-]+$"
                  className="ml-1 block flex-1 rounded-lg border px-4 py-2.5 focus:border-line-strong focus:outline-none focus:ring-2 focus:ring-line-strong border-line bg-surface-raised text-ink placeholder:text-ink-subtle"
                />
              </div>
              <p className="mt-1 text-xs text-ink-muted">
                Only lowercase letters, numbers, and hyphens.
              </p>
            </div>

            <div>
              <label
                htmlFor="description"
                className="block text-sm font-medium text-ink"
              >
                Description{" "}
                <span className="font-normal text-ink-subtle">(optional)</span>
              </label>
              <textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="A brief description of your organization..."
                rows={3}
                maxLength={500}
                className="mt-2 block w-full resize-none rounded-lg border px-4 py-2.5 focus:border-line-strong focus:outline-none focus:ring-2 focus:ring-line-strong border-line bg-surface-raised text-ink placeholder:text-ink-subtle"
              />
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-3">
          <Link
            href="/organizations"
            className="rounded-lg border px-4 py-2.5 text-sm font-medium transition-colors border-line text-ink-muted hover:bg-surface-hover"
          >
            Cancel
          </Link>
          <button
            type="submit"
            disabled={isSubmitting || !name || !slug}
            className="inline-flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 bg-ink text-ink-inverse hover:bg-ink-muted"
          >
            {isSubmitting ? (
              <>
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-t-transparent" />
                Creating...
              </>
            ) : (
              "Create Organization"
            )}
          </button>
        </div>
      </form>
    </div>
  );
}
