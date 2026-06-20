import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import type { AnalyzeReport } from "@/lib/types";

export type SavedReport = {
  id: string;
  url: string;
  savedAt: string;
  report: AnalyzeReport;
};

export type SavedReportIndexItem = {
  id: string;
  url: string;
  savedAt: string;
  reportPath: string;
  meta: AnalyzeReport["meta"];
  stats: AnalyzeReport["stats"];
};

const LEGACY_HISTORY_FILE = path.join(process.cwd(), "data", "reports.json");
const HISTORY_DIR = path.join(process.cwd(), "data", "reports");
const HISTORY_INDEX_FILE = path.join(HISTORY_DIR, "index.json");
const HISTORY_ITEMS_DIR = path.join(HISTORY_DIR, "items");

async function ensureHistoryDir() {
  await mkdir(HISTORY_ITEMS_DIR, { recursive: true });
}

function getReportPath(itemId: string) {
  return `items/${encodeURIComponent(itemId)}.json`;
}

function getReportFilePath(reportPath: string) {
  const resolvedPath = path.resolve(HISTORY_DIR, reportPath);
  const resolvedItemsDir = path.resolve(HISTORY_ITEMS_DIR);

  if (!resolvedPath.startsWith(`${resolvedItemsDir}${path.sep}`)) {
    throw new Error("Invalid report path.");
  }

  return resolvedPath;
}

function createIndexItem(item: SavedReport): SavedReportIndexItem {
  return {
    id: item.id,
    url: item.url,
    savedAt: item.savedAt,
    reportPath: getReportPath(item.id),
    meta: item.report.meta,
    stats: item.report.stats
  };
}

async function readJsonFile<T>(filePath: string): Promise<T | undefined> {
  try {
    return JSON.parse(await readFile(filePath, "utf8")) as T;
  } catch (error) {
    const code = typeof error === "object" && error && "code" in error ? error.code : undefined;
    if (code === "ENOENT") return undefined;
    throw error;
  }
}

async function writeJsonFile(filePath: string, value: unknown) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function writeReportFile(item: SavedReport) {
  await writeJsonFile(getReportFilePath(getReportPath(item.id)), item.report);
}

async function writeHistoryIndex(index: SavedReportIndexItem[]) {
  await writeJsonFile(HISTORY_INDEX_FILE, index);
}

async function readLegacyHistory(): Promise<SavedReport[]> {
  const parsed = await readJsonFile<unknown>(LEGACY_HISTORY_FILE);
  return Array.isArray(parsed) ? (parsed as SavedReport[]) : [];
}

async function migrateLegacyHistory() {
  const legacyHistory = await readLegacyHistory();
  if (legacyHistory.length === 0) return [];

  await ensureHistoryDir();
  for (const item of legacyHistory) {
    await writeReportFile(item);
  }

  const index = legacyHistory.map(createIndexItem);
  await writeHistoryIndex(index);
  return index;
}

export async function readHistoryIndex(): Promise<SavedReportIndexItem[]> {
  const parsed = await readJsonFile<unknown>(HISTORY_INDEX_FILE);
  if (Array.isArray(parsed)) return parsed as SavedReportIndexItem[];
  return migrateLegacyHistory();
}

export async function readHistoryReport(itemId: string): Promise<SavedReport | undefined> {
  const index = await readHistoryIndex();
  const item = index.find((entry) => entry.id === itemId);
  if (!item) return undefined;

  const report = await readJsonFile<AnalyzeReport>(getReportFilePath(item.reportPath));
  if (!report) return undefined;

  return {
    id: item.id,
    url: item.url,
    savedAt: item.savedAt,
    report
  };
}

export async function readHistory(): Promise<SavedReport[]> {
  const index = await readHistoryIndex();
  const history = await Promise.all(index.map((item) => readHistoryReport(item.id)));
  return history.filter((item): item is SavedReport => Boolean(item));
}

export async function saveHistoryReport(report: AnalyzeReport, sourceUrl: string) {
  const currentHistory = await readHistoryIndex();
  const nextItem: SavedReport = {
    id: `${report.meta.episodeId}-${Date.now()}`,
    url: sourceUrl,
    savedAt: new Date().toISOString(),
    report
  };
  const removedItems = currentHistory.filter((item) => item.meta.url === report.meta.url);
  const dedupedHistory = currentHistory.filter((item) => item.meta.url !== report.meta.url);
  const nextHistory = [createIndexItem(nextItem), ...dedupedHistory];

  await ensureHistoryDir();
  await writeReportFile(nextItem);
  await writeHistoryIndex(nextHistory);
  await Promise.all(removedItems.map((item) => rm(getReportFilePath(item.reportPath), { force: true })));

  return nextHistory;
}

export async function deleteHistoryReport(itemId: string) {
  const currentHistory = await readHistoryIndex();
  const removedItems = currentHistory.filter((item) => item.id === itemId);
  const nextHistory = currentHistory.filter((item) => item.id !== itemId);
  await writeHistoryIndex(nextHistory);
  await Promise.all(removedItems.map((item) => rm(getReportFilePath(item.reportPath), { force: true })));
  return nextHistory;
}
