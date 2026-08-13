/**
 * One-shot migration from Tailwind's raw palette to the design tokens in
 * packages/ui/src/theme.css. Deleted once the migration lands.
 *
 *   bun scripts/codemod-theme-tokens.ts <dir...>          # rewrite
 *   bun scripts/codemod-theme-tokens.ts --report <dir...> # leftovers only
 *
 * Two passes:
 *   1. Collapse `light dark:variant` pairs. The apps are dark-only
 *      (`color-scheme: dark`), so the bare half never painted — drop it and
 *      unwrap the `dark:` prefix.
 *   2. Map every remaining palette class onto a semantic token.
 */

import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const NEUTRAL = ["zinc", "slate", "gray", "neutral", "stone"];
const FAMILIES: Record<string, string[]> = {
  accent: ["green", "emerald", "lime"],
  warning: ["amber", "yellow", "orange"],
  danger: ["red", "rose"],
  info: ["blue", "sky", "indigo", "cyan", "teal"],
  premium: ["purple", "violet", "fuchsia", "pink"],
};

/** Utility prefixes grouped by which token ramp they draw from. */
const INK_PREFIXES = [
  "text",
  "placeholder",
  "fill",
  "caret",
  "decoration",
  "accent",
];
const SURFACE_PREFIXES = ["bg"];
const LINE_PREFIXES = [
  // Directional borders first — the alternation is ordered, so `border-t`
  // must be offered before `border` or it never matches.
  "border-t",
  "border-b",
  "border-l",
  "border-r",
  "border-x",
  "border-y",
  "border-s",
  "border-e",
  "border",
  "divide-x",
  "divide-y",
  "divide",
  "ring-offset",
  "ring",
  "outline-offset",
  "outline",
  "stroke",
  "shadow",
  "from",
  "via",
  "to",
];

const TOKEN_NAMES = [
  "canvas",
  "surface-raised",
  "surface-hover",
  "surface",
  "chrome",
  "overlay",
  "line-strong",
  "line",
  "ink-muted",
  "ink-subtle",
  "ink-faint",
  "ink-inverse",
  "ink",
  "accent-hover",
  "accent-soft",
  "accent-line",
  "accent",
  "warning-soft",
  "warning-line",
  "warning",
  "danger-soft",
  "danger-line",
  "danger",
  "info-soft",
  "info-line",
  "info",
  "premium-soft",
  "premium-line",
  "premium",
  "chart-1",
  "chart-2",
  "chart-3",
  "chart-4",
  "chart-5",
  "white",
  "black",
  "transparent",
  "current",
];
const ALL_PREFIXES = [...INK_PREFIXES, ...SURFACE_PREFIXES, ...LINE_PREFIXES];

const INK_BY_STEP: Record<string, string> = {
  "50": "ink",
  "100": "ink",
  "200": "ink",
  "300": "ink-muted",
  "400": "ink-muted",
  "500": "ink-subtle",
  "600": "ink-faint",
  "700": "ink-faint",
  "800": "ink-inverse",
  "900": "ink-inverse",
  "950": "ink-inverse",
};

const SURFACE_BY_STEP: Record<string, string> = {
  "50": "surface-raised",
  "100": "surface-raised",
  "200": "surface-raised",
  "300": "surface-hover",
  "400": "surface-hover",
  "500": "surface-hover",
  "600": "surface-hover",
  "700": "surface-hover",
  "800": "surface-raised",
  "900": "surface",
  "950": "canvas",
};

const LINE_BY_STEP: Record<string, string> = {
  "50": "line",
  "100": "line",
  "200": "line",
  "300": "line",
  "400": "line-strong",
  "500": "line-strong",
  "600": "line-strong",
  "700": "line",
  "800": "line",
  "900": "line",
  "950": "line",
};

const PALETTES = [...NEUTRAL, ...Object.values(FAMILIES).flat()];
const CLASS_RE = new RegExp(
  String.raw`\b((?:[a-z0-9-]+:)*)(` +
    ALL_PREFIXES.join("|") +
    String.raw`)-(` +
    PALETTES.join("|") +
    String.raw`)-(\d{2,3})(\/[\d.]+|\/\[[^\]]+\])?\b`,
  "g"
);

function familyOf(palette: string): string | null {
  for (const [family, members] of Object.entries(FAMILIES)) {
    if (members.includes(palette)) return family;
  }
  return null;
}

function mapClass(
  variants: string,
  prefix: string,
  palette: string,
  step: string,
  alpha: string
): string {
  const family = familyOf(palette);

  if (family) {
    let token: string;
    if (LINE_PREFIXES.includes(prefix)) {
      token = `${family}-line`;
    } else if (SURFACE_PREFIXES.includes(prefix)) {
      token =
        alpha || Number(step) <= 200 || Number(step) >= 900
          ? `${family}-soft`
          : family;
    } else {
      token =
        Number(step) >= 600 && family === "accent" ? "accent-hover" : family;
    }
    // -soft and -line already encode alpha; keeping the suffix would double it.
    const keepAlpha = token === family ? alpha : "";
    return `${variants}${prefix}-${token}${keepAlpha}`;
  }

  let token: string | undefined;
  if (SURFACE_PREFIXES.includes(prefix)) {
    token = SURFACE_BY_STEP[step];
    if (
      token &&
      /\b(hover|focus|active|group-hover|aria-selected):/.test(variants)
    ) {
      token = "surface-hover";
    }
  } else if (LINE_PREFIXES.includes(prefix)) {
    token = LINE_BY_STEP[step];
  } else {
    token = INK_BY_STEP[step];
  }
  if (!token) return `${variants}${prefix}-${palette}-${step}${alpha}`;

  // line/ink tokens are already alpha-composed against the canvas.
  const keepAlpha = LINE_PREFIXES.includes(prefix) ? "" : alpha;
  return `${variants}${prefix}-${token}${keepAlpha}`;
}

/** Drop the light half of a `light dark:x` pair. Runs before mapping. */
function collapseDarkPairs(text: string): string {
  const prefixes = ALL_PREFIXES.join("|");
  const palettes = PALETTES.join("|");
  // \1 pins the utility, so `bg-x dark:text-y` is not treated as a pair.
  const pair = new RegExp(
    String.raw`\b(${prefixes})-(?:(?:${palettes})-\d{2,3}(?:\/[\d.]+)?|white|black|transparent)\s+(dark:\1-)`,
    "g"
  );
  let out = text;
  let previous: string;
  do {
    previous = out;
    out = out.replace(pair, "$2");
  } while (out !== previous);

  return out;
}

/**
 * Catches pairs whose variant chain sits between `dark:` and the utility.
 * Matches token names since both halves are migrated by now; that restriction
 * is what stops `text-sm` being eaten as the light half of a pair.
 */
function collapseMigratedDarkPairs(text: string): string {
  const prefixes = ALL_PREFIXES.join("|");
  const tokens = TOKEN_NAMES.join("|");
  // \1 pins the variant chain, \2 the prefix — same property only.
  const pair = new RegExp(
    String.raw`\b((?:(?!dark:)[a-z0-9-]+:)*)(${prefixes})-(?:${tokens})(?:\/[\d.]+)?\s+(dark:\1\2-(?:${tokens})(?:\/[\d.]+)?)`,
    "g"
  );

  let out = text;
  let previous: string;
  do {
    previous = out;
    out = out.replace(pair, "$3");
  } while (out !== previous);

  // Remaining `dark:` classes apply unconditionally in a dark-only app.
  return out.replace(
    new RegExp(String.raw`\bdark:((?:(?:[a-z0-9-]+:)*)(?:${prefixes})-)`, "g"),
    "$1"
  );
}

/**
 * Last-wins dedupe per property. The collapses above only fire on adjacent
 * halves; authors often wrote them apart, so both survive the unwrap and CSS
 * source order silently decides. The dark half is last and is the intended one.
 */
function dedupeClassLists(text: string): string {
  const prefixes = ALL_PREFIXES.join("|");
  const tokens = TOKEN_NAMES.join("|");
  const tokenClass = new RegExp(
    String.raw`^((?:[a-z0-9-]+:)*)(${prefixes})-(?:${tokens})(?:\/[\d.]+)?$`
  );

  // Only touch strings that already contain a migrated token class.
  const candidate = new RegExp(
    String.raw`(?:^|\s)(?:[a-z0-9-]+:)*(?:${prefixes})-(?:${tokens})(?:\/[\d.]+)?(?:\s|$)`
  );

  return text.replace(/[^\s"'`{}<>]+(?:[ \t]+[^\s"'`{}<>]+)+/g, (run) => {
    if (!candidate.test(run)) return run;

    const parts = run.split(/[ \t]+/);
    const lastIndexByKey = new Map<string, number>();
    parts.forEach((part, i) => {
      const match = part.match(tokenClass);
      if (match) lastIndexByKey.set(`${match[1]}${match[2]}`, i);
    });

    return parts
      .filter((part, i) => {
        const match = part.match(tokenClass);
        if (!match) return true;
        return lastIndexByKey.get(`${match[1]}${match[2]}`) === i;
      })
      .join(" ");
  });
}

/** Inline styles reach the palette through var(--color-zinc-500). */
function migrateColorVars(text: string): string {
  return text.replace(
    new RegExp(String.raw`--color-(${PALETTES.join("|")})-(\d{2,3})`, "g"),
    (_m, palette: string, step: string) => {
      const family = familyOf(palette);
      if (family) return `--color-${family}`;
      // Neutrals in inline styles are borders or text far more often than
      // fills; the step decides which ramp reads closest.
      const n = Number(step);
      if (n <= 300) return "--color-line";
      if (n <= 500) return "--color-ink-subtle";
      return "--color-surface";
    }
  );
}

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === ".next" || entry === "dist")
      continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(tsx|ts)$/.test(entry)) out.push(full);
  }
  return out;
}

/** Rewrite a snippet exactly as a file would be rewritten. */
function migrate(text: string): string {
  let out = collapseDarkPairs(text);
  out = out.replace(CLASS_RE, (_m, variants, prefix, palette, step, alpha) =>
    mapClass(variants, prefix, palette, step, alpha ?? "")
  );
  out = collapseMigratedDarkPairs(out);
  out = dedupeClassLists(out);
  out = migrateColorVars(out);
  return out;
}

function selftest(): void {
  const cases: [string, string][] = [
    ['"bg-zinc-900"', '"bg-surface"'],
    ['"bg-zinc-800"', '"bg-surface-raised"'],
    ['"text-zinc-500"', '"text-ink-subtle"'],
    ['"text-zinc-100"', '"text-ink"'],
    ['"border-zinc-700/50"', '"border-line"'],
    ['"divide-zinc-800"', '"divide-line"'],
    ['"hover:bg-zinc-800"', '"hover:bg-surface-hover"'],
    ['"md:hover:bg-zinc-700"', '"md:hover:bg-surface-hover"'],
    ['"text-green-400"', '"text-accent"'],
    ['"bg-green-500/10"', '"bg-accent-soft"'],
    ['"border-green-500/30"', '"border-accent-line"'],
    ['"text-amber-400"', '"text-warning"'],
    ['"text-red-400"', '"text-danger"'],
    ['"text-blue-400"', '"text-info"'],
    ['"text-purple-400"', '"text-premium"'],
    ['"text-zinc-900 dark:text-zinc-100"', '"text-ink"'],
    ['"bg-zinc-100 dark:bg-zinc-800"', '"bg-surface-raised"'],
    ['"bg-zinc-100 dark:text-zinc-100"', '"bg-surface-raised text-ink"'],
    ['"hover:bg-zinc-800 dark:hover:bg-zinc-700"', '"hover:bg-surface-hover"'],
    ['"md:text-zinc-900 dark:md:text-zinc-100"', '"md:text-ink"'],
    ['"border-t-zinc-400"', '"border-t-line-strong"'],
    ['"ring-offset-zinc-900"', '"ring-offset-line"'],
    ['"var(--color-zinc-500)"', '"var(--color-ink-subtle)"'],
    ['"var(--color-green-500)"', '"var(--color-accent)"'],
    ['"text-sm dark:text-ink"', '"text-sm text-ink"'],
    [
      '"rounded border bg-white p-2 text-zinc-900 dark:bg-zinc-800 dark:text-zinc-100"',
      '"rounded border p-2 bg-surface-raised text-ink"',
    ],
    [
      '"bg-surface hover:bg-surface-hover"',
      '"bg-surface hover:bg-surface-hover"',
    ],
    ['"text-sm font-medium"', '"text-sm font-medium"'],
    ['"variable.rotation_reminder_sent"', '"variable.rotation_reminder_sent"'],
  ];

  let failed = 0;
  for (const [input, want] of cases) {
    const got = migrate(input);
    if (got !== want) {
      console.error(`FAIL  ${input}\n  want ${want}\n  got  ${got}`);
      failed++;
    }
  }
  console.log(
    failed
      ? `selftest: ${failed}/${cases.length} failed`
      : `selftest: ${cases.length} passed`
  );
  if (failed) process.exit(1);
}

const args = process.argv.slice(2);
if (args.includes("--selftest")) {
  selftest();
  process.exit(0);
}
const reportOnly = args.includes("--report");
const dirs = args.filter((a) => !a.startsWith("--"));

let changedFiles = 0;
let changedClasses = 0;
const leftovers = new Map<string, Set<string>>();

/**
 * Deliberately NOT built from the prefix list: an earlier version reused the
 * migration regex to audit itself, so every prefix the migration didn't know
 * about (border-t, ring-offset) was invisible in the report AND unmigrated.
 * This matches any `<something>-<palette>-<step>` shape, whatever the prefix.
 */
const AUDIT_RE = new RegExp(
  String.raw`[a-z-]+-(?:${PALETTES.join("|")})-\d{2,3}(?:\/[\d.]+)?`,
  "g"
);

for (const dir of dirs) {
  for (const file of walk(dir)) {
    const original = readFileSync(file, "utf8");
    let text = original;

    if (!reportOnly) {
      const before = (original.match(AUDIT_RE) ?? []).length;
      text = migrate(original);
      changedClasses += before - (text.match(AUDIT_RE) ?? []).length;
      if (text !== original) {
        writeFileSync(file, text);
        changedFiles++;
      }
    }

    // Anything still palette-shaped after the rewrite needs a human.
    const remaining = text.match(AUDIT_RE);
    if (remaining) {
      const set = leftovers.get(file) ?? new Set<string>();
      remaining.forEach((c) => set.add(c));
      leftovers.set(file, set);
    }
  }
}

if (!reportOnly) {
  console.log(`rewrote ${changedClasses} classes across ${changedFiles} files`);
}

if (leftovers.size === 0) {
  console.log("leftover report: clean");
} else {
  let total = 0;
  console.log("\nleftover palette classes:");
  for (const [file, classes] of leftovers) {
    total += classes.size;
    console.log(`  ${file}\n    ${[...classes].sort().join(" ")}`);
  }
  console.log(`\n${total} distinct classes in ${leftovers.size} files`);
  process.exitCode = 1;
}
