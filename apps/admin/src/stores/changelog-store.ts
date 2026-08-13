import { create } from "zustand";
import type { Id } from "@convex/_generated/dataModel";

// ==========================================
// Types
// ==========================================

export type ChangelogType =
  | "feature"
  | "improvement"
  | "fix"
  | "security"
  | "breaking";

export type PublishMode = "draft" | "immediate" | "scheduled";
export type ViewMode = "list" | "editor";
export type EditorTab = "write" | "preview";
export type FilterType = ChangelogType | "all";

export interface ChangelogForm {
  title: string;
  content: string;
  version: string;
  types: ChangelogType[];
  publishMode: PublishMode;
  scheduledFor: string | null; // ISO datetime-local string for the input
}

// ==========================================
// Constants
// ==========================================

export const EMPTY_FORM: ChangelogForm = {
  title: "",
  content: "",
  version: "",
  types: ["feature"],
  publishMode: "draft",
  scheduledFor: null,
};

export const TYPE_OPTIONS: {
  value: ChangelogType;
  label: string;
  prefix: string;
  color: string;
}[] = [
  {
    value: "feature",
    label: "Feature",
    prefix: "+",
    color: "text-accent",
  },
  {
    value: "improvement",
    label: "Improvement",
    prefix: "~",
    color: "text-info",
  },
  { value: "fix", label: "Bug Fix", prefix: "!", color: "text-danger" },
  {
    value: "security",
    label: "Security",
    prefix: "#",
    color: "text-warning",
  },
  {
    value: "breaking",
    label: "Breaking Change",
    prefix: "!!",
    color: "text-premium",
  },
];

export const TYPE_CONFIG: Record<
  ChangelogType,
  {
    label: string;
    color: string;
    bgColor: string;
    borderColor: string;
    prefix: string;
  }
> = {
  feature: {
    label: "Feature",
    color: "text-accent",
    bgColor: "bg-accent-soft",
    borderColor: "border-accent-line",
    prefix: "+",
  },
  improvement: {
    label: "Improvement",
    color: "text-info",
    bgColor: "bg-info-soft",
    borderColor: "border-info-line",
    prefix: "~",
  },
  fix: {
    label: "Bug Fix",
    color: "text-danger",
    bgColor: "bg-danger-soft",
    borderColor: "border-danger-line",
    prefix: "!",
  },
  security: {
    label: "Security",
    color: "text-warning",
    bgColor: "bg-warning-soft",
    borderColor: "border-warning-line",
    prefix: "#",
  },
  breaking: {
    label: "Breaking",
    color: "text-premium",
    bgColor: "bg-premium-soft",
    borderColor: "border-premium-line",
    prefix: "!!",
  },
};

// ==========================================
// Store
// ==========================================

interface ChangelogState {
  // View
  viewMode: ViewMode;
  editorTab: EditorTab;
  filterType: FilterType;

  // Editor
  editingId: Id<"changelog"> | null;
  form: ChangelogForm;
  isSaving: boolean;
  hasUnsavedChanges: boolean;

  // Actions — View
  setViewMode: (mode: ViewMode) => void;
  setEditorTab: (tab: EditorTab) => void;
  setFilterType: (type: FilterType) => void;

  // Actions — Editor
  openCreate: () => void;
  openEdit: (id: Id<"changelog">, data: ChangelogForm) => void;
  closeEditor: () => void;
  updateField: <K extends keyof ChangelogForm>(
    field: K,
    value: ChangelogForm[K]
  ) => void;
  toggleType: (type: ChangelogType) => void;
  setForm: (form: ChangelogForm) => void;
  setSaving: (saving: boolean) => void;
  markSaved: () => void;

  // Actions — Markdown helpers
  insertMarkdown: (prefix: string, suffix?: string) => void;
}

export const useChangelogStore = create<ChangelogState>((set) => ({
  // View defaults
  viewMode: "list",
  editorTab: "write",
  filterType: "all",

  // Editor defaults
  editingId: null,
  form: { ...EMPTY_FORM },
  isSaving: false,
  hasUnsavedChanges: false,

  // View actions
  setViewMode: (mode) => set({ viewMode: mode }),
  setEditorTab: (tab) => set({ editorTab: tab }),
  setFilterType: (type) => set({ filterType: type }),

  // Editor actions
  openCreate: () =>
    set({
      viewMode: "editor",
      editorTab: "write",
      editingId: null,
      form: { ...EMPTY_FORM },
      hasUnsavedChanges: false,
    }),

  openEdit: (id, data) =>
    set({
      viewMode: "editor",
      editorTab: "write",
      editingId: id,
      form: { ...data },
      hasUnsavedChanges: false,
    }),

  closeEditor: () =>
    set({
      viewMode: "list",
      editingId: null,
      form: { ...EMPTY_FORM },
      hasUnsavedChanges: false,
      editorTab: "write",
    }),

  updateField: (field, value) =>
    set((state) => ({
      form: { ...state.form, [field]: value },
      hasUnsavedChanges: true,
    })),

  toggleType: (type) =>
    set((state) => {
      const current = state.form.types;
      const has = current.includes(type);
      // Don't allow deselecting the last type
      if (has && current.length === 1) return state;
      const next = has ? current.filter((t) => t !== type) : [...current, type];
      return {
        form: { ...state.form, types: next },
        hasUnsavedChanges: true,
      };
    }),

  setForm: (form) => set({ form, hasUnsavedChanges: true }),

  setSaving: (saving) => set({ isSaving: saving }),

  markSaved: () => set({ hasUnsavedChanges: false, isSaving: false }),

  // Insert markdown formatting at cursor (appends to content)
  insertMarkdown: (prefix, suffix = "") =>
    set((state) => ({
      form: {
        ...state.form,
        content: state.form.content + prefix + suffix,
      },
      hasUnsavedChanges: true,
    })),
}));
