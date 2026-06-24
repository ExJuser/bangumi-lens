import { appendFile, mkdir, open, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { isMissingFileError } from "@/lib/fs-json";

export type LogLevel = "debug" | "info" | "warn" | "error";

type LogFields = Record<string, unknown>;

type LoggerOptions = {
  filePath?: string;
  maxBytes?: number;
  retainBytes?: number;
};

export const APP_LOG_FILE = path.join(process.cwd(), "logs", "app.log");
const DEFAULT_MAX_BYTES = 1024 * 1024;
const DEFAULT_RETAIN_BYTES = 256 * 1024;

export async function appendAppLog(
  level: LogLevel,
  message: string,
  fields: LogFields = {},
  options: LoggerOptions = {}
) {
  const filePath = options.filePath || APP_LOG_FILE;
  const maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES;
  const retainBytes = Math.min(options.retainBytes ?? DEFAULT_RETAIN_BYTES, maxBytes);
  const line = `${JSON.stringify({ time: new Date().toISOString(), level, message, ...sanitizeFields(fields) })}\n`;

  await mkdir(path.dirname(filePath), { recursive: true });
  await trimLogIfNeeded(filePath, maxBytes, retainBytes, Buffer.byteLength(line));
  await appendFile(filePath, line, "utf8");
}

export function errorFields(error: unknown): LogFields {
  if (error instanceof Error) {
    return {
      errorName: error.name,
      errorMessage: error.message,
      stack: error.stack
    };
  }

  return { errorMessage: String(error) };
}

async function trimLogIfNeeded(filePath: string, maxBytes: number, retainBytes: number, incomingBytes: number) {
  let size = 0;

  try {
    size = (await stat(filePath)).size;
  } catch (error) {
    if (isMissingFileError(error)) return;
    throw error;
  }

  if (size + incomingBytes <= maxBytes) return;

  const keepBytes = Math.max(0, Math.min(retainBytes, size));
  const offset = Math.max(0, size - keepBytes);
  const buffer = Buffer.alloc(keepBytes);
  const file = await open(filePath, "r");

  try {
    await file.read(buffer, 0, keepBytes, offset);
  } finally {
    await file.close();
  }

  const retained = trimPartialFirstLine(buffer.toString("utf8"));
  const marker = JSON.stringify({
    time: new Date().toISOString(),
    level: "warn",
    message: "log truncated",
    previousBytes: size,
    retainedBytes: Buffer.byteLength(retained)
  });

  await writeFile(filePath, `${marker}\n${retained}`, "utf8");
}

function trimPartialFirstLine(value: string) {
  const firstBreak = value.indexOf("\n");
  if (firstBreak === -1) return "";
  return value.slice(firstBreak + 1);
}

function sanitizeFields(fields: LogFields): LogFields {
  const sanitizedFields: LogFields = {};

  for (const [key, value] of Object.entries(fields)) {
    if (value !== undefined) {
      sanitizedFields[key] = value;
    }
  }

  return sanitizedFields;
}
