import { NextResponse } from "next/server";
import {
  deleteHistoryReport,
  readHistoryIndex,
  readHistoryReport,
  saveHistoryReport,
  updateHistoryReportLike
} from "@/lib/history-store";
import { appendAppLog, errorFields } from "@/lib/logger";
import type { AnalyzeReport } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const startedAt = Date.now();
  const id = new URL(request.url).searchParams.get("id");

  try {
    if (id) {
      const item = await readHistoryReport(id);
      await appendAppLog("info", "history.report.read.complete", {
        id,
        found: Boolean(item),
        durationMs: Date.now() - startedAt
      });

      if (!item) {
        return NextResponse.json({ error: "未找到本地报告。" }, { status: 404 });
      }

      return NextResponse.json({ item });
    }

    const history = await readHistoryIndex();
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

export async function PATCH(request: Request) {
  const body = (await request.json()) as { id?: unknown; liked?: unknown };
  if (typeof body.id !== "string" || typeof body.liked !== "boolean") {
    await appendAppLog("warn", "history.like.invalid", { reason: "missing_id_or_liked" });
    return NextResponse.json({ error: "缺少历史记录 ID 或喜欢状态。" }, { status: 400 });
  }

  const startedAt = Date.now();

  try {
    const history = await updateHistoryReportLike(body.id, body.liked);
    await appendAppLog("info", "history.like.complete", {
      id: body.id,
      liked: body.liked,
      found: Boolean(history),
      count: history?.length,
      durationMs: Date.now() - startedAt
    });

    if (!history) {
      return NextResponse.json({ error: "未找到本地报告。" }, { status: 404 });
    }

    return NextResponse.json({ history });
  } catch (error) {
    await appendAppLog("error", "history.like.failed", {
      id: body.id,
      ...errorFields(error),
      durationMs: Date.now() - startedAt
    });
    throw error;
  }
}
