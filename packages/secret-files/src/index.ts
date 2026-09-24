import { createHash } from "node:crypto";
import { randomBytes } from "node:crypto";
import {
  appendFileSync,
  chmodSync,
  constants as fsConstants,
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  renameSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { open as openFile, readFile, unlink } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";

export type FileStatus = "in-sync" | "modified" | "missing";

export interface SecretFileDigestRow {
  path: string;
  sha256: string;
  digestSalt: string;
}

export class UnsafePathError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UnsafePathError";
  }
}

const FORBIDDEN_SEGMENTS = new Set([
  ".git",
  ".husky",
  ".idea",
  ".vscode",
  ".envpilot",
]);

export function assertSafeSecretFilePath(filePath: string): void {
  if (isAbsolute(filePath) || /^([a-zA-Z]:|[\\/~])/.test(filePath)) {
    throw new UnsafePathError(`Refusing an absolute path: ${filePath}`);
  }
  const segments = filePath
    .toLowerCase()
    .split(/[\\/]/)
    .filter((segment) => segment !== "" && segment !== ".");
  if (segments.length === 0 || segments.includes("..")) {
    throw new UnsafePathError(`Refusing an unsafe path: ${filePath}`);
  }
  const reserved = segments.find((segment) => FORBIDDEN_SEGMENTS.has(segment));
  if (reserved) {
    throw new UnsafePathError(
      `Refusing to write inside "${reserved}": ${filePath}`
    );
  }
  const baseName = segments[segments.length - 1];
  if (
    segments.join("/") === ".gitignore" ||
    baseName.endsWith(".env") ||
    baseName.startsWith(".env.")
  ) {
    throw new UnsafePathError(`Refusing a reserved file: ${filePath}`);
  }
}

export function localDigest(
  contents: Buffer,
  digestSaltBase64: string
): string {
  const salt = Buffer.from(digestSaltBase64, "base64");
  return createHash("sha256")
    .update(Buffer.concat([salt, contents]))
    .digest("base64");
}

export function resolveInsideRoot(root: string, filePath: string): string {
  if (isAbsolute(filePath)) {
    throw new UnsafePathError(
      `Refusing to write an absolute path: ${filePath}`
    );
  }
  const absoluteRoot = realpathSync.native(resolve(root));
  const destination = resolve(absoluteRoot, filePath);

  if (!isContained(absoluteRoot, destination)) {
    throw new UnsafePathError(
      `Refusing to write outside the project directory: ${filePath}`
    );
  }

  let ancestor = dirname(destination);
  while (!existsSync(ancestor) && isContained(absoluteRoot, ancestor)) {
    ancestor = dirname(ancestor);
  }
  if (existsSync(ancestor)) {
    const realAncestor = realpathSync.native(ancestor);
    if (
      realAncestor !== absoluteRoot &&
      !isContained(absoluteRoot, realAncestor)
    ) {
      throw new UnsafePathError(
        `Refusing to write through a symlink that escapes the project: ${filePath}`
      );
    }
  }

  try {
    if (lstatSync(destination).isSymbolicLink()) {
      throw new UnsafePathError(
        `Refusing to write through a symlink: ${filePath}`
      );
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }

  return destination;
}

function isContained(absoluteRoot: string, candidate: string): boolean {
  const rel = relative(absoluteRoot, candidate);
  return rel !== "" && !rel.startsWith("..") && !isAbsolute(rel);
}

export function numericMode(mode: string): number {
  return mode === "0400" ? 0o400 : 0o600;
}

export function modeMatches(
  root: string,
  filePath: string,
  mode: string
): boolean {
  try {
    const destination = resolveInsideRoot(root, filePath);
    if (!existsSync(destination)) return true;
    return (statSync(destination).mode & 0o777) === numericMode(mode);
  } catch {
    return true;
  }
}

export function applyMode(root: string, filePath: string, mode: string): void {
  chmodSync(resolveInsideRoot(root, filePath), numericMode(mode));
}

export async function statusOf(
  file: SecretFileDigestRow,
  root: string
): Promise<FileStatus> {
  let destination: string;
  try {
    destination = resolveInsideRoot(root, file.path);
  } catch (error) {
    return error instanceof UnsafePathError ? "modified" : "missing";
  }

  let stats;
  try {
    stats = lstatSync(destination);
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "ENOENT"
      ? "missing"
      : "modified";
  }
  if (!stats.isFile()) return "modified";

  try {
    const local = await readFile(destination);
    return localDigest(local, file.digestSalt) === file.sha256
      ? "in-sync"
      : "modified";
  } catch {
    return "modified";
  }
}

function mkdirNoFollow(absoluteRoot: string, destination: string): string {
  const dir = dirname(destination);
  const rel = relative(absoluteRoot, dir);
  if (rel === "") return dir;

  let current = absoluteRoot;
  for (const segment of rel.split(sep)) {
    current = join(current, segment);
    try {
      mkdirSync(current);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    }
    const stats = lstatSync(current);
    if (stats.isSymbolicLink() || !stats.isDirectory()) {
      throw new UnsafePathError(
        `Refusing to write through "${relative(absoluteRoot, current)}" — it is not a real directory`
      );
    }
  }
  return dir;
}

export async function writeSecretFile(
  root: string,
  filePath: string,
  contents: Buffer,
  mode: string
): Promise<string> {
  const absoluteRoot = realpathSync.native(resolve(root));
  const destination = resolveInsideRoot(absoluteRoot, filePath);
  const dir = mkdirNoFollow(absoluteRoot, destination);

  const realDir = realpathSync.native(dir);
  if (realDir !== absoluteRoot && !isContained(absoluteRoot, realDir)) {
    throw new UnsafePathError(
      `Refusing to write through a symlink that escapes the project: ${filePath}`
    );
  }

  const target = numericMode(mode);
  const temp = `${destination}.envpilot-${process.pid}-${randomBytes(8).toString("hex")}.tmp`;
  try {
    const handle = await openFile(
      temp,
      fsConstants.O_WRONLY |
        fsConstants.O_CREAT |
        fsConstants.O_EXCL |
        fsConstants.O_NOFOLLOW,
      0o600
    );
    try {
      await handle.writeFile(contents);
      await handle.chmod(target);
    } finally {
      await handle.close();
    }
    renameSync(temp, destination);
  } catch (error) {
    if (existsSync(temp)) {
      try {
        await unlink(temp);
      } catch {}
    }
    throw error;
  }
  chmodSync(destination, target);
  return destination;
}

export function ignoreSecretFilePaths(root: string, paths: string[]): string[] {
  const gitignorePath = join(root, ".gitignore");

  let content = "";
  let exists = false;
  try {
    const stats = lstatSync(gitignorePath);
    if (stats.isSymbolicLink() || !stats.isFile()) {
      throw new UnsafePathError(
        ".gitignore is not a regular file — refusing to modify it"
      );
    }
    exists = true;
    content = readFileSync(gitignorePath, "utf-8");
  } catch (error) {
    if (error instanceof UnsafePathError) throw error;
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }

  const TEMP_PATTERN = "*.envpilot-*.tmp";
  const existing = new Set(
    content.split("\n").map((line) => line.trim().replace(/^\/+/, ""))
  );
  const wanted = [...paths.map((p) => p.split(sep).join("/")), TEMP_PATTERN];
  const missing = wanted.filter((p) => !existing.has(p));
  if (missing.length === 0) return [];

  const HEADER = "# Envpilot secret files";
  const needsHeader = !content.includes(HEADER);
  const leadingNewline = content.endsWith("\n") || content === "" ? "" : "\n";
  const block =
    leadingNewline +
    (needsHeader ? `\n${HEADER}\n` : "") +
    `${missing.join("\n")}\n`;

  if (!exists) {
    try {
      writeFileSync(gitignorePath, block, { flag: "wx" });
      return missing;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      return ignoreSecretFilePaths(root, paths);
    }
  }

  appendFileSync(gitignorePath, block, "utf-8");
  return missing;
}
