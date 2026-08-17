"use client";

import { useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { FolderPlus } from "lucide-react";
import { PageHeader } from "@envpilot/ui";
import { useAuthContext } from "@/components/auth";
import { useTierLimitCheck } from "@/hooks/useTierLimits";
import { useCreateProject, useCreateProjectFromTemplate } from "@/hooks";
import {
  isRateLimitError,
  isTierLimitError,
  sanitizeConvexError,
} from "@/lib/error-messages";
import { LimitWarning } from "@/components/tier/FeatureGate";
import { UpgradePrompt } from "@/components/tier/UpgradePrompt";
import { createLogger } from "@/lib/logger";
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
  const createFromTemplate = useCreateProjectFromTemplate();

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

      const projectArgs = {
        ...formData,
        description: formData.description || undefined,
        organizationId: organization.id,
      };

      // One call either way. With a template, the backend creates the project
      // and starts a workflow that writes every variable to the vault through
      // a bounded pool and commits them in a single transaction; this returns
      // as soon as the project row exists, so the user is never parked on a
      // spinner while N secrets encrypt. Progress streams to the project page
      // over the Convex socket.
      if (selectedTemplate) {
        await createFromTemplate({
          ...projectArgs,
          variables: selectedTemplate.variables.map((variable) => ({
            key: variable.key,
            description: variable.description,
            defaultValue: variable.defaultValue,
            placeholder: variable.placeholder,
            environments: variable.environments,
            isSensitive: variable.isSensitive,
          })),
        });
      } else {
        await createProject(projectArgs);
      }

      router.push(`/dashboard/projects/${formData.slug}`);
    } catch (err) {
      const message = sanitizeConvexError(err);
      // Restores the reporting this page had before the rewrite: the create is
      // now one call, so a failure here means no project AND no variables.
      log.error(
        "project_create_failed",
        {
          organizationId: organization?.id,
          slug: formData.slug,
          template: selectedTemplate?.id,
          variableCount: selectedTemplate?.variables.length ?? 0,
        },
        err
      );
      if (isRateLimitError(err)) setError(message);
      else if (isTierLimitError(message)) {
        setError(
          "You've reached the project limit on your current plan. Upgrade to Pro for unlimited projects."
        );
      } else setError(message);
    }
    // Cleared after the try/catch rather than in a finally block: React
    // Compiler bails on any function whose try carries a finalizer. The catch
    // swallows, and the one early return inside the try already clears the
    // flag before it returns, so every path lands here or has handled it.
    setIsSubmitting(false);
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
    <div className="space-y-6">
      {/* No back arrow here any more: the shell renders breadcrumbs with a
          history-back control above every dashboard page. */}
      <PageHeader
        icon={FolderPlus}
        title="Create New Project"
        description={organization ? `in ${organization.name}` : undefined}
      />

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

      {/* One hairline splits the two halves. The page carried two bordered
          panels with nine more bordered elements nested inside them, all at
          the same weight; the separators do that work now. Full width too —
          this was max-w-6xl inside a max-w-7xl shell, so the page with the
          most content was the narrowest in the app. */}
      <div className="grid grid-cols-1 border-t border-line lg:grid-cols-[1.55fr_1fr]">
        {/* Capped and independently scrollable below lg. Stacked, the full
            list of 31 templates sits between the user and the name field, so
            on a phone you scroll the entire catalogue before discovering
            there is a form at all. */}
        <div className="max-h-[55vh] overflow-y-auto border-line lg:max-h-none lg:overflow-visible lg:border-r">
          <TemplateSelector
            selectedTemplateId={
              fromScratch ? null : selectedTemplate?.id || undefined
            }
            onSelectTemplate={handleTemplateSelect}
          />
        </div>

        <div className="border-t border-line lg:border-t-0">
          <div className="lg:sticky lg:top-6">
            <form
              onSubmit={handleSubmit}
              className="space-y-5 px-4 py-4 sm:px-5"
            >
              {/* Name. Underline inputs: a filled, bordered box per field was
                  a large part of what made this page read as a stack of
                  containers rather than a form. */}
              <div>
                <label
                  htmlFor="name"
                  className="block font-mono text-[10.5px] uppercase tracking-wider text-ink-faint"
                >
                  name
                </label>
                <input
                  type="text"
                  id="name"
                  value={formData.name}
                  onChange={(e) => handleNameChange(e.target.value)}
                  className="mt-1 block w-full border-0 border-b bg-transparent px-0 py-1.5 text-sm focus:border-line-strong focus:outline-none focus:ring-0 border-line text-ink placeholder-ink-faint"
                  placeholder="My Awesome Project"
                  required
                />
              </div>

              {/* Slug */}
              <div>
                <label
                  htmlFor="slug"
                  className="block font-mono text-[10.5px] uppercase tracking-wider text-ink-faint"
                >
                  slug
                </label>
                <div className="mt-1 flex items-center border-b border-line">
                  <span className="font-mono text-xs text-ink-faint">
                    /projects/
                  </span>
                  <input
                    type="text"
                    id="slug"
                    value={formData.slug}
                    onChange={(e) => handleSlugChange(e.target.value)}
                    className="block w-full border-0 bg-transparent px-0 py-1.5 font-mono text-xs focus:outline-none focus:ring-0 text-ink placeholder-ink-faint"
                    placeholder="my-awesome-project"
                    required
                  />
                </div>
              </div>

              {/* Description */}
              <div>
                <label
                  htmlFor="description"
                  className="block font-mono text-[10.5px] uppercase tracking-wider text-ink-faint"
                >
                  description <span className="normal-case">(optional)</span>
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
                  className="mt-1 block w-full resize-none border-0 border-b bg-transparent px-0 py-1.5 text-sm focus:border-line-strong focus:outline-none focus:ring-0 border-line text-ink placeholder-ink-faint"
                  placeholder="A brief description..."
                />
              </div>

              {/* Icon & Color -- hidden when using framework logo */}
              {isFrameworkIcon(formData.icon) ? (
                <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-b py-2 border-line">
                  <div className="flex min-w-0 items-center gap-2">
                    <ProjectIcon icon={formData.icon} size={18} />
                    <span className="truncate text-xs text-ink-muted">
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
                    className="shrink-0 text-[10px] font-medium text-ink-subtle hover:text-ink"
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
                      className="block font-mono text-[10.5px] uppercase tracking-wider text-ink-faint"
                    >
                      icon
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
                          className={`flex h-[26px] w-[26px] items-center justify-center rounded border transition-colors ${
                            formData.icon === icon
                              ? "border-accent-line bg-accent-soft"
                              : "border-line hover:bg-surface-hover"
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
                      className="block font-mono text-[10.5px] uppercase tracking-wider text-ink-faint"
                    >
                      colour
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
                          className={`h-[19px] w-[19px] rounded transition-all ${
                            formData.color === color
                              ? "outline outline-2 outline-offset-1 outline-ink"
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
              <div className="flex items-center gap-2 border-t pt-4 border-line">
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
