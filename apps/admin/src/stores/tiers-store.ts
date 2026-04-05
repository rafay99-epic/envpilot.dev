import { create } from "zustand";
import type { Id } from "@convex/_generated/dataModel";

// ==========================================
// Types
// ==========================================

export interface TierFormData {
  name: string;
  displayName: string;
  description: string;
  sortOrder: number;
  isDefault: boolean;
  color: string;
  polarProductId: string;
}

export const EMPTY_TIER_FORM: TierFormData = {
  name: "",
  displayName: "",
  description: "",
  sortOrder: 0,
  isDefault: false,
  color: "#71717a",
  polarProductId: "",
};

export interface PendingChange {
  tierName: string;
  featureKey: string;
  featureDisplayName: string;
  value: string;
  previousValue: string;
  valueType: "boolean" | "numeric";
}

// ==========================================
// Store
// ==========================================

interface TiersState {
  // Matrix filter state
  matrixSearch: string;
  activeCategoryFilter: string | null;
  collapsedCategories: Record<string, boolean>;

  // Pending changes — key = `${tierName}::${featureKey}`
  pendingChanges: Record<string, PendingChange>;
  savingKeys: Set<string>;

  // Tier modal form
  showModal: boolean;
  editingId: Id<"tierDefinitions"> | null;
  form: TierFormData;
  isSaving: boolean;

  // Actions — Filter
  setMatrixSearch: (search: string) => void;
  setActiveCategoryFilter: (filter: string | null) => void;
  toggleCategory: (category: string) => void;
  setAllCategoriesCollapsed: (collapsed: boolean, categories: string[]) => void;

  // Actions — Pending changes
  setPendingChange: (change: PendingChange) => void;
  removePendingChange: (key: string) => void;
  clearAllPending: () => void;
  markSaving: (key: string) => void;
  markSaved: (key: string) => void;
  markSaveFailed: (key: string) => void;
  getPendingChangeCount: () => number;

  // Actions — Tier modal
  openCreateModal: (defaultSortOrder: number) => void;
  openEditModal: (id: Id<"tierDefinitions">, data: TierFormData) => void;
  closeModal: () => void;
  updateForm: <K extends keyof TierFormData>(
    field: K,
    value: TierFormData[K]
  ) => void;
  setIsSaving: (saving: boolean) => void;
}

export const useTiersStore = create<TiersState>((set, get) => ({
  // Filter defaults
  matrixSearch: "",
  activeCategoryFilter: null,
  collapsedCategories: {},

  // Pending changes defaults
  pendingChanges: {},
  savingKeys: new Set(),

  // Modal defaults
  showModal: false,
  editingId: null,
  form: { ...EMPTY_TIER_FORM },
  isSaving: false,

  // Filter actions
  setMatrixSearch: (search) => set({ matrixSearch: search }),

  setActiveCategoryFilter: (filter) => set({ activeCategoryFilter: filter }),

  toggleCategory: (category) =>
    set((state) => ({
      collapsedCategories: {
        ...state.collapsedCategories,
        [category]: !state.collapsedCategories[category],
      },
    })),

  setAllCategoriesCollapsed: (collapsed, categories) =>
    set(() => {
      const next: Record<string, boolean> = {};
      for (const c of categories) next[c] = collapsed;
      return { collapsedCategories: next };
    }),

  // Pending changes actions
  setPendingChange: (change) =>
    set((state) => {
      const key = `${change.tierName}::${change.featureKey}`;
      // If the new value matches the original server value, remove the pending change
      if (change.value === change.previousValue) {
        const { [key]: _removed, ...rest } = state.pendingChanges;
        return { pendingChanges: rest };
      }
      return {
        pendingChanges: { ...state.pendingChanges, [key]: change },
      };
    }),

  removePendingChange: (key) =>
    set((state) => {
      const { [key]: _removed, ...rest } = state.pendingChanges;
      const nextSaving = new Set(state.savingKeys);
      nextSaving.delete(key);
      return { pendingChanges: rest, savingKeys: nextSaving };
    }),

  clearAllPending: () => set({ pendingChanges: {}, savingKeys: new Set() }),

  markSaving: (key) =>
    set((state) => {
      const next = new Set(state.savingKeys);
      next.add(key);
      return { savingKeys: next };
    }),

  markSaved: (key) =>
    set((state) => {
      const { [key]: _removed, ...rest } = state.pendingChanges;
      const nextSaving = new Set(state.savingKeys);
      nextSaving.delete(key);
      return { pendingChanges: rest, savingKeys: nextSaving };
    }),

  markSaveFailed: (key) =>
    set((state) => {
      const nextSaving = new Set(state.savingKeys);
      nextSaving.delete(key);
      return { savingKeys: nextSaving };
    }),

  getPendingChangeCount: () => Object.keys(get().pendingChanges).length,

  // Modal actions
  openCreateModal: (defaultSortOrder) =>
    set({
      showModal: true,
      editingId: null,
      form: { ...EMPTY_TIER_FORM, sortOrder: defaultSortOrder },
      isSaving: false,
    }),

  openEditModal: (id, data) =>
    set({
      showModal: true,
      editingId: id,
      form: { ...data },
      isSaving: false,
    }),

  closeModal: () =>
    set({
      showModal: false,
      editingId: null,
      form: { ...EMPTY_TIER_FORM },
      isSaving: false,
    }),

  updateForm: (field, value) =>
    set((state) => ({
      form: { ...state.form, [field]: value },
    })),

  setIsSaving: (saving) => set({ isSaving: saving }),
}));

// ==========================================
// Utility: build pending change key
// ==========================================

export function pendingKey(tierName: string, featureKey: string): string {
  return `${tierName}::${featureKey}`;
}
