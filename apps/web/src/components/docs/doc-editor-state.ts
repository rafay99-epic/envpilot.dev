/**
 * The doc detail page's editor state as one machine.
 *
 * Every transition here touches several fields at once: beginning an edit
 * seeds both drafts and clears the last result, and finishing a request
 * always resolves the busy flag along with the message. As separate useState
 * calls that read as five setters in a row with no name on the transition,
 * and nothing stops a later edit from updating four of them.
 */

export type DocEditorState = {
  isEditing: boolean;
  draftTitle: string;
  draftBody: string;
  warnings: string[];
  error: string | null;
  notice: string | null;
  isBusy: boolean;
};

export type DocEditorAction =
  | { kind: "edit-started"; title: string; body: string }
  | { kind: "edit-cancelled" }
  | { kind: "title-changed"; title: string }
  | { kind: "body-changed"; body: string }
  | { kind: "request-started" }
  | { kind: "saved"; warnings: string[]; notice: string }
  | { kind: "request-succeeded"; notice: string }
  | { kind: "request-failed"; error: string };

export const initialDocEditorState: DocEditorState = {
  isEditing: false,
  draftTitle: "",
  draftBody: "",
  warnings: [],
  error: null,
  notice: null,
  isBusy: false,
};

export function docEditorReducer(
  state: DocEditorState,
  action: DocEditorAction
): DocEditorState {
  switch (action.kind) {
    case "edit-started":
      return {
        ...state,
        isEditing: true,
        draftTitle: action.title,
        draftBody: action.body,
        warnings: [],
        error: null,
      };
    case "edit-cancelled":
      return { ...state, isEditing: false };
    case "title-changed":
      return { ...state, draftTitle: action.title };
    case "body-changed":
      return { ...state, draftBody: action.body };
    case "request-started":
      return { ...state, isBusy: true, error: null, notice: null };
    case "saved":
      return {
        ...state,
        isBusy: false,
        isEditing: false,
        warnings: action.warnings,
        notice: action.notice,
      };
    case "request-succeeded":
      return { ...state, isBusy: false, notice: action.notice };
    case "request-failed":
      return { ...state, isBusy: false, error: action.error };
    default: {
      const exhaustive: never = action;
      return exhaustive;
    }
  }
}
