"use client";

import { use } from "react";
import Link from "next/link";
import { LockKeyhole, ShieldCheck } from "lucide-react";
import type { Id } from "@convex/_generated/dataModel";
import { useAuthContext } from "@/components/auth";
import { SecureArtifactPanel } from "@/components/artifacts";
import { TerminalLoading } from "@/components/dashboard/terminal-ui";
import { FeatureGate } from "@/components/tier/FeatureGate";
import { useProjectBySlug } from "@/hooks";

interface ProjectArtifactsPageProps {
  params: Promise<{ slug: string }>;
}

export default function ProjectArtifactsPage({
  params,
}: ProjectArtifactsPageProps) {
  const { slug } = use(params);
  const { organization, capabilities } = useAuthContext();
  const orgId = organization?.id as Id<"organizations"> | undefined;
  const project = useProjectBySlug(orgId, slug);

  const canRead = capabilities["project.artifacts.read"] === true;
  const canCreate = capabilities["project.artifacts.create"] === true;
  const canUpdate = capabilities["project.artifacts.update"] === true;
  const canDelete = capabilities["project.artifacts.delete"] === true;

  if (project === undefined) {
    return <TerminalLoading fullPage />;
  }

  if (!project) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <div className="rounded-full bg-red-100 p-3 dark:bg-red-900/20">
          <ShieldCheck className="h-6 w-6 text-red-600 dark:text-red-400" />
        </div>
        <h2 className="mt-4 text-lg font-semibold text-zinc-900 dark:text-zinc-100">
          Project not found
        </h2>
        <Link
          href="/dashboard/projects"
          className="mt-6 text-sm font-medium text-zinc-900 hover:text-zinc-700 dark:text-zinc-100 dark:hover:text-zinc-300"
        >
          Back to Projects
        </Link>
      </div>
    );
  }

  if (!canRead) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <div className="rounded-full bg-amber-100 p-3 dark:bg-amber-900/20">
          <LockKeyhole className="h-6 w-6 text-amber-600 dark:text-amber-400" />
        </div>
        <h2 className="mt-4 text-lg font-semibold text-zinc-900 dark:text-zinc-100">
          Artifact access required
        </h2>
        <p className="mt-2 max-w-md text-sm text-zinc-600 dark:text-zinc-400">
          Your project role does not allow you to view secure build artifacts.
          Ask an organization administrator to grant artifact read access.
        </p>
        <Link
          href={`/dashboard/projects/${slug}`}
          className="mt-6 text-sm font-medium text-zinc-900 hover:text-zinc-700 dark:text-zinc-100 dark:hover:text-zinc-300"
        >
          Back to Variables
        </Link>
      </div>
    );
  }

  return (
    <FeatureGate
      organizationId={orgId}
      featureKey="secure_artifacts"
      featureName="Secure Build Artifacts"
      fallbackVariant="card"
    >
      <div className="space-y-8">
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 rounded-lg bg-green-100 p-2 dark:bg-green-900/30">
              <ShieldCheck className="h-5 w-5 text-green-700 dark:text-green-400" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">
                Secure Build Artifacts
              </h1>
              <p className="mt-1 max-w-2xl text-sm text-zinc-600 dark:text-zinc-400">
                Manage project-specific signing keys, service configuration, and
                private build files. Files are encrypted in your browser before
                they are stored in Backblaze B2.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 rounded-full border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400">
            <LockKeyhole className="h-3.5 w-3.5 text-green-600 dark:text-green-400" />
            Client-side encrypted
          </div>
        </header>

        <SecureArtifactPanel
          projectId={project._id}
          canUpload={canCreate}
          canReplace={canUpdate}
          canDelete={canDelete}
        />
      </div>
    </FeatureGate>
  );
}
