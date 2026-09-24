import { ConvexError } from "convex/values";
import type { QueryCtx } from "../../_generated/server";
import type { Id } from "../../_generated/dataModel";
import { MAX_PROJECT_FILES } from "../../lib/fileLimits";

const MAX_PATH_LENGTH = 400;
export const MAX_FILE_NAME_LENGTH = 120;

export const ALLOWED_FILE_MODES = ["0600", "0400"] as const;
export type FileMode = (typeof ALLOWED_FILE_MODES)[number];
export const DEFAULT_FILE_MODE: FileMode = "0600";

const FORBIDDEN_SEGMENTS = new Set([
  ".git",
  ".husky",
  ".idea",
  ".vscode",
  ".envpilot",
]);

export function normalizeFilePath(rawPath: string): string {
  const path = rawPath.trim();

  if (path.length === 0) {
    throw new ConvexError("A file path is required");
  }
  if (path.length > MAX_PATH_LENGTH) {
    throw new ConvexError(
      `File path is too long (max ${MAX_PATH_LENGTH} characters)`
    );
  }
  if (path.includes("\0")) {
    throw new ConvexError("File path contains an invalid character");
  }
  if (path.includes("\\")) {
    throw new ConvexError(
      "File path must use forward slashes and stay relative to the project root"
    );
  }
  if (path.startsWith("/") || path.startsWith("~")) {
    throw new ConvexError(
      "File path must be relative to the project root (no leading / or ~)"
    );
  }
  if (/^[a-zA-Z]:/.test(path)) {
    throw new ConvexError(
      "File path must be relative to the project root (no drive letter)"
    );
  }

  const segments: string[] = [];
  for (const segment of path.split("/")) {
    if (/[ .]$/.test(segment) && segment !== "." && segment !== "..") {
      throw new ConvexError(
        "File path segments must not end in a space or a period. Windows silently strips them, which changes where the file lands"
      );
    }
    if (segment === "" || segment === ".") continue;
    if (segment === "..") {
      throw new ConvexError(
        'File path must not contain "..". It must stay inside the project root'
      );
    }
    segments.push(segment);
  }

  if (segments.length === 0) {
    throw new ConvexError("A file path is required");
  }

  const normalized = segments.join("/");
  const folded = normalized.toLowerCase();

  if (folded === ".gitignore") {
    throw new ConvexError(
      `"${normalized}" is reserved and cannot be used as a secret file path`
    );
  }
  const foldedSegments = folded.split("/");
  const reserved = foldedSegments.find((segment) =>
    FORBIDDEN_SEGMENTS.has(segment)
  );
  if (reserved) {
    throw new ConvexError(
      `Secret files cannot be written inside "${reserved}"`
    );
  }
  const baseName = foldedSegments[foldedSegments.length - 1];
  if (baseName.endsWith(".env") || baseName.startsWith(".env.")) {
    throw new ConvexError(
      `"${normalized}" looks like an env file. Store its values as variables instead of a secret file`
    );
  }

  return normalized;
}

export function normalizeFileMode(mode: string | undefined): FileMode {
  if (mode === undefined) return DEFAULT_FILE_MODE;
  const trimmed = mode.trim();
  if (!(ALLOWED_FILE_MODES as readonly string[]).includes(trimmed)) {
    throw new ConvexError(
      `File mode must be one of: ${ALLOWED_FILE_MODES.join(", ")}`
    );
  }
  return trimmed as FileMode;
}

export function normalizeFileName(rawName: string): string {
  const name = rawName.trim();
  if (name.length === 0) {
    throw new ConvexError("A file name is required");
  }
  if (name.length > MAX_FILE_NAME_LENGTH) {
    throw new ConvexError(
      `File name is too long (max ${MAX_FILE_NAME_LENGTH} characters)`
    );
  }
  return name;
}

export async function findFilePathConflicts(
  ctx: QueryCtx,
  args: {
    projectId: Id<"projects">;
    path: string;
    environments: string[];
    excludeFileId?: Id<"projectFiles">;
  }
): Promise<string[]> {
  if (args.environments.length === 0) {
    throw new ConvexError("At least one environment is required");
  }

  const samePath = await ctx.db
    .query("projectFiles")
    .withIndex("by_project_and_path", (q) =>
      q.eq("projectId", args.projectId).eq("path", args.path)
    )
    .collect();

  const clashes = new Set<string>();
  for (const existing of samePath) {
    if (existing.deletedAt) continue;
    if (args.excludeFileId && existing._id === args.excludeFileId) continue;
    for (const env of existing.environments) {
      if (args.environments.includes(env)) clashes.add(env);
    }
  }

  const foldedTarget = args.path.toLowerCase();
  const activeInProject = await ctx.db
    .query("projectFiles")
    .withIndex("by_project_deleted", (q) =>
      q.eq("projectId", args.projectId).eq("deletedAt", undefined)
    )
    .take(MAX_PROJECT_FILES + 1);
  if (activeInProject.length > MAX_PROJECT_FILES) {
    throw new ConvexError(
      `Project has more than ${MAX_PROJECT_FILES} secret files. Refusing to write without a complete collision check. Contact support to raise the limit.`
    );
  }
  for (const existing of activeInProject) {
    if (args.excludeFileId && existing._id === args.excludeFileId) continue;
    if (existing.path === args.path) continue;
    if (existing.path.toLowerCase() !== foldedTarget) continue;
    for (const env of existing.environments) {
      if (args.environments.includes(env)) clashes.add(env);
    }
  }

  return [...clashes];
}

export function filePathConflictMessage(
  path: string,
  clashes: string[]
): string {
  return `A secret file already exists at "${path}" in environment(s): ${clashes.join(
    ", "
  )}. The same path is allowed only across non-overlapping environments.`;
}
