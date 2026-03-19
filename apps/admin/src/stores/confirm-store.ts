import { create } from "zustand";

interface ConfirmState {
  isOpen: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel: string;
  variant: "danger" | "warning" | "default";
  onConfirm: (() => void) | null;
  onCancel: (() => void) | null;

  confirm: (options: {
    title: string;
    message: string;
    confirmLabel?: string;
    cancelLabel?: string;
    variant?: "danger" | "warning" | "default";
  }) => Promise<boolean>;

  close: () => void;
}

export const useConfirmStore = create<ConfirmState>((set) => ({
  isOpen: false,
  title: "",
  message: "",
  confirmLabel: "Confirm",
  cancelLabel: "Cancel",
  variant: "danger",
  onConfirm: null,
  onCancel: null,

  confirm: (options) =>
    new Promise<boolean>((resolve) => {
      set({
        isOpen: true,
        title: options.title,
        message: options.message,
        confirmLabel: options.confirmLabel ?? "Confirm",
        cancelLabel: options.cancelLabel ?? "Cancel",
        variant: options.variant ?? "danger",
        onConfirm: () => {
          set({ isOpen: false, onConfirm: null, onCancel: null });
          resolve(true);
        },
        onCancel: () => {
          set({ isOpen: false, onConfirm: null, onCancel: null });
          resolve(false);
        },
      });
    }),

  close: () =>
    set((state) => {
      state.onCancel?.();
      return { isOpen: false, onConfirm: null, onCancel: null };
    }),
}));
