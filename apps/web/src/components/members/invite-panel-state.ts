import type { OrgRole } from "@/lib/roles";
import { allEnvironments } from "./environment-scope";

/** A user surfaced by the invite drawer's email typeahead. */
export interface SearchUser {
  _id: string;
  email: string;
  name?: string;
  avatarUrl?: string;
  isMember?: boolean;
  hasPendingInvitation?: boolean;
}

/**
 * The organization invite drawer as one machine.
 *
 * Closing the drawer clears eight fields at once, picking a suggestion moves
 * the email and the typeahead together, and every submit resolves the busy
 * flag alongside the error. As separate useState calls those read as a run of
 * setters with no name on the transition, and nothing stops a later edit from
 * resetting seven of the eight and leaking the eighth into the next invite.
 *
 * The drawer's open/closed flag stays a plain useState: it is a toggle the
 * header button owns, not part of what the form resets.
 */
export type InvitePanelState = {
  email: string;
  role: OrgRole;
  projectIds: string[];
  environmentScope: string[];
  isSubmitting: boolean;
  error: string | null;
  searchResults: SearchUser[];
  isSearching: boolean;
  showSearchResults: boolean;
};

export type InvitePanelAction =
  | { kind: "form-reset" }
  | { kind: "email-changed"; email: string }
  | { kind: "role-changed"; role: InvitePanelState["role"] }
  | { kind: "project-toggled"; projectId: string; selected: boolean }
  | {
      kind: "environments-changed";
      environments: InvitePanelState["environmentScope"];
    }
  | { kind: "suggestion-selected"; email: string }
  | { kind: "submit-started" }
  | { kind: "submit-failed"; error: string }
  | { kind: "submit-settled" }
  | { kind: "search-started" }
  | { kind: "search-cleared" }
  | { kind: "search-succeeded"; results: InvitePanelState["searchResults"] }
  | { kind: "search-settled" }
  | { kind: "suggestions-shown" }
  | { kind: "suggestions-hidden" };

export const initialInvitePanelState: InvitePanelState = {
  email: "",
  role: "developer",
  projectIds: [],
  environmentScope: allEnvironments(),
  isSubmitting: false,
  error: null,
  searchResults: [],
  isSearching: false,
  showSearchResults: false,
};

export function invitePanelReducer(
  state: InvitePanelState,
  action: InvitePanelAction
): InvitePanelState {
  switch (action.kind) {
    case "form-reset":
      // Deliberately leaves isSubmitting alone: a successful invite resets the
      // form while the request is still settling, and "submit-settled" is what
      // releases the flag on both the success and the failure path.
      return { ...initialInvitePanelState, isSubmitting: state.isSubmitting };
    case "email-changed":
      return { ...state, email: action.email };
    case "role-changed":
      return { ...state, role: action.role };
    case "project-toggled":
      return {
        ...state,
        projectIds: action.selected
          ? [...state.projectIds, action.projectId]
          : state.projectIds.filter((id) => id !== action.projectId),
      };
    case "environments-changed":
      return { ...state, environmentScope: action.environments };
    case "suggestion-selected":
      return {
        ...state,
        email: action.email,
        showSearchResults: false,
        searchResults: [],
      };
    case "submit-started":
      return { ...state, isSubmitting: true, error: null };
    case "submit-failed":
      return { ...state, error: action.error };
    case "submit-settled":
      return { ...state, isSubmitting: false };
    case "search-started":
      return { ...state, isSearching: true };
    case "search-cleared":
      return { ...state, searchResults: [], showSearchResults: false };
    case "search-succeeded":
      return {
        ...state,
        searchResults: action.results,
        showSearchResults: true,
      };
    case "search-settled":
      return { ...state, isSearching: false };
    case "suggestions-shown":
      return { ...state, showSearchResults: true };
    case "suggestions-hidden":
      return { ...state, showSearchResults: false };
    default: {
      const exhaustive: never = action;
      return exhaustive;
    }
  }
}
