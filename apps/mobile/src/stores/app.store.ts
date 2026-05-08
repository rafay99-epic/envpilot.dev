import { create } from "zustand";
import * as storage from "@/lib/secure-storage";
import type { Id } from "convex/_generated/dataModel";

interface AppState {
  activeOrgId: Id<"organizations"> | null;
  activeProjectId: Id<"projects"> | null;

  setActiveOrg: (orgId: Id<"organizations">) => Promise<void>;
  setActiveProject: (projectId: Id<"projects"> | null) => void;
  hydrateOrg: () => Promise<void>;
}

export const useAppStore = create<AppState>((set) => ({
  activeOrgId: null,
  activeProjectId: null,

  setActiveOrg: async (orgId) => {
    await storage.setActiveOrgId(orgId);
    set({ activeOrgId: orgId, activeProjectId: null });
  },

  setActiveProject: (projectId) => {
    set({ activeProjectId: projectId });
  },

  hydrateOrg: async () => {
    const orgId = await storage.getActiveOrgId();
    if (orgId) {
      set({ activeOrgId: orgId as Id<"organizations"> });
    }
  },
}));
