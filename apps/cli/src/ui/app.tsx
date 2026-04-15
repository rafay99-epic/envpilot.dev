import React, {
  startTransition,
  useDeferredValue,
  useEffect,
  useMemo,
  useState,
} from "react";
import { Box, Text, useApp, useInput } from "ink";
import {
  formatArgv,
  getTopLevelCommandCatalog,
  type CLICommandDefinition,
} from "../lib/command-catalog.js";
import { executeCommand } from "./execute-command.js";
import { isAuthenticated, getUser, getApiUrl } from "../lib/config.js";

function matchesQuery(command: CLICommandDefinition, query: string): boolean {
  if (!query.trim()) {
    return true;
  }

  const normalized = query.trim().toLowerCase();
  return [
    command.title,
    command.description,
    formatArgv(command.argv),
    ...(command.aliases ?? []).map((alias) => formatArgv(alias)),
    command.args,
    command.category,
    ...command.examples.map((example) => formatArgv(example)),
    ...command.notes,
    ...command.keywords,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase()
    .includes(normalized);
}

function useCommandSearch() {
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const catalog = useMemo(() => getTopLevelCommandCatalog(), []);
  const commands = useMemo(
    () => catalog.filter((command) => matchesQuery(command, deferredQuery)),
    [catalog, deferredQuery]
  );

  return {
    query,
    commands,
    updateQuery(nextValue: string) {
      startTransition(() => {
        setQuery(nextValue);
      });
    },
  };
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <Box flexDirection="column" marginBottom={1}>
      <Text color="greenBright">{title}</Text>
      {children}
    </Box>
  );
}

export function CLIApp() {
  const { exit } = useApp();
  const { query, commands, updateQuery } = useCommandSearch();
  const catalog = useMemo(() => getTopLevelCommandCatalog(), []);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [isRunning, setIsRunning] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  useEffect(() => {
    if (selectedIndex >= commands.length) {
      setSelectedIndex(Math.max(commands.length - 1, 0));
    }
  }, [commands.length, selectedIndex]);

  const selectedCommand = commands[selectedIndex] ?? catalog[0];
  const user = getUser();

  useInput((input, key) => {
    if (isRunning) {
      return;
    }

    if (key.escape) {
      exit();
      return;
    }

    if (key.return && selectedCommand) {
      setIsRunning(true);
      setStatusMessage(`Running ${formatArgv(selectedCommand.argv)} ...`);
      executeCommand(selectedCommand.argv)
        .then((code) => {
          process.exitCode = code;
          exit();
        })
        .catch((error: unknown) => {
          const message =
            error instanceof Error ? error.message : String(error);
          setStatusMessage(message);
          setIsRunning(false);
        });
      return;
    }

    if (key.upArrow) {
      setSelectedIndex((current) =>
        current === 0 ? commands.length - 1 : current - 1
      );
      return;
    }

    if (key.downArrow) {
      setSelectedIndex((current) =>
        current >= commands.length - 1 ? 0 : current + 1
      );
      return;
    }

    if (key.backspace || key.delete) {
      updateQuery(query.slice(0, -1));
      return;
    }

    if (key.ctrl && input === "u") {
      updateQuery("");
      return;
    }

    if (!key.ctrl && !key.meta && input) {
      updateQuery(query + input);
    }
  });

  return (
    <Box flexDirection="column" padding={1}>
      <Box
        borderStyle="round"
        borderColor="green"
        paddingX={1}
        paddingY={1}
        flexDirection="column"
      >
        <Text color="greenBright">Envpilot CLI</Text>
        <Text color="gray">
          Website-aligned terminal UI for auth, projects, variables, and usage.
        </Text>
        <Box marginTop={1} flexDirection="column">
          <Text>
            <Text color="gray">API </Text>
            <Text color="cyan">{getApiUrl()}</Text>
          </Text>
          <Text>
            <Text color="gray">Auth </Text>
            <Text color={isAuthenticated() ? "green" : "yellow"}>
              {isAuthenticated()
                ? `Signed in${user?.email ? ` as ${user.email}` : ""}`
                : "Not signed in"}
            </Text>
          </Text>
        </Box>
      </Box>

      <Box marginTop={1}>
        <Text color="gray">Search </Text>
        <Text color="white">{query || "type to filter commands"}</Text>
      </Box>

      <Box marginTop={1}>
        <Box
          width="45%"
          borderStyle="round"
          borderColor="gray"
          flexDirection="column"
          paddingX={1}
          paddingY={1}
          marginRight={1}
        >
          <Text color="greenBright">Commands</Text>
          <Text color="gray">
            ↑/↓ move, Enter run, Esc exit, Ctrl+U clear
          </Text>
          <Box flexDirection="column" marginTop={1}>
            {commands.length === 0 ? (
              <Text color="yellow">No commands match the current search.</Text>
            ) : (
              commands.map((command, index) => {
                const active = index === selectedIndex;
                return (
                  <Box key={command.id}>
                    <Text color={active ? "black" : "gray"}>
                      {active ? "› " : "  "}
                    </Text>
                    <Text
                      backgroundColor={active ? "green" : undefined}
                      color={active ? "black" : "white"}
                    >
                      {formatArgv(command.argv)}
                    </Text>
                  </Box>
                );
              })
            )}
          </Box>
        </Box>

        <Box
          width="55%"
          borderStyle="round"
          borderColor="gray"
          flexDirection="column"
          paddingX={1}
          paddingY={1}
        >
          <Text color="greenBright">{selectedCommand.title}</Text>
          <Text color="gray">{selectedCommand.category}</Text>
          <Box marginTop={1} flexDirection="column">
            <Text>{selectedCommand.description}</Text>
            {selectedCommand.args ? (
              <Text color="gray">{selectedCommand.args}</Text>
            ) : null}
          </Box>

          <Section title="Website alignment">
            <Text>{selectedCommand.websiteSurface}</Text>
          </Section>

          <Section title="Examples">
            {selectedCommand.examples.map((example) => (
              <Text key={formatArgv(example)} color="cyan">
                {formatArgv(example)}
              </Text>
            ))}
          </Section>

          <Section title="Notes">
            {selectedCommand.notes.map((note) => (
              <Text key={note} color="gray">
                • {note}
              </Text>
            ))}
          </Section>
        </Box>
      </Box>

      {statusMessage ? (
        <Box marginTop={1}>
          <Text color={isRunning ? "cyan" : "red"}>{statusMessage}</Text>
        </Box>
      ) : null}
    </Box>
  );
}
