import { ENVIRONMENTS } from "@/constants/project";

export const ENV_FILTERS = ["all", ...ENVIRONMENTS] as const;
export type EnvFilter = (typeof ENV_FILTERS)[number];

/**
 * The palette's own view state.
 *
 * Opening resets four of these at once, and every filter change resets the
 * selection, so they are one machine rather than four setters called in
 * sequence. It also makes the open handler depend on `dispatch`, which React
 * guarantees is stable, instead of on a function rebuilt every render.
 */
export type PaletteState = {
  isOpen: boolean;
  envFilter: EnvFilter;
  tagFilter: string[];
  selectedIndex: number;
};

export type PaletteAction =
  | { kind: "opened" }
  | { kind: "closed" }
  | { kind: "env-filter-changed"; filter: EnvFilter }
  | { kind: "tag-toggled"; tagId: string }
  | { kind: "selection-reset" }
  | { kind: "selection-moved"; delta: 1 | -1; navCount: number };

export const initialPaletteState: PaletteState = {
  isOpen: false,
  envFilter: "all",
  tagFilter: [],
  selectedIndex: 0,
};

export function paletteReducer(
  state: PaletteState,
  action: PaletteAction
): PaletteState {
  switch (action.kind) {
    case "opened":
      // A fresh palette every time, so the last search's filters do not
      // silently narrow the next one.
      return { ...initialPaletteState, isOpen: true };
    case "closed":
      return { ...state, isOpen: false };
    case "env-filter-changed":
      return { ...state, envFilter: action.filter, selectedIndex: 0 };
    case "tag-toggled":
      return {
        ...state,
        tagFilter: state.tagFilter.includes(action.tagId)
          ? state.tagFilter.filter((id) => id !== action.tagId)
          : [...state.tagFilter, action.tagId],
        selectedIndex: 0,
      };
    case "selection-reset":
      return { ...state, selectedIndex: 0 };
    case "selection-moved": {
      // Wraps at both ends, so holding an arrow key cycles the list.
      const { delta, navCount } = action;
      if (navCount <= 0) return state;
      const next =
        delta === 1
          ? state.selectedIndex < navCount - 1
            ? state.selectedIndex + 1
            : 0
          : state.selectedIndex > 0
            ? state.selectedIndex - 1
            : navCount - 1;
      return { ...state, selectedIndex: next };
    }
    default: {
      const exhaustive: never = action;
      return exhaustive;
    }
  }
}
