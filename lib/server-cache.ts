import { readdir, rm } from "node:fs/promises";
import path from "node:path";
import { isMissingFileError, readJsonFile, writeJsonFile } from "@/lib/fs-json";

type ServerCacheEntry<T> = {
  cachedAt: number;
  value: T;
};

const CACHE_DIR = path.join(process.cwd(), "data", "cache");

function getCacheFilePath(namespace: string, key: string) {
  return path.join(CACHE_DIR, namespace, `${encodeURIComponent(key)}.json`);
}

export async function readServerCache<T>(namespace: string, key: string, maxAgeMs: number): Promise<T | undefined> {
  try {
    const entry = await readJsonFile<ServerCacheEntry<T>>(getCacheFilePath(namespace, key));
    if (!entry || typeof entry.cachedAt !== "number" || Date.now() - entry.cachedAt > maxAgeMs) return undefined;
    return entry.value;
  } catch {
    return undefined;
  }
}

export async function writeServerCache<T>(namespace: string, key: string, value: T) {
  const entry: ServerCacheEntry<T> = {
    cachedAt: Date.now(),
    value
  };
  await writeJsonFile(getCacheFilePath(namespace, key), entry);
}

export async function deleteServerCache(namespace: string, key: string) {
  await rm(getCacheFilePath(namespace, key), { force: true });
}

export async function deleteServerCacheByKeyPrefix(namespace: string, keyPrefix: string) {
  const namespaceDir = path.join(CACHE_DIR, namespace);
  let entries: string[];

  try {
    entries = await readdir(namespaceDir);
  } catch (error) {
    if (isMissingFileError(error)) return;
    throw error;
  }

  const deletions: Promise<void>[] = [];

  for (const entry of entries) {
    if (!entry.endsWith(".json")) continue;

    try {
      if (decodeURIComponent(entry.slice(0, -".json".length)).startsWith(keyPrefix)) {
        deletions.push(rm(path.join(namespaceDir, entry), { force: true }));
      }
    } catch {
      // Ignore malformed encoded filenames; cache cleanup should be best-effort.
    }
  }

  await Promise.all(deletions);
}

export async function clearServerCache() {
  await rm(CACHE_DIR, { recursive: true, force: true });
}
