import { NextResponse } from "next/server";
import { deleteHistoryReport, readHistory, saveHistoryReport } from "@/lib/history-store";
import { appendAppLog, errorFields } from "@/lib/logger";
import type { AnalyzeReport } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const startedAt = Date.now();

  try {
    const history = await readHistory();
    await appendAppLog("info", "history.read.complete", {
      count: history.length,
      durationMs: Date.now() - startedAt
    });
    return NextResponse.json({ history });
  } catch (error) {
    await appendAppLog("error", "history.read.failed", {
      ...errorFields(error),
      durationMs: Date.now() - startedAt
    });
    throw error;
  }
}

export async function POST(request: Request) {
  const body = (await request.json()) as { report?: unknown; url?: unknown };
  if (!body.report || typeof body.url !== "string") {
    await appendAppLog("warn", "history.save.invalid", { reason: "missing_report_or_url" });
    return NextResponse.json({ error: "缺少报告或来源链接。" }, { status: 400 });
  }

  const startedAt = Date.now();

  try {
    const history = await saveHistoryReport(body.report as AnalyzeReport, body.url);
    await appendAppLog("info", "history.save.complete", {
      count: history.length,
      durationMs: Date.now() - startedAt
    });
    return NextResponse.json({ history });
  } catch (error) {
    await appendAppLog("error", "history.save.failed", {
      ...errorFields(error),
      durationMs: Date.now() - startedAt
    });
    throw error;
  }
}

export async function DELETE(request: Request) {
  const body = (await request.json()) as { id?: unknown };
  if (typeof body.id !== "string") {
    await appendAppLog("warn", "history.delete.invalid", { reason: "missing_id" });
    return NextResponse.json({ error: "缺少历史记录 ID。" }, { status: 400 });
  }

  const startedAt = Date.now();

  try {
    const history = await deleteHistoryReport(body.id);
    await appendAppLog("info", "history.delete.complete", {
      id: body.id,
      count: history.length,
      durationMs: Date.now() - startedAt
    });
    return NextResponse.json({ history });
  } catch (error) {
    await appendAppLog("error", "history.delete.failed", {
      id: body.id,
      ...errorFields(error),
      durationMs: Date.now() - startedAt
    });
    throw error;
  }
}
