export async function openTUI(): Promise<void> {
  const [{ render }, { CLIApp }] = await Promise.all([
    import("ink"),
    import("./app.js"),
  ]);
  const app = render(<CLIApp />);
  await app.waitUntilExit();
}
