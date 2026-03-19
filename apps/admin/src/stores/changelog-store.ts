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

export type ViewMode = "list" | "editor";
export type EditorTab = "write" | "preview";
export type FilterType = ChangelogType | "all";

export interface ChangelogForm {
  title: string;
  content: string;
  version: string;
  type: ChangelogType;
  isPublished: boolean;
}

// ==========================================
// Constants
// ==========================================

export const EMPTY_FORM: ChangelogForm = {
  title: "",
  content: "",
  version: "",
  type: "feature",
  isPublished: false,
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
    color: "text-emerald-400",
  },
  {
    value: "improvement",
    label: "Improvement",
    prefix: "~",
    color: "text-blue-400",
  },
  { value: "fix", label: "Bug Fix", prefix: "!", color: "text-red-400" },
  {
    value: "security",
    label: "Security",
    prefix: "#",
    color: "text-amber-400",
  },
  {
    value: "breaking",
    label: "Breaking Change",
    prefix: "!!",
    color: "text-purple-400",
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
    color: "text-emerald-400",
    bgColor: "bg-emerald-500/10",
    borderColor: "border-emerald-500/20",
    prefix: "+",
  },
  improvement: {
    label: "Improvement",
    color: "text-blue-400",
    bgColor: "bg-blue-500/10",
    borderColor: "border-blue-500/20",
    prefix: "~",
  },
  fix: {
    label: "Bug Fix",
    color: "text-red-400",
    bgColor: "bg-red-500/10",
    borderColor: "border-red-500/20",
    prefix: "!",
  },
  security: {
    label: "Security",
    color: "text-amber-400",
    bgColor: "bg-amber-500/10",
    borderColor: "border-amber-500/20",
    prefix: "#",
  },
  breaking: {
    label: "Breaking",
    color: "text-purple-400",
    bgColor: "bg-purple-500/10",
    borderColor: "border-purple-500/20",
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
