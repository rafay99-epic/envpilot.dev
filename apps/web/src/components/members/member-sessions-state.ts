/**
 * The per-member sessions panel as one machine.
 *
 * Expanding a row sets the target, blanks the previous member's sessions and
 * raises the spinner in one go; collapsing clears both. Split across four
 * useState calls, an edit that forgets one leaves the panel showing the last
 * member's tokens under the new member's name, which is a disclosure bug
 * rather than a cosmetic one.
 */

export type MemberSessions = {
  cliTokens: Array<{
    _id: string;
    deviceName: string;
    lastUsedAt?: number;
    createdAt: number;
    expiresAt: number;
    tokenPreview: string;
  }>;
  extensionSessions: Array<{
    _id: string;
    projectId: string;
    projectName: string;
    deviceName: string;
    lastUsedAt?: number;
    createdAt: number;
    expiresAt: number;
    tokenPreview: string;
  }>;
};

export type MemberSessionsState = {
  expandedUserId: string | null;
  data: MemberSessions | null;
  isLoading: boolean;
  isRevoking: boolean;
};

export type MemberSessionsAction =
  | { kind: "panel-collapsed" }
  | { kind: "panel-expanded"; userId: string }
  | { kind: "sessions-loaded"; sessions: MemberSessionsState["data"] }
  | { kind: "reload-started" }
  | { kind: "load-settled" }
  | { kind: "revoke-started" }
  | { kind: "revoke-settled" };

export const initialMemberSessionsState: MemberSessionsState = {
  expandedUserId: null,
  data: null,
  isLoading: false,
  isRevoking: false,
};

export function memberSessionsReducer(
  state: MemberSessionsState,
  action: MemberSessionsAction
): MemberSessionsState {
  switch (action.kind) {
    case "panel-collapsed":
      return { ...state, expandedUserId: null, data: null };
    case "panel-expanded":
      return {
        ...state,
        expandedUserId: action.userId,
        data: null,
        isLoading: true,
      };
    case "sessions-loaded":
      return { ...state, data: action.sessions };
    case "reload-started":
      return { ...state, isLoading: true };
    case "load-settled":
      return { ...state, isLoading: false };
    case "revoke-started":
      return { ...state, isRevoking: true };
    case "revoke-settled":
      return { ...state, isRevoking: false };
    default: {
      const exhaustive: never = action;
      return exhaustive;
    }
  }
}
