import { NextResponse } from "next/server";
import { readHistoryReportStatus } from "@/lib/history-store";
import { appendAppLog, errorFields } from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type"
};

function json(data: unknown, init?: ResponseInit) {
  return NextResponse.json(data, {
    ...init,
    headers: {
      ...CORS_HEADERS,
      ...init?.headers
    }
  });
}

export function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: CORS_HEADERS
  });
}

export async function GET(request: Request) {
  const startedAt = Date.now();
  const url = new URL(request.url).searchParams.get("url");

  if (!url) {
    await appendAppLog("warn", "history.status.invalid", { reason: "missing_url" });
    return json({ error: "缺少 Bangumi 章节链接。" }, { status: 400 });
  }

  try {
    const status = await readHistoryReportStatus(url);
    await appendAppLog("info", "history.status.read.complete", {
      exists: status.exists,
      id: status.id,
      durationMs: Date.now() - startedAt
    });

    return json(status);
  } catch (error) {
    const message = error instanceof Error ? error.message : "读取本地报告状态失败。";
    const isInputError =
      message.includes("请输入") ||
      message.includes("仅支持") ||
      message.includes("不是 Bangumi") ||
      message.includes("章节链接");

    await appendAppLog(isInputError ? "warn" : "error", "history.status.read.failed", {
      ...errorFields(error),
      status: isInputError ? 400 : 500,
      durationMs: Date.now() - startedAt
    });

    return json({ error: message }, { status: isInputError ? 400 : 500 });
  }
}
