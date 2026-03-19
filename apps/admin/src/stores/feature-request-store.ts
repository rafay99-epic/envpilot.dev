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
    dot: "bg-zinc-400",
    bg: "bg-zinc-400/10",
    border: "border-zinc-500/30",
    dropBorder: "border-zinc-400/40",
    dropBg: "bg-zinc-400/5",
    dropText: "text-zinc-400",
    glowShadow: "shadow-zinc-400/20",
  },
  {
    value: "under_review",
    label: "Under Review",
    dot: "bg-blue-400",
    bg: "bg-blue-400/10",
    border: "border-blue-500/30",
    dropBorder: "border-blue-400/40",
    dropBg: "bg-blue-400/5",
    dropText: "text-blue-400",
    glowShadow: "shadow-blue-400/20",
  },
  {
    value: "planned",
    label: "Planned",
    dot: "bg-purple-400",
    bg: "bg-purple-400/10",
    border: "border-purple-500/30",
    dropBorder: "border-purple-400/40",
    dropBg: "bg-purple-400/5",
    dropText: "text-purple-400",
    glowShadow: "shadow-purple-400/20",
  },
  {
    value: "in_progress",
    label: "In Progress",
    dot: "bg-amber-400",
    bg: "bg-amber-400/10",
    border: "border-amber-500/30",
    dropBorder: "border-amber-400/40",
    dropBg: "bg-amber-400/5",
    dropText: "text-amber-400",
    glowShadow: "shadow-amber-400/20",
  },
  {
    value: "completed",
    label: "Completed",
    dot: "bg-emerald-400",
    bg: "bg-emerald-400/10",
    border: "border-emerald-500/30",
    dropBorder: "border-emerald-400/40",
    dropBg: "bg-emerald-400/5",
    dropText: "text-emerald-400",
    glowShadow: "shadow-emerald-400/20",
  },
  {
    value: "declined",
    label: "Declined",
    dot: "bg-red-400",
    bg: "bg-red-400/10",
    border: "border-red-500/30",
    dropBorder: "border-red-400/40",
    dropBg: "bg-red-400/5",
    dropText: "text-red-400",
    glowShadow: "shadow-red-400/20",
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
