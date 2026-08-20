import { readdir } from "node:fs/promises";
import { join } from "node:path";

const ignoredDirectories = new Set([".git", ".next", "dist", "node_modules"]);

export async function findProjectFiles(rootDir: string): Promise<string[]> {
  const files: string[] = [];

  async function visit(directory: string): Promise<void> {
    const entries = await readdir(directory, { withFileTypes: true });

    for (const entry of entries) {
      const entryPath = join(directory, entry.name);

      if (entry.isDirectory()) {
        if (!ignoredDirectories.has(entry.name)) {
          await visit(entryPath);
        }
        continue;
      }

      if (entry.isFile()) {
        files.push(entryPath);
      }
    }
  }

  try {
    await visit(rootDir);
  } catch (error) {
    if (isNotFoundError(error)) {
      return [];
    }
    throw error;
  }

  return files.sort();
}

function isNotFoundError(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}
