import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { APP_LOG_FILE } from "@/lib/logger";
import { readHistoryIndex } from "@/lib/history-store";

export type HealthStatus = {
  reports: {
    count: number;
  };
  cache: {
    fileCount: number;
    totalBytes: number;
  };
  logs: {
    recentErrors: HealthLogEntry[];
  };
  config: {
    modelApiKeyConfigured: boolean;
    bangumiAccessTokenConfigured: boolean;
    proxyConfigured: boolean;
    model: string;
    baseUrl: string;
  };
};

export type HealthLogEntry = {
  time?: string;
  level?: string;
  message?: string;
  errorMessage?: string;
};

const CACHE_DIR = path.join(process.cwd(), "data", "cache");

async function walkFiles(dir: string): Promise<string[]> {
  let entries;

  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch (error) {
    const code = typeof error === "object" && error && "code" in error ? error.code : undefined;
    if (code === "ENOENT") return [];
    throw error;
  }

  const files = await Promise.all(
    entries.map((entry) => {
      const entryPath = path.join(dir, entry.name);
      return entry.isDirectory() ? walkFiles(entryPath) : [entryPath];
    })
  );

  return files.flat();
}

async function getCacheStats() {
  const files = await walkFiles(CACHE_DIR);
  const sizes = await Promise.all(
    files.map(async (file) => {
      try {
        return (await stat(file)).size;
      } catch {
        return 0;
      }
    })
  );

  return {
    fileCount: files.length,
    totalBytes: sizes.reduce((total, size) => total + size, 0)
  };
}

async function readRecentErrorLogs(): Promise<HealthLogEntry[]> {
  let content = "";

  try {
    content = await readFile(APP_LOG_FILE, "utf8");
  } catch (error) {
    const code = typeof error === "object" && error && "code" in error ? error.code : undefined;
    if (code === "ENOENT") return [];
    throw error;
  }

  return content
    .trim()
    .split("\n")
    .slice(-200)
    .map((line) => {
      try {
        return JSON.parse(line) as HealthLogEntry;
      } catch {
        return undefined;
      }
    })
    .filter((entry): entry is HealthLogEntry => Boolean(entry && entry.level === "error"))
    .slice(-5)
    .reverse();
}

export async function getHealthStatus(): Promise<HealthStatus> {
  const [history, cache, recentErrors] = await Promise.all([readHistoryIndex(), getCacheStats(), readRecentErrorLogs()]);

  return {
    reports: {
      count: history.length
    },
    cache,
    logs: {
      recentErrors
    },
    config: {
      modelApiKeyConfigured: Boolean(process.env.DEEPSEEK_API_KEY || process.env.OPENAI_API_KEY),
      bangumiAccessTokenConfigured: Boolean(process.env.BANGUMI_ACCESS_TOKEN),
      proxyConfigured: Boolean(process.env.BANGUMI_LENS_PROXY),
      model: process.env.DEEPSEEK_MODEL || "deepseek-v4-flash",
      baseUrl: process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com"
    }
  };
}
