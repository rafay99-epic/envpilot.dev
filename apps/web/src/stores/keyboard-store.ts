import { create } from "zustand";

interface KeyboardState {
  isHelpDialogOpen: boolean;
  isShortcutsEnabled: boolean;
  customBindings: Record<string, string>;
  isBindingsLoaded: boolean;
}

interface KeyboardActions {
  openHelpDialog: () => void;
  closeHelpDialog: () => void;
  setShortcutsEnabled: (enabled: boolean) => void;
  setCustomBindings: (bindings: Record<string, string>) => void;
  updateBinding: (shortcutId: string, binding: string) => void;
  removeBinding: (shortcutId: string) => void;
  resetAllBindings: () => void;
}

export type KeyboardStore = KeyboardState & KeyboardActions;

export const useKeyboardStore = create<KeyboardStore>((set) => ({
  isHelpDialogOpen: false,
  isShortcutsEnabled: true,
  customBindings: {},
  isBindingsLoaded: false,

  openHelpDialog: () => set({ isHelpDialogOpen: true }),
  closeHelpDialog: () => set({ isHelpDialogOpen: false }),
  setShortcutsEnabled: (enabled) => set({ isShortcutsEnabled: enabled }),
  setCustomBindings: (bindings) =>
    set({ customBindings: bindings, isBindingsLoaded: true }),
  updateBinding: (shortcutId, binding) =>
    set((state) => ({
      customBindings: { ...state.customBindings, [shortcutId]: binding },
    })),
  removeBinding: (shortcutId) =>
    set((state) => {
      const { [shortcutId]: _, ...rest } = state.customBindings;
      return { customBindings: rest };
    }),
  resetAllBindings: () => set({ customBindings: {} }),
}));
