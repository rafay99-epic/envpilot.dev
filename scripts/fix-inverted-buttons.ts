/**
 * One-shot repair for inverted buttons, run once alongside the token codemod.
 *
 * The originals were `bg-zinc-100 text-zinc-900` under a dark: variant — a
 * LIGHT fill with dark text. Mapping each class independently sent the fill to
 * a dark surface token and left the text dark, which renders invisible. An
 * inverted control's fill is the ink color, so pair them that way.
 */

import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (["node_modules", ".next", "dist"].includes(entry)) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.tsx?$/.test(entry)) out.push(full);
  }
  return out;
}

const DARK_FILL =
  /\b(hover:|focus:|active:|group-hover:)?bg-(surface-raised|surface-hover|surface|canvas|chrome)\b/g;

let changed = 0;
let files = 0;

for (const dir of ["apps/web/src", "apps/admin/src", "packages/ui/src"]) {
  for (const file of walk(dir)) {
    const original = readFileSync(file, "utf8");

    const next = original.replace(
      /class(?:Name)?=(?:"([^"]*)"|\{`([^`]*)`\})/g,
      (match, dq: string | undefined, tl: string | undefined) => {
        const body = dq ?? tl ?? "";
        if (!/\btext-ink-inverse\b/.test(body)) return match;

        const fixed = body
          .replace(DARK_FILL, (_m, variant = "") =>
            variant ? `${variant}bg-ink-muted` : "bg-ink"
          )
          .replace(/\bhover:bg-white\b/g, "hover:bg-ink-muted");

        if (fixed === body) return match;
        changed++;
        return dq !== undefined
          ? `${match.slice(0, match.indexOf('"'))}"${fixed}"`
          : match.replace(tl!, fixed);
      }
    );

    if (next !== original) {
      writeFileSync(file, next);
      files++;
    }
  }
}

console.log(`repaired ${changed} inverted controls across ${files} files`);
