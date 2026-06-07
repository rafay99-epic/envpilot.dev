import { create } from "zustand";
import * as storage from "@/lib/secure-storage";
import type { Id } from "convex/_generated/dataModel";

interface AuthState {
  isAuthenticated: boolean;
  isHydrated: boolean;
  userId: Id<"users"> | null;
  userEmail: string | null;
  userName: string | null;

  hydrate: () => Promise<void>;
  setAuth: (user: {
    id: string;
    email: string;
    name?: string;
  }) => Promise<void>;
  clearAuth: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  isAuthenticated: false,
  isHydrated: false,
  userId: null,
  userEmail: null,
  userName: null,

  hydrate: async () => {
    const [token, user] = await Promise.all([
      storage.getAccessToken(),
      storage.getUser(),
    ]);
    if (token && user) {
      set({
        isAuthenticated: true,
        isHydrated: true,
        userId: user.id as Id<"users">,
        userEmail: user.email,
        userName: user.name ?? null,
      });
    } else {
      set({ isHydrated: true });
    }
  },

  setAuth: async (user) => {
    await storage.setUser(user);
    set({
      isAuthenticated: true,
      isHydrated: true,
      userId: user.id as Id<"users">,
      userEmail: user.email,
      userName: user.name ?? null,
    });
  },

  clearAuth: async () => {
    await storage.clearAll();
    set({
      isAuthenticated: false,
      userId: null,
      userEmail: null,
      userName: null,
    });
  },
}));
