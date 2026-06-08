import { Box, Text, useApp, useInput } from "ink";

export interface PressAnyKeyProps {
  /** Called with `true` if the user asked to quit, `false` to return to the TUI. */
  onResolve: (quit: boolean) => void;
}

/**
 * A one-shot "press any key to continue" prompt rendered through Ink.
 *
 * We deliberately route this through Ink rather than reading raw
 * `process.stdin` directly: after the picker unmounts and a command runs in a
 * child process with inherited stdio, manual `setRawMode`/`resume` reads no
 * longer re-engage reliably (raw mode silently fails and the event loop empties,
 * which surfaced as a "unsettled top-level await" crash). Ink owns the stdin
 * lifecycle consistently across renders, so reusing it here is robust.
 */
export function PressAnyKey({ onResolve }: PressAnyKeyProps) {
  const { exit } = useApp();

  useInput((input, key) => {
    const quit = input === "q" || input === "Q" || (key.ctrl && input === "c");
    onResolve(quit);
    exit();
  });

  return (
    <Box marginTop={1}>
      <Text dimColor> Press any key to return to the TUI… (q to quit)</Text>
    </Box>
  );
}
