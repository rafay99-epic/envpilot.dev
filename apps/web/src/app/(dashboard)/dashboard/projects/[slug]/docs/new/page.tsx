"use client";

import { use, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, BookText } from "lucide-react";
import type { Id } from "@convex/_generated/dataModel";
import { useAuthContext } from "@/components/auth";
import { TerminalLoading } from "@/components/dashboard/terminal-ui";
import { FeatureGate } from "@/components/tier/FeatureGate";
import {
  useProjectBySlug,
  useProjectDocs,
  useCreateDoc,
  useDocAccess,
} from "@/hooks";
import { sanitizeConvexError } from "@/lib/error-messages";
import type { DocType } from "@/hooks";

interface NewDocPageProps {
  params: Promise<{ slug: string }>;
}

/**
 * Project → Docs → New page.
 *
 * Creates a DRAFT and lands the author in the page view to write it. The
 * body starts from the server-side template for the chosen type — an "api"
 * page is a markdown template, not a structured record, because request and
 * response schemas would be opaque strings in a typed field either way.
 */
export default function NewDocPage({ params }: NewDocPageProps) {
  const { slug } = use(params);
  const router = useRouter();
  const { organization } = useAuthContext();
  const orgId = organization?.id as Id<"organizations"> | undefined;

  const project = useProjectBySlug(orgId, slug);
  const isLoadingProject = project === undefined && !!slug;
  const projectId = project?._id as Id<"projects"> | undefined;

  const existingDocs = useProjectDocs(projectId);
  const access = useDocAccess(projectId);
  const createDoc = useCreateDoc();

  const [title, setTitle] = useState("");
  const [moduleName, setModuleName] = useState("");
  const [type, setType] = useState<DocType>("api");
  const [prUrl, setPrUrl] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  // Existing module names, so pages cluster instead of fragmenting into
  // near-duplicate groups ("Wallet" vs "wallet").
  const knownModules = Array.from(
    new Set((existingDocs ?? []).map((doc) => doc.module))
  ).sort();

  // Blocked reasons come from the same source the mutation checks, so the
  // form refuses before the user writes a page it would reject on save.
  const blocked = access
    ? !access.canCreate
      ? "Your role cannot create documentation pages in this project."
      : access.atProjectLimit
        ? `This project holds ${access.projectCount} of ${access.projectLimit} pages. Delete a page or upgrade for unlimited pages.`
        : access.atOrgLimit
          ? `Your organization holds ${access.orgCount} of ${access.orgLimit} pages. Delete a page or upgrade for unlimited pages.`
          : null
    : null;

  const canSubmit =
    title.trim().length > 0 &&
    moduleName.trim().length > 0 &&
    !isSaving &&
    !blocked;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!projectId || !canSubmit) return;
    setError(null);
    setIsSaving(true);
    try {
      const result = await createDoc({
        projectId,
        module: moduleName.trim(),
        type,
        title: title.trim(),
        prUrl: prUrl.trim() || undefined,
      });
      router.push(`/dashboard/projects/${slug}/docs/${result.slug}`);
    } catch (e) {
      setError(sanitizeConvexError(e));
      setIsSaving(false);
    }
  };

  if (isLoadingProject) return <TerminalLoading fullPage />;
  if (!project) {
    return (
      <p className="text-sm text-zinc-600 dark:text-zinc-400">
        Project not found.
      </p>
    );
  }

  return (
    <FeatureGate
      organizationId={orgId}
      featureKey="project_docs"
      featureName="Project Documentation"
    >
      <div className="mx-auto max-w-2xl space-y-6">
        <Link
          href={`/dashboard/projects/${slug}/docs`}
          className="inline-flex items-center gap-1.5 text-sm text-zinc-500 transition-colors hover:text-zinc-900 dark:hover:text-zinc-100"
        >
          <ArrowLeft className="h-4 w-4" />
          Documentation
        </Link>

        <div className="flex items-center gap-2">
          <BookText className="h-6 w-6 text-zinc-400" />
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">
            New page
          </h1>
        </div>

        {blocked && (
          <p
            data-testid="doc-new-blocked"
            className="border-l-2 border-amber-500/60 py-1 pl-3 text-xs text-amber-700 dark:text-amber-400"
          >
            {blocked}
          </p>
        )}

        {error && (
          <p className="border-l-2 border-red-500/60 py-1 pl-3 text-xs text-red-700 dark:text-red-400">
            {error}
          </p>
        )}

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label
              htmlFor="doc-title"
              className="block text-sm font-medium text-zinc-700 dark:text-zinc-300"
            >
              Title
            </label>
            <input
              id="doc-title"
              data-testid="doc-title-input"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={200}
              placeholder="Charge a wallet"
              className="mt-1.5 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:border-zinc-400 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
            />
          </div>

          <div>
            <label
              htmlFor="doc-module"
              className="block text-sm font-medium text-zinc-700 dark:text-zinc-300"
            >
              Module
            </label>
            <input
              id="doc-module"
              data-testid="doc-module-input"
              value={moduleName}
              onChange={(e) => setModuleName(e.target.value)}
              maxLength={100}
              list="doc-known-modules"
              placeholder="E-Commerce Platform"
              className="mt-1.5 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:border-zinc-400 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
            />
            <datalist id="doc-known-modules">
              {knownModules.map((name) => (
                <option key={name} value={name} />
              ))}
            </datalist>
            <p className="mt-1.5 text-xs text-zinc-500">
              Groups pages in the sidebar. Reuse an existing name to keep a
              feature&apos;s pages together.
            </p>
          </div>

          <div>
            <span className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
              Type
            </span>
            <div className="mt-1.5 flex gap-2">
              {(["api", "guide"] as const).map((value) => (
                <button
                  key={value}
                  type="button"
                  data-testid={`doc-type-${value}`}
                  aria-pressed={type === value}
                  onClick={() => setType(value)}
                  className={`rounded-lg border px-3 py-1.5 text-sm font-medium capitalize transition-colors ${
                    type === value
                      ? "border-zinc-900 bg-zinc-900 text-white dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-900"
                      : "border-zinc-300 text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
                  }`}
                >
                  {value}
                </button>
              ))}
            </div>
            <p className="mt-1.5 text-xs text-zinc-500">
              {type === "api"
                ? "Starts from an endpoint template: request, response, errors. Name the base-URL variable — never paste its value."
                : "Starts from a short prose template."}
            </p>
          </div>

          <div>
            <label
              htmlFor="doc-pr"
              className="block text-sm font-medium text-zinc-700 dark:text-zinc-300"
            >
              Pull request URL{" "}
              <span className="font-normal text-zinc-500">(optional)</span>
            </label>
            <input
              id="doc-pr"
              data-testid="doc-pr-input"
              value={prUrl}
              onChange={(e) => setPrUrl(e.target.value)}
              placeholder="https://github.com/org/repo/pull/123"
              className="mt-1.5 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:border-zinc-400 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
            />
          </div>

          <div className="flex gap-3">
            <button
              type="submit"
              data-testid="doc-create-submit"
              disabled={!canSubmit}
              className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
            >
              {isSaving ? "Creating…" : "Create draft"}
            </button>
            <Link
              href={`/dashboard/projects/${slug}/docs`}
              className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
            >
              Cancel
            </Link>
          </div>
        </form>
      </div>
    </FeatureGate>
  );
}
