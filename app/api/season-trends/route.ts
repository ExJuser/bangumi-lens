import { NextResponse } from "next/server";
import { readHistory } from "@/lib/history-store";
import { appendAppLog, errorFields } from "@/lib/logger";
import { buildSeasonTrendPayload } from "@/lib/season-trends";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const startedAt = Date.now();
  const searchParams = new URL(request.url).searchParams;
  const subjectId = searchParams.get("subjectId")?.trim();
  const subjectName = searchParams.get("subjectName")?.trim();

  if (!subjectId && !subjectName) {
    await appendAppLog("warn", "season_trends.request.invalid", { reason: "missing_subject" });
    return NextResponse.json({ error: "缺少作品 ID 或作品名。" }, { status: 400 });
  }

  try {
    const history = await readHistory();
    const trends = buildSeasonTrendPayload(history, subjectId, subjectName);
    await appendAppLog("info", "season_trends.request.complete", {
      subjectId,
      subjectName,
      savedReportCount: trends.savedReportCount,
      requiredReportCount: trends.requiredReportCount,
      available: trends.available,
      durationMs: Date.now() - startedAt
    });

    return NextResponse.json({ trends });
  } catch (error) {
    await appendAppLog("error", "season_trends.request.failed", {
      subjectId,
      subjectName,
      ...errorFields(error),
      durationMs: Date.now() - startedAt
    });
    throw error;
  }
}
