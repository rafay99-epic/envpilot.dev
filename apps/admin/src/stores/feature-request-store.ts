import { create } from "zustand";

export type FeatureRequestStatus =
  | "submitted"
  | "under_review"
  | "planned"
  | "in_progress"
  | "completed"
  | "declined";

export const STATUS_COLUMNS: {
  value: FeatureRequestStatus;
  label: string;
  dot: string;
  bg: string;
  border: string;
  dropBorder: string;
  dropBg: string;
  dropText: string;
  glowShadow: string;
}[] = [
  {
    value: "submitted",
    label: "Submitted",
    dot: "bg-surface-hover",
    bg: "bg-surface-hover/10",
    border: "border-line-strong",
    dropBorder: "border-line-strong",
    dropBg: "bg-surface-hover/5",
    dropText: "text-ink-muted",
    glowShadow: "shadow-line-strong",
  },
  {
    value: "under_review",
    label: "Under Review",
    dot: "bg-info",
    bg: "bg-info-soft",
    border: "border-info-line",
    dropBorder: "border-info-line",
    dropBg: "bg-info-soft",
    dropText: "text-info",
    glowShadow: "shadow-info-line",
  },
  {
    value: "planned",
    label: "Planned",
    dot: "bg-premium",
    bg: "bg-premium-soft",
    border: "border-premium-line",
    dropBorder: "border-premium-line",
    dropBg: "bg-premium-soft",
    dropText: "text-premium",
    glowShadow: "shadow-premium-line",
  },
  {
    value: "in_progress",
    label: "In Progress",
    dot: "bg-warning",
    bg: "bg-warning-soft",
    border: "border-warning-line",
    dropBorder: "border-warning-line",
    dropBg: "bg-warning-soft",
    dropText: "text-warning",
    glowShadow: "shadow-warning-line",
  },
  {
    value: "completed",
    label: "Completed",
    dot: "bg-accent",
    bg: "bg-accent-soft",
    border: "border-accent-line",
    dropBorder: "border-accent-line",
    dropBg: "bg-accent-soft",
    dropText: "text-accent",
    glowShadow: "shadow-accent-line",
  },
  {
    value: "declined",
    label: "Declined",
    dot: "bg-danger",
    bg: "bg-danger-soft",
    border: "border-danger-line",
    dropBorder: "border-danger-line",
    dropBg: "bg-danger-soft",
    dropText: "text-danger",
    glowShadow: "shadow-danger-line",
  },
];

export interface CreateFormData {
  title: string;
  description: string;
  category: string;
  status: FeatureRequestStatus;
  adminNotes: string;
}

const EMPTY_FORM: CreateFormData = {
  title: "",
  description: "",
  category: "",
  status: "planned",
  adminNotes: "",
};

interface FeatureRequestStore {
  // Board state
  search: string;
  setSearch: (s: string) => void;
  expandedId: string | null;
  setExpandedId: (id: string | null) => void;
  editingNotes: Record<string, string>;
  setNoteForId: (id: string, note: string) => void;
  initNoteForId: (id: string, note: string) => void;
  savingNoteId: string | null;
  setSavingNoteId: (id: string | null) => void;

  // Creator panel
  isCreating: boolean;
  openCreator: () => void;
  closeCreator: () => void;
  createForm: CreateFormData;
  setCreateField: <K extends keyof CreateFormData>(
    key: K,
    value: CreateFormData[K]
  ) => void;
  resetCreateForm: () => void;
  isCreateDirty: () => boolean;
}

export const useFeatureRequestStore = create<FeatureRequestStore>(
  (set, get) => ({
    // Board state
    search: "",
    setSearch: (search) => set({ search }),
    expandedId: null,
    setExpandedId: (expandedId) => set({ expandedId }),
    editingNotes: {},
    setNoteForId: (id, note) =>
      set((state) => ({
        editingNotes: { ...state.editingNotes, [id]: note },
      })),
    initNoteForId: (id, note) =>
      set((state) => {
        if (id in state.editingNotes) return state;
        return { editingNotes: { ...state.editingNotes, [id]: note } };
      }),
    savingNoteId: null,
    setSavingNoteId: (savingNoteId) => set({ savingNoteId }),

    // Creator panel
    isCreating: false,
    openCreator: () => set({ isCreating: true, createForm: { ...EMPTY_FORM } }),
    closeCreator: () => set({ isCreating: false }),
    createForm: { ...EMPTY_FORM },
    setCreateField: (key, value) =>
      set((state) => ({
        createForm: { ...state.createForm, [key]: value },
      })),
    resetCreateForm: () => set({ createForm: { ...EMPTY_FORM } }),
    isCreateDirty: () => {
      const form = get().createForm;
      return (
        form.title.trim() !== "" ||
        form.description.trim() !== "" ||
        form.category.trim() !== "" ||
        form.adminNotes.trim() !== "" ||
        form.status !== "planned"
      );
    },
  })
);
