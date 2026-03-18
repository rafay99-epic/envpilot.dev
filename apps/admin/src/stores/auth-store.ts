import { create } from "zustand";

interface AuthState {
  secret: string | null;
  isAuthenticated: boolean;
  login: (secret: string) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  secret: null,
  isAuthenticated: false,
  login: (secret: string) => set({ secret, isAuthenticated: true }),
  logout: () => set({ secret: null, isAuthenticated: false }),
}));
