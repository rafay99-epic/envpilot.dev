"use client";

import { useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { FolderPlus } from "lucide-react";
import { PageHeader } from "@envpilot/ui";
import { useAuthContext } from "@/components/auth";
import { useTierLimitCheck } from "@/hooks/useTierLimits";
import { useCreateProject } from "@/hooks";
import {
  isRateLimitError,
  isTierLimitError,
  sanitizeConvexError,
} from "@/lib/error-messages";
import { LimitWarning } from "@/components/tier/FeatureGate";
import { createLogger } from "@/lib/logger";
import { UpgradePrompt } from "@/components/tier/UpgradePrompt";
import { useEnforcementEnabled } from "@/hooks/useTierLimits";
import type { Id } from "@convex/_generated/dataModel";
import {
  PROJECT_ICONS,
  PROJECT_COLORS,
  DEFAULT_PROJECT_ICON,
  DEFAULT_PROJECT_COLOR,
} from "@/constants/project";
import { ProjectIcon, FrameworkLogo } from "@/components/ui";
import {
  TemplateSelector,
  TemplateVariablesPreview,
} from "@/components/templates";
import type { EnvironmentTemplate } from "@/constants/templates";
import { PROJECT_TYPES } from "@/constants/templates";
import {
  isFrameworkIcon,
  parseFrameworkType,
  toFrameworkIcon,
} from "@/constants/framework-logos";

const generateSlug = (name: string) =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 50);

const log = createLogger("app/projects-new");

export default function NewProjectPage() {
  const router = useRouter();
  const { canDo, organization } = useAuthContext();
  const canCreateProject = canDo("org:create_project");
  const orgId = organization?.id as Id<"organizations"> | undefined;
  const tierCheck = useTierLimitCheck(orgId, "create_project");
  const enforcing = useEnforcementEnabled();
  const createProject = useCreateProject();

  const [selectedTemplate, setSelectedTemplate] =
    useState<EnvironmentTemplate | null>(null);
  const [fromScratch, setFromScratch] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    slug: "",
    description: "",
    icon: DEFAULT_PROJECT_ICON,
    color: DEFAULT_PROJECT_COLOR,
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Read only inside the change handlers, never rendered, so a ref avoids a
  // render per keystroke in the slug field.
  const slugManuallyEdited = useRef(false);
  const iconLabelId = useId();
  const colorLabelId = useId();

  const handleNameChange = (name: string) => {
    setFormData((prev) => ({
      ...prev,
      name,
      slug: slugManuallyEdited.current ? prev.slug : generateSlug(name),
    }));
  };

  const handleSlugChange = (slug: string) => {
    slugManuallyEdited.current = true;
    setFormData((prev) => ({
      ...prev,
      slug: slug.toLowerCase().replace(/[^a-z0-9-]/g, ""),
    }));
  };

  const handleTemplateSelect = (template: EnvironmentTemplate | null) => {
    if (template === null) {
      // "Start from Scratch"
      setSelectedTemplate(null);
      setFromScratch(true);
      setFormData((prev) => ({
        ...prev,
        icon: DEFAULT_PROJECT_ICON,
        color: DEFAULT_PROJECT_COLOR,
      }));
    } else {
      setSelectedTemplate(template);
      setFromScratch(false);
      setFormData((prev) => ({
        ...prev,
        icon: toFrameworkIcon(template.projectType),
        color: DEFAULT_PROJECT_COLOR,
      }));
    }
  };

  const hasSelection = selectedTemplate !== null || fromScratch;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      if (!organization?.id) {
        setError("No organization found. Please create an organization first.");
        setIsSubmitting(false);
        return;
      }

      const projectId = await createProject({
        ...formData,
        description: formData.description || undefined,
        organizationId: organization.id,
      });
      const projectSlug = formData.slug;

      if (selectedTemplate) {
        // Create template variables sequentially to avoid overwhelming
        // the WorkOS Vault API with concurrent requests.
        for (const variable of selectedTemplate.variables) {
          try {
            const placeholderValue =
              variable.defaultValue ||
              variable.placeholder ||
              `<${variable.key}>`;

            await fetch("/api/variables", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                key: variable.key,
                value: placeholderValue,
                description: variable.description,
                environments: variable.environments,
                projectId,
                isSensitive: variable.isSensitive,
              }),
            });
          } catch (err) {
            // Swallowed per variable so one failure does not abort the rest,
            // but the user lands on a project quietly missing a variable, so
            // it has to be reported somewhere.
            log.error(
              "template_variable_create_failed",
              { projectId, key: variable.key },
              err
            );
          }
        }
      }

      router.push(`/dashboard/projects/${projectSlug}`);
    } catch (err) {
      const message = sanitizeConvexError(err);
      if (isRateLimitError(err)) setError(message);
      else if (isTierLimitError(message)) {
        setError(
          "You've reached the project limit on your current plan. Upgrade to Pro for unlimited projects."
        );
      } else setError(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Tier limit block
  if (enforcing && !tierCheck.isLoading && !tierCheck.allowed) {
    return (
      <div className="mx-auto max-w-lg py-12">
        <UpgradePrompt
          reason={tierCheck.reason || "You have reached your project limit."}
          feature="Unlimited Projects"
          currentTier="free"
          variant="card"
          onUpgradeClick={() => {
            window.location.href = "/api/checkout?tier=pro";
          }}
        />
      </div>
    );
  }

  if (!canCreateProject) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <div className="rounded-full p-3 bg-danger-soft">
          <svg
            className="h-6 w-6 text-danger"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
            />
          </svg>
        </div>
        <h2 className="mt-4 text-lg font-semibold text-ink">Access Denied</h2>
        <p className="mt-2 text-sm text-ink-muted">
          You do not have permission to create projects.
        </p>
        <Link
          href="/dashboard/projects"
          className="mt-6 text-sm font-medium text-ink hover:text-ink-muted"
        >
          Back to Projects
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link
          href="/dashboard/projects"
          className="rounded-lg p-2 text-ink-muted hover:bg-surface-hover"
        >
          <svg
            className="h-5 w-5"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M10 19l-7-7m0 0l7-7m-7 7h18"
            />
          </svg>
        </Link>
        <PageHeader
          icon={FolderPlus}
          title="Create New Project"
          description={organization ? `in ${organization.name}` : undefined}
        />
      </div>

      {/* Tier limit warning */}
      {enforcing &&
        tierCheck.current !== undefined &&
        tierCheck.limit !== undefined && (
          <LimitWarning
            current={tierCheck.current}
            limit={tierCheck.limit}
            resourceName="projects"
          />
        )}

      {error && (
        <div className="rounded-lg border p-4 border-danger-line bg-danger-soft">
          <p className="text-sm text-danger">{error}</p>
        </div>
      )}

      {/* Master-Detail Layout */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
        {/* Left: Template Selector */}
        <div className="lg:col-span-3">
          <div className="rounded-xl border p-4 border-line bg-surface">
            <p className="mb-3 text-xs font-medium uppercase tracking-wider text-ink-muted">
              Choose a template
            </p>
            <TemplateSelector
              selectedTemplateId={
                fromScratch ? null : selectedTemplate?.id || undefined
              }
              onSelectTemplate={handleTemplateSelect}
            />
          </div>
        </div>

        {/* Right: Project Details Form (sticky) */}
        <div className="lg:col-span-2">
          <div className="lg:sticky lg:top-6">
            <form
              onSubmit={handleSubmit}
              className="space-y-5 rounded-xl border p-4 border-line bg-surface"
            >
              <p className="text-xs font-medium uppercase tracking-wider text-ink-muted">
                Project Details
              </p>

              {/* Template Badge */}
              {selectedTemplate && (
                <div className="flex items-center gap-2.5 rounded-lg border px-3 py-2 border-line bg-surface-raised/50">
                  <div
                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded"
                    style={{
                      backgroundColor: selectedTemplate.color + "20",
                    }}
                  >
                    <FrameworkLogo
                      projectType={selectedTemplate.projectType}
                      size={16}
                    />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-medium text-ink">
                      {selectedTemplate.name}
                    </p>
                    <p className="text-[10px] text-ink-muted">
                      {selectedTemplate.variables.length} variables included
                    </p>
                  </div>
                </div>
              )}

              {/* Preview */}
              <div className="flex items-center gap-3 rounded-lg p-3 bg-surface-raised/50">
                <div
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg"
                  style={{
                    backgroundColor: isFrameworkIcon(formData.icon)
                      ? "transparent"
                      : formData.color,
                  }}
                >
                  <ProjectIcon
                    icon={formData.icon}
                    size={isFrameworkIcon(formData.icon) ? 32 : 20}
                  />
                </div>
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-ink">
                    {formData.name || "Project Name"}
                  </p>
                  <p className="truncate text-xs text-ink-muted">
                    {formData.slug || "project-slug"}
                  </p>
                </div>
              </div>

              {/* Name */}
              <div>
                <label
                  htmlFor="name"
                  className="block text-xs font-medium text-ink-muted"
                >
                  Project Name
                </label>
                <input
                  type="text"
                  id="name"
                  value={formData.name}
                  onChange={(e) => handleNameChange(e.target.value)}
                  className="mt-1 block w-full rounded-lg border px-3 py-1.5 text-sm focus:border-line-strong focus:outline-none focus:ring-1 focus:ring-line-strong border-line bg-surface-raised text-ink placeholder-ink-subtle"
                  placeholder="My Awesome Project"
                  required
                />
              </div>

              {/* Slug */}
              <div>
                <label
                  htmlFor="slug"
                  className="block text-xs font-medium text-ink-muted"
                >
                  Slug
                </label>
                <div className="mt-1 flex rounded-lg border border-line bg-surface-raised">
                  <span className="flex items-center px-2.5 text-xs text-ink-muted">
                    /projects/
                  </span>
                  <input
                    type="text"
                    id="slug"
                    value={formData.slug}
                    onChange={(e) => handleSlugChange(e.target.value)}
                    className="block w-full rounded-r-lg border-0 bg-transparent px-0 py-1.5 text-sm focus:outline-none focus:ring-0 text-ink placeholder-ink-subtle"
                    placeholder="my-awesome-project"
                    required
                  />
                </div>
              </div>

              {/* Description */}
              <div>
                <label
                  htmlFor="description"
                  className="block text-xs font-medium text-ink-muted"
                >
                  Description <span className="text-ink-muted">(optional)</span>
                </label>
                <textarea
                  id="description"
                  value={formData.description}
                  onChange={(e) =>
                    setFormData((prev) => ({
                      ...prev,
                      description: e.target.value,
                    }))
                  }
                  rows={2}
                  className="mt-1 block w-full rounded-lg border px-3 py-1.5 text-sm focus:border-line-strong focus:outline-none focus:ring-1 focus:ring-line-strong border-line bg-surface-raised text-ink placeholder-ink-subtle"
                  placeholder="A brief description..."
                />
              </div>

              {/* Icon & Color -- hidden when using framework logo */}
              {isFrameworkIcon(formData.icon) ? (
                <div className="flex items-center justify-between rounded-lg border px-3 py-2 border-line bg-surface-raised/50">
                  <div className="flex items-center gap-2">
                    <ProjectIcon icon={formData.icon} size={18} />
                    <span className="text-xs text-ink-muted">
                      Using{" "}
                      {PROJECT_TYPES[parseFrameworkType(formData.icon)!]
                        ?.label ?? "framework"}{" "}
                      logo
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      setFormData((prev) => ({
                        ...prev,
                        icon: DEFAULT_PROJECT_ICON,
                        color: DEFAULT_PROJECT_COLOR,
                      }))
                    }
                    className="text-[10px] font-medium text-ink-subtle hover:text-ink"
                  >
                    Switch to custom icon
                  </button>
                </div>
              ) : (
                <>
                  {/* Icon */}
                  <div>
                    <span
                      id={iconLabelId}
                      className="block text-xs font-medium text-ink-muted"
                    >
                      Icon
                    </span>
                    <div
                      role="group"
                      aria-labelledby={iconLabelId}
                      className="mt-1.5 flex flex-wrap gap-1.5"
                    >
                      {PROJECT_ICONS.map((icon) => (
                        <button
                          key={icon}
                          type="button"
                          onClick={() =>
                            setFormData((prev) => ({ ...prev, icon }))
                          }
                          aria-label={icon}
                          aria-pressed={formData.icon === icon}
                          className={`flex h-8 w-8 items-center justify-center rounded-lg transition-all ${
                            formData.icon === icon
                              ? "bg-accent-soft ring-1 ring-accent-line"
                              : "bg-surface-raised hover:bg-surface-hover"
                          }`}
                        >
                          <ProjectIcon
                            icon={icon}
                            size={14}
                            className={
                              formData.icon === icon
                                ? "text-accent"
                                : "text-ink-muted"
                            }
                          />
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Color */}
                  <div>
                    <span
                      id={colorLabelId}
                      className="block text-xs font-medium text-ink-muted"
                    >
                      Color
                    </span>
                    <div
                      role="group"
                      aria-labelledby={colorLabelId}
                      className="mt-1.5 flex flex-wrap gap-1.5"
                    >
                      {PROJECT_COLORS.map((color) => (
                        <button
                          key={color}
                          type="button"
                          onClick={() =>
                            setFormData((prev) => ({ ...prev, color }))
                          }
                          aria-label={color}
                          aria-pressed={formData.color === color}
                          className={`h-7 w-7 rounded-lg transition-all ${
                            formData.color === color
                              ? "ring-2 ring-offset-1 ring-line"
                              : ""
                          }`}
                          style={{ backgroundColor: color }}
                        />
                      ))}
                    </div>
                  </div>
                </>
              )}

              {/* Template Variables Preview */}
              {selectedTemplate && (
                <TemplateVariablesPreview template={selectedTemplate} />
              )}

              {/* Actions */}
              <div className="flex items-center gap-2 pt-2">
                <Link
                  href="/dashboard/projects"
                  className="rounded-lg px-3 py-1.5 text-xs font-medium text-ink-muted hover:bg-surface-hover"
                >
                  Cancel
                </Link>
                <button
                  type="submit"
                  disabled={
                    isSubmitting ||
                    !formData.name ||
                    !formData.slug ||
                    !hasSelection
                  }
                  className="ml-auto flex items-center gap-1.5 rounded-lg px-4 py-1.5 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 bg-ink text-ink-inverse hover:bg-ink-muted"
                >
                  {isSubmitting ? (
                    <>
                      <div className="h-3 w-3 animate-spin rounded-full border-2 border-t-transparent" />
                      Creating...
                    </>
                  ) : (
                    <>
                      <svg
                        className="h-3.5 w-3.5"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth={2}
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M12 4v16m8-8H4"
                        />
                      </svg>
                      Create Project
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
