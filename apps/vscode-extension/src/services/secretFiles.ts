import {
  assertSafeSecretFilePath,
  ignoreSecretFilePaths,
  localDigest,
  modeMatches,
  numericMode,
  resolveInsideRoot,
  statusOf,
  writeSecretFile,
  type FileStatus,
} from "@envpilot/secret-files";
import { chmodSync, existsSync, readFileSync } from "node:fs";
import type { ApiService, SecretFileRow } from "./api";

export {
  ignoreSecretFilePaths,
  localDigest,
  modeMatches,
  resolveInsideRoot,
  statusOf,
  type FileStatus,
};

export interface WrittenSecretFile {
  path: string;
  absolutePath: string;
  mode: string;
  numericMode: number;
}

export interface MaterialiseResult {
  written: string[];
  unchanged: string[];
  conflicts: string[];
  failed: Array<{ path: string; message: string }>;
}

export async function materialiseSecretFiles(
  api: ApiService,
  projectId: string,
  environment: string,
  root: string,
  options: {
    force?: boolean;
    forcePaths?: string[];
    onWritten?: (file: WrittenSecretFile, contents: Buffer) => Promise<void>;
    setSyncing?: (syncing: boolean) => void;
  } = {}
): Promise<MaterialiseResult> {
  const result: MaterialiseResult = {
    written: [],
    unchanged: [],
    conflicts: [],
    failed: [],
  };

  const files: SecretFileRow[] = [];
  for (const file of await api.listSecretFiles(projectId, environment)) {
    try {
      assertSafeSecretFilePath(file.path);
      files.push(file);
    } catch (error) {
      result.failed.push({
        path: file.path,
        message: error instanceof Error ? error.message : "Unsafe path",
      });
    }
  }
  if (files.length === 0) return result;

  const pending: SecretFileRow[] = [];
  const alreadyPresent: SecretFileRow[] = [];

  for (const file of files) {
    const status = await statusOf(file, root);
    if (status === "in-sync") {
      if (!modeMatches(root, file.path, file.mode)) {
        try {
          chmodSync(resolveInsideRoot(root, file.path), numericMode(file.mode));
        } catch {}
      }
      result.unchanged.push(file.path);
      alreadyPresent.push(file);
    } else if (
      status === "modified" &&
      !(
        options.force &&
        (options.forcePaths === undefined ||
          options.forcePaths.includes(file.path))
      )
    ) {
      result.conflicts.push(file.path);
      alreadyPresent.push(file);
    } else {
      pending.push(file);
    }
  }

  for (const file of alreadyPresent) {
    if (!options.onWritten) break;
    try {
      const absolutePath = resolveInsideRoot(root, file.path);
      if (!existsSync(absolutePath)) continue;
      await options.onWritten(
        {
          path: file.path,
          absolutePath,
          mode: file.mode,
          numericMode: numericMode(file.mode),
        },
        readFileSync(absolutePath)
      );
    } catch {}
  }

  ignoreSecretFilePaths(
    root,
    files.map((f) => f.path)
  );

  if (pending.length === 0) return result;

  options.setSyncing?.(true);
  try {
    for (const file of pending) {
      try {
        const content = await api.getSecretFileContent(file._id);
        assertSafeSecretFilePath(content.path);
        const bytes = Buffer.from(content.content, "base64");
        const absolutePath = await writeSecretFile(
          root,
          content.path,
          bytes,
          content.mode
        );
        const written: WrittenSecretFile = {
          path: content.path,
          absolutePath,
          mode: content.mode,
          numericMode: numericMode(content.mode),
        };
        result.written.push(content.path);
        await options.onWritten?.(written, bytes);
      } catch (error) {
        result.failed.push({
          path: file.path,
          message: error instanceof Error ? error.message : "Unknown error",
        });
      }
    }
  } finally {
    options.setSyncing?.(false);
  }

  return result;
}
