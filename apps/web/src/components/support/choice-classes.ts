// Segmented control: selected and resting branches must differ on ring, not just fill.
export const CHOICE_CLASSES = (selected: boolean) =>
  `flex items-center gap-2 rounded-md px-3 py-2.5 font-sans text-[14px] ring-1 transition-colors ${
    selected
      ? "bg-accent-soft text-accent ring-accent-line"
      : "text-ink-muted ring-line hover:text-ink hover:ring-line-strong"
  }`;
