import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { isMissingFileError } from "@/lib/fs-json";
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

type CacheStats = {
  fileCount: number;
  totalBytes: number;
};

async function getDirectoryStats(dir: string): Promise<CacheStats> {
  let entries;

  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch (error) {
    if (isMissingFileError(error)) return { fileCount: 0, totalBytes: 0 };
    throw error;
  }

  const statsReads: Promise<CacheStats>[] = [];
  for (const entry of entries) {
    const entryPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      statsReads.push(getDirectoryStats(entryPath));
      continue;
    }

    statsReads.push(
      stat(entryPath)
        .then((fileStats) => ({
          fileCount: 1,
          totalBytes: fileStats.size
        }))
        .catch(() => ({
          fileCount: 1,
          totalBytes: 0
        }))
    );
  }

  const total = { fileCount: 0, totalBytes: 0 };
  for (const current of await Promise.all(statsReads)) {
    total.fileCount += current.fileCount;
    total.totalBytes += current.totalBytes;
  }

  return total;
}

async function readRecentErrorLogs(): Promise<HealthLogEntry[]> {
  let content = "";

  try {
    content = await readFile(APP_LOG_FILE, "utf8");
  } catch (error) {
    if (isMissingFileError(error)) return [];
    throw error;
  }

  const lines = content.trim().split("\n");
  const recentErrors: HealthLogEntry[] = [];
  const firstLineIndex = Math.max(0, lines.length - 200);

  for (let index = lines.length - 1; index >= firstLineIndex && recentErrors.length < 5; index -= 1) {
    try {
      const entry = JSON.parse(lines[index]) as HealthLogEntry;
      if (entry?.level === "error") {
        recentErrors.push(entry);
      }
    } catch {
      // Ignore malformed log lines; health checks should keep reporting the valid recent errors.
    }
  }

  return recentErrors;
}

export async function getHealthStatus(): Promise<HealthStatus> {
  const [history, cache, recentErrors] = await Promise.all([
    readHistoryIndex(),
    getDirectoryStats(CACHE_DIR),
    readRecentErrorLogs()
  ]);

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
