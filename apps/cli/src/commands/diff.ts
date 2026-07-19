import { Command } from "commander";
import chalk from "chalk";
import { error, header, info, warning, withSpinner } from "../lib/ui.js";
import { createAPIClient } from "../lib/api.js";
import { isAuthenticated } from "../lib/config.js";
import { readProjectConfigV2, resolveProject } from "../lib/project-config.js";
import {
  notAuthenticated,
  notInitialized,
  invalidInput,
  handleError,
} from "../lib/errors.js";
import { validateEnvironment } from "../lib/validators.js";

interface DiffOptions {
  project?: string;
  values?: boolean;
  json?: boolean;
}

/**
 * Compare which variable KEYS exist between two environments. Values are
 * compared only with --values (an extra vault fetch per env); by default this
 * is a metadata-only key diff — enough to answer "what's missing in prod?".
 */
export const diffCommand = new Command("diff")
  .description("Compare variables between two environments")
  .argument("<envA>", "First environment")
  .argument("<envB>", "Second environment")
  .option("-p, --project <name-or-id>", "Linked project (defaults to active)")
  .option("--values", "Also compare values (decrypts both environments)")
  .option("--json", "Output as JSON")
  .action(async (envA: string, envB: string, options: DiffOptions) => {
    try {
      if (!isAuthenticated()) throw notAuthenticated();
      for (const env of [envA, envB]) {
        if (!validateEnvironment(env)) {
          throw invalidInput(
            `Unknown environment "${env}". Valid: development, staging, production.`
          );
        }
      }
      if (envA === envB) {
        throw invalidInput("Pick two different environments to compare.");
      }

      const config = readProjectConfigV2();
      if (!config) throw notInitialized();
      const project = resolveProject(config, options.project);
      if (!project) {
        error(`Project not found: ${options.project ?? "(active)"}`);
        process.exit(1);
      }

      const api = createAPIClient();
      // Existence ALWAYS comes from metadata (no vault decryption, no
      // value-read audit noise, and a decryption failure can't misreport a
      // key as missing). --values additionally fetches decrypted values for
      // comparison; keys that fail to decrypt land in `undecryptable` — an
      // explicit unknown, never a false "only in" or "different".
      const [metaA, metaB] = await withSpinner(
        `Comparing ${envA} vs ${envB}...`,
        () =>
          Promise.all([
            api.listVariableKeys(project.projectId, envA),
            api.listVariableKeys(project.projectId, envB),
          ])
      );
      const keysA = new Set(metaA.keys);
      const keysB = new Set(metaB.keys);
      const truncated = metaA.truncated || metaB.truncated;

      let valsA = new Map<string, string>();
      let valsB = new Map<string, string>();
      let undecryptable: string[] = [];
      if (options.values) {
        const [a, b] = await withSpinner(`Decrypting values...`, () =>
          Promise.all([
            api.listVariables(project.projectId, envA, project.organizationId),
            api.listVariables(project.projectId, envB, project.organizationId),
          ])
        );
        valsA = new Map(a.variables.map((v) => [v.key, v.value]));
        valsB = new Map(b.variables.map((v) => [v.key, v.value]));
        undecryptable = [
          ...new Set([...a.decryptionFailures, ...b.decryptionFailures]),
        ].sort();
      }

      const allKeys = [...new Set([...keysA, ...keysB])].sort();
      const unknown = new Set(undecryptable);
      const onlyA: string[] = [];
      const onlyB: string[] = [];
      const differing: string[] = [];
      const same: string[] = [];
      for (const key of allKeys) {
        const inA = keysA.has(key);
        const inB = keysB.has(key);
        if (inA && !inB) onlyA.push(key);
        else if (!inA && inB) onlyB.push(key);
        else if (unknown.has(key))
          continue; // reported separately
        else if (
          options.values &&
          valsA.has(key) &&
          valsB.has(key) &&
          valsA.get(key) !== valsB.get(key)
        )
          differing.push(key);
        else same.push(key);
      }

      if (options.json) {
        // Nothing else may touch stdout in JSON mode — the document must
        // stay parseable. Caveats travel as fields, not warnings.
        console.log(
          JSON.stringify(
            {
              envA,
              envB,
              onlyA,
              onlyB,
              differing,
              same,
              undecryptable,
              truncated,
            },
            null,
            2
          )
        );
        return;
      }

      if (truncated) {
        warning(
          "Project exceeds the 5000-variable read window — this diff may be incomplete."
        );
      }

      header(`Diff: ${chalk.bold(envA)} vs ${chalk.bold(envB)}`);
      console.log();
      printGroup(`Only in ${envA}`, onlyA, chalk.yellow);
      printGroup(`Only in ${envB}`, onlyB, chalk.cyan);
      if (options.values) {
        printGroup("Different values", differing, chalk.red);
        printGroup(
          "Could not decrypt (comparison unknown)",
          undecryptable,
          chalk.magenta
        );
      }
      if (
        onlyA.length === 0 &&
        onlyB.length === 0 &&
        differing.length === 0 &&
        undecryptable.length === 0
      ) {
        info(
          options.values
            ? "Environments are identical (keys and values)."
            : "Same keys in both environments (run with --values to compare values)."
        );
      }
    } catch (err) {
      await handleError(err);
    }
  });

function printGroup(
  title: string,
  keys: string[],
  color: (s: string) => string
): void {
  if (keys.length === 0) return;
  console.log(color(`${title} (${keys.length}):`));
  for (const key of keys) console.log(`  ${key}`);
  console.log();
}
