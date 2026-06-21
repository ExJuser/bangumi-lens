import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";

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
    const entry = JSON.parse(await readFile(getCacheFilePath(namespace, key), "utf8")) as ServerCacheEntry<T>;
    if (!entry || typeof entry.cachedAt !== "number" || Date.now() - entry.cachedAt > maxAgeMs) return undefined;
    return entry.value;
  } catch (error) {
    const code = typeof error === "object" && error && "code" in error ? error.code : undefined;
    if (code === "ENOENT") return undefined;
    return undefined;
  }
}

export async function writeServerCache<T>(namespace: string, key: string, value: T) {
  const filePath = getCacheFilePath(namespace, key);
  await mkdir(path.dirname(filePath), { recursive: true });
  const entry: ServerCacheEntry<T> = {
    cachedAt: Date.now(),
    value
  };
  await writeFile(filePath, `${JSON.stringify(entry, null, 2)}\n`, "utf8");
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
    const code = typeof error === "object" && error && "code" in error ? error.code : undefined;
    if (code === "ENOENT") return;
    throw error;
  }

  await Promise.all(
    entries
      .filter((entry) => entry.endsWith(".json"))
      .filter((entry) => decodeURIComponent(entry.slice(0, -".json".length)).startsWith(keyPrefix))
      .map((entry) => rm(path.join(namespaceDir, entry), { force: true }))
  );
}

export async function clearServerCache() {
  await rm(CACHE_DIR, { recursive: true, force: true });
}
