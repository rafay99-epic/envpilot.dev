"use client";

import { useEffect, useRef, useState } from "react";
import { SaveBar, SettingsField, SettingsSection } from "@envpilot/ui";
import { SectionProvenance } from "@/components/settings/SectionProvenance";
import { TerminalInput } from "@/components/dashboard/terminal-ui";
import { FrameworkLogo, ProjectIcon } from "@/components/ui";
import {
  DEFAULT_PROJECT_COLOR,
  DEFAULT_PROJECT_ICON,
  PROJECT_COLORS,
  PROJECT_ICONS,
} from "@/constants/project";
import {
  FRAMEWORK_ICON_TYPES,
  isFrameworkIcon,
  toFrameworkIcon,
} from "@/constants/framework-logos";
import { PROJECT_TYPES } from "@/constants/templates";
import { useUnsavedChanges, useUpdateProject } from "@/hooks";
import { sanitizeConvexError } from "@/lib/error-messages";
import type { Doc } from "@convex/_generated/dataModel";

type ProjectForm = {
  name: string;
  description: string;
  icon: string;
  color: string;
};

function toForm(project: Doc<"projects">): ProjectForm {
  return {
    name: project.name,
    description: project.description || "",
    icon: project.icon || DEFAULT_PROJECT_ICON,
    color: project.color || DEFAULT_PROJECT_COLOR,
  };
}

export function GeneralTab({ project }: { project: Doc<"projects"> }) {
  const updateProject = useUpdateProject();

  const [snapshot, setSnapshot] = useState<ProjectForm>(() => toForm(project));
  const [form, setForm] = useState<ProjectForm>(snapshot);
  const [iconMode, setIconMode] = useState<"framework" | "custom">(
    isFrameworkIcon(snapshot.icon) ? "framework" : "custom"
  );
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState(false);

  // Reseed only when the page moves to a different project — a reactive
  // update from someone else's write must never clobber in-flight edits.
  const seededProjectId = useRef(project._id);
  useEffect(() => {
    if (seededProjectId.current === project._id) return;
    seededProjectId.current = project._id;
    const next = toForm(project);
    setSnapshot(next);
    setForm(next);
    setIconMode(isFrameworkIcon(next.icon) ? "framework" : "custom");
  }, [project]);

  const { dirtyCount } = useUnsavedChanges(form, snapshot);

  // A project may hold a colour from before the current ramp; show it as an
  // extra swatch so the picker stays truthful and a save cannot silently
  // overwrite it.
  const storedColor = project.color;
  const swatches: readonly string[] =
    storedColor && !(PROJECT_COLORS as readonly string[]).includes(storedColor)
      ? [...PROJECT_COLORS, storedColor]
      : PROJECT_COLORS;

  const handleIconModeSwitch = (mode: "framework" | "custom") => {
    setIconMode(mode);
    if (mode === "custom" && isFrameworkIcon(form.icon)) {
      setForm((prev) => ({
        ...prev,
        icon: DEFAULT_PROJECT_ICON,
        color: DEFAULT_PROJECT_COLOR,
      }));
    }
  };

  const handleSave = async () => {
    if (!form.name.trim()) {
      setError("Project name is required");
      return;
    }

    setError(null);
    setSavedAt(false);
    setIsSaving(true);
    // Freeze what is being sent: edits typed while the request is in flight
    // must stay dirty rather than be snapshotted as saved.
    const sent = form;

    try {
      await updateProject({ projectId: project._id, ...sent });
      setSnapshot(sent);
      setSavedAt(true);
    } catch (err) {
      setError(sanitizeConvexError(err));
    } finally {
      setIsSaving(false);
    }
  };

  const handleDiscard = () => {
    setForm(snapshot);
    setError(null);
    setIconMode(isFrameworkIcon(snapshot.icon) ? "framework" : "custom");
  };

  return (
    <>
      <SettingsSection
        title="Identity"
        description="How this project reads everywhere it is listed."
        aside={
          <SectionProvenance
            organizationId={project.organizationId}
            action="project.updated"
            projectId={project._id}
          />
        }
      >
        <div className="flex items-center gap-3">
          <span
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-panel"
            style={{
              backgroundColor: isFrameworkIcon(form.icon)
                ? "transparent"
                : form.color,
            }}
          >
            <ProjectIcon
              icon={form.icon}
              size={isFrameworkIcon(form.icon) ? 30 : 20}
            />
          </span>
          <div className="min-w-0">
            <p className="truncate text-[14px] font-medium text-ink">
              {form.name || "Untitled project"}
            </p>
            <p className="truncate font-mono text-[12px] text-ink-subtle">
              {project.slug}
            </p>
          </div>
        </div>

        <SettingsField label="Project name" htmlFor="project-name">
          <TerminalInput
            id="project-name"
            type="text"
            value={form.name}
            onChange={(e) =>
              setForm((prev) => ({ ...prev, name: e.target.value }))
            }
            placeholder="My awesome project"
            required
          />
        </SettingsField>

        <SettingsField
          label="Description"
          htmlFor="project-description"
          hint="Optional. Shown on the project overview."
        >
          <textarea
            id="project-description"
            value={form.description}
            onChange={(e) =>
              setForm((prev) => ({ ...prev, description: e.target.value }))
            }
            rows={3}
            className="w-full resize-none rounded-panel border border-line bg-surface-raised px-3 py-2 text-sm text-ink placeholder-ink-subtle transition-colors focus:border-accent-line focus:ring-1 focus:ring-accent-line focus:outline-none"
            placeholder="A brief description of your project..."
          />
        </SettingsField>
      </SettingsSection>

      <SettingsSection
        title="Appearance"
        description="Pick a framework logo, or a custom icon on a colour."
      >
        <div className="flex gap-2">
          {(["framework", "custom"] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() => handleIconModeSwitch(mode)}
              aria-pressed={iconMode === mode}
              className={`rounded-panel px-3 py-1.5 text-xs font-medium ring-1 transition-colors ${
                iconMode === mode
                  ? "bg-accent-soft text-accent ring-accent-line"
                  : "text-ink-muted ring-line hover:text-ink"
              }`}
            >
              {mode === "framework" ? "Framework logo" : "Custom icon"}
            </button>
          ))}
        </div>

        {iconMode === "framework" ? (
          <div className="grid max-h-[280px] grid-cols-4 gap-2 overflow-y-auto">
            {FRAMEWORK_ICON_TYPES.map((type) => {
              const isSelected = form.icon === toFrameworkIcon(type);
              return (
                <button
                  key={type}
                  type="button"
                  onClick={() =>
                    setForm((prev) => ({
                      ...prev,
                      icon: toFrameworkIcon(type),
                    }))
                  }
                  aria-pressed={isSelected}
                  className={`flex flex-col items-center gap-1.5 rounded-panel p-2 ring-1 transition-all ${
                    isSelected
                      ? "bg-accent-soft ring-accent-line"
                      : "ring-line hover:bg-surface-hover"
                  }`}
                >
                  <FrameworkLogo projectType={type} size={20} />
                  <span
                    className={`truncate text-[10px] ${
                      isSelected ? "text-accent" : "text-ink-muted"
                    }`}
                  >
                    {PROJECT_TYPES[type]?.label}
                  </span>
                </button>
              );
            })}
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            {PROJECT_ICONS.map((icon) => (
              <button
                key={icon}
                type="button"
                onClick={() => setForm((prev) => ({ ...prev, icon }))}
                aria-label={icon}
                aria-pressed={form.icon === icon}
                className={`flex h-10 w-10 items-center justify-center rounded-panel ring-1 transition-all ${
                  form.icon === icon
                    ? "bg-accent-soft ring-accent-line"
                    : "ring-line hover:bg-surface-hover"
                }`}
              >
                <ProjectIcon
                  icon={icon}
                  size={18}
                  className={
                    form.icon === icon ? "text-accent" : "text-ink-muted"
                  }
                />
              </button>
            ))}
          </div>
        )}

        {/* Colour is meaningless behind a framework logo, which draws its own. */}
        {!isFrameworkIcon(form.icon) && (
          <SettingsField label="Background colour">
            <div className="flex flex-wrap gap-2">
              {swatches.map((color) => (
                <button
                  key={color}
                  type="button"
                  onClick={() => setForm((prev) => ({ ...prev, color }))}
                  aria-label={color}
                  aria-pressed={form.color === color}
                  className={`h-8 w-8 rounded-panel transition-all ${
                    form.color === color
                      ? "ring-2 ring-accent-line ring-offset-2 ring-offset-line"
                      : ""
                  }`}
                  style={{ backgroundColor: color }}
                />
              ))}
            </div>
          </SettingsField>
        )}
      </SettingsSection>

      {savedAt && dirtyCount === 0 && (
        <p className="font-mono text-[12px] text-accent">
          ✓ Project updated successfully
        </p>
      )}

      <SaveBar
        dirtyCount={dirtyCount}
        saving={isSaving}
        error={error}
        onSave={handleSave}
        onDiscard={handleDiscard}
      />
    </>
  );
}
