import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

export function getErrorCode(error: unknown) {
  return typeof error === "object" && error && "code" in error ? error.code : undefined;
}

export function isMissingFileError(error: unknown) {
  return getErrorCode(error) === "ENOENT";
}

export async function readJsonFile<T>(filePath: string): Promise<T | undefined> {
  try {
    return JSON.parse(await readFile(filePath, "utf8")) as T;
  } catch (error) {
    if (isMissingFileError(error)) return undefined;
    throw error;
  }
}

export async function writeJsonFile(filePath: string, value: unknown) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}
