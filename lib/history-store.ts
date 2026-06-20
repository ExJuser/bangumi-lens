import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { AnalyzeReport } from "@/lib/types";

export type SavedReport = {
  id: string;
  url: string;
  savedAt: string;
  report: AnalyzeReport;
};

const HISTORY_LIMIT = 60;
const HISTORY_FILE = path.join(process.cwd(), "data", "reports.json");

async function ensureHistoryDir() {
  await mkdir(path.dirname(HISTORY_FILE), { recursive: true });
}

export async function readHistory(): Promise<SavedReport[]> {
  try {
    const raw = await readFile(HISTORY_FILE, "utf8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    const code = typeof error === "object" && error && "code" in error ? error.code : undefined;
    if (code === "ENOENT") return [];
    throw error;
  }
}

async function writeHistory(history: SavedReport[]) {
  await ensureHistoryDir();
  await writeFile(HISTORY_FILE, `${JSON.stringify(history, null, 2)}\n`, "utf8");
}

export async function saveHistoryReport(report: AnalyzeReport, sourceUrl: string) {
  const currentHistory = await readHistory();
  const nextItem: SavedReport = {
    id: `${report.meta.episodeId}-${Date.now()}`,
    url: sourceUrl,
    savedAt: new Date().toISOString(),
    report
  };
  const dedupedHistory = currentHistory.filter((item) => item.report.meta.url !== report.meta.url);
  const nextHistory = [nextItem, ...dedupedHistory].slice(0, HISTORY_LIMIT);
  await writeHistory(nextHistory);
  return nextHistory;
}

export async function deleteHistoryReport(itemId: string) {
  const currentHistory = await readHistory();
  const nextHistory = currentHistory.filter((item) => item.id !== itemId);
  await writeHistory(nextHistory);
  return nextHistory;
}
