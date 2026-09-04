"use client";

import { use, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Settings } from "lucide-react";
import { SettingsLayout } from "@envpilot/ui";
import { useAuthContext } from "@/components/auth";
import {
  TerminalButton,
  TerminalLoading,
} from "@/components/dashboard/terminal-ui";
import { useProjectBySlug, useSettingsTab } from "@/hooks";
import { projectSettingsTabs } from "@/settings/project.tabs";
import type { Doc } from "@convex/_generated/dataModel";

interface ProjectSettingsPageProps {
  params: Promise<{ slug: string }>;
}

export default function ProjectSettingsPage({
  params,
}: ProjectSettingsPageProps) {
  const { slug } = use(params);
  const router = useRouter();
  const { canDo, capabilities, organization } = useAuthContext();
  const canUpdateProject = canDo("org:create_project");
  const canDeleteProject = canDo("org:delete_project");

  const liveProject = useProjectBySlug(
    organization?.id,
    organization?.id ? slug : undefined
  );
  // Last known copy, so deleting or transferring the project redirects without
  // flashing "not found" the moment the live query goes null.
  const [lastKnown, setLastKnown] = useState<Doc<"projects"> | null>(null);
  if (liveProject && liveProject._id !== lastKnown?._id)
    setLastKnown(liveProject);
  const project = liveProject ?? lastKnown;

  const tabs = project
    ? projectSettingsTabs({
        project,
        canDelete: canDeleteProject,
        canManageProtection: capabilities["project.protection.manage"] === true,
      })
    : [];
  const tabState = useSettingsTab(tabs);

  if (liveProject === undefined) {
    return <TerminalLoading fullPage />;
  }

  if (!project || !canUpdateProject) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <AlertTriangle className="h-6 w-6 text-danger" aria-hidden="true" />
        <h2 className="mt-4 text-lg font-semibold text-ink">
          {project ? "Access denied" : "Project not found"}
        </h2>
        <p className="mt-2 max-w-md text-center text-sm text-ink-muted">
          {project
            ? "You do not have permission to manage project settings."
            : "This project does not exist or you no longer have access to it."}
        </p>
        {!project && (
          <TerminalButton
            type="button"
            className="mt-6"
            onClick={() => router.replace("/dashboard/projects")}
          >
            Back to projects
          </TerminalButton>
        )}
      </div>
    );
  }

  return (
    <SettingsLayout
      icon={Settings}
      title="Project settings"
      description={<>Manage settings for {project.name}</>}
      cmd={`envpilot project settings ${project.slug}`}
      tabs={tabs}
      {...tabState}
    />
  );
}
