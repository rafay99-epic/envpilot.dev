import { create } from "zustand";

interface VariableSelectionState {
  selectedIds: Set<string>;
  isSelectionMode: boolean;
  isBulkDeleting: boolean;
  showConfirmDialog: boolean;
}

interface VariableSelectionActions {
  toggleSelect: (id: string) => void;
  selectAll: (ids: string[]) => void;
  clearSelection: () => void;
  enterSelectionMode: () => void;
  exitSelectionMode: () => void;
  setBulkDeleting: (deleting: boolean) => void;
  setShowConfirmDialog: (show: boolean) => void;
}

export type VariableSelectionStore = VariableSelectionState &
  VariableSelectionActions;

export const useVariableSelectionStore = create<VariableSelectionStore>(
  (set) => ({
    selectedIds: new Set<string>(),
    isSelectionMode: false,
    isBulkDeleting: false,
    showConfirmDialog: false,

    toggleSelect: (id) =>
      set((state) => {
        const next = new Set(state.selectedIds);
        if (next.has(id)) {
          next.delete(id);
        } else {
          next.add(id);
        }
        return {
          selectedIds: next,
          isSelectionMode: next.size > 0,
        };
      }),

    selectAll: (ids) =>
      set({
        selectedIds: new Set(ids),
        isSelectionMode: ids.length > 0,
      }),

    clearSelection: () =>
      set({
        selectedIds: new Set<string>(),
        isSelectionMode: false,
      }),

    enterSelectionMode: () => set({ isSelectionMode: true }),

    exitSelectionMode: () =>
      set({
        selectedIds: new Set<string>(),
        isSelectionMode: false,
        showConfirmDialog: false,
      }),

    setBulkDeleting: (deleting) => set({ isBulkDeleting: deleting }),

    setShowConfirmDialog: (show) => set({ showConfirmDialog: show }),
  })
);
