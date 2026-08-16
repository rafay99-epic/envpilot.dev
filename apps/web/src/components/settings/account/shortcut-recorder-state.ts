/**
 * The keyboard-shortcut recorder as one machine.
 *
 * Starting an edit, cancelling it and finishing a save each reset the same
 * five fields, and a two-key sequence moves three of them at once. Split
 * across six useState calls that is three near-identical runs of setters with
 * no name on the transition, and an edit that clears four of the five leaves
 * the row stuck mid-sequence.
 */

export type ShortcutRecorderState = {
  /** The shortcut currently being re-bound, or null when idle. */
  editingId: string | null;
  recordedKeys: string[];
  isRecordingSequence: boolean;
  sequenceStep: number;
  error: string | null;
  isSaving: boolean;
};

export type ShortcutRecorderAction =
  | { kind: "editing-started"; shortcutId: string }
  | { kind: "editing-cancelled" }
  | { kind: "sequence-started"; firstKey: string }
  | { kind: "binding-rejected"; error: string }
  | { kind: "save-started" }
  | { kind: "save-settled" };

export const initialShortcutRecorderState: ShortcutRecorderState = {
  editingId: null,
  recordedKeys: [],
  isRecordingSequence: false,
  sequenceStep: 0,
  error: null,
  isSaving: false,
};

export function shortcutRecorderReducer(
  state: ShortcutRecorderState,
  action: ShortcutRecorderAction
): ShortcutRecorderState {
  switch (action.kind) {
    case "editing-started":
      // A save in flight keeps its flag: only "save-settled" releases it.
      return {
        ...initialShortcutRecorderState,
        isSaving: state.isSaving,
        editingId: action.shortcutId,
      };
    case "editing-cancelled":
      return { ...initialShortcutRecorderState, isSaving: state.isSaving };
    case "sequence-started":
      return {
        ...state,
        isRecordingSequence: true,
        sequenceStep: 1,
        recordedKeys: [action.firstKey],
      };
    case "binding-rejected":
      return { ...state, error: action.error };
    case "save-started":
      return { ...state, isSaving: true };
    case "save-settled":
      // Both outcomes land here: the recorder closes and the flag clears.
      return initialShortcutRecorderState;
    default: {
      const exhaustive: never = action;
      return exhaustive;
    }
  }
}
