import { NextResponse } from "next/server";
import { appendAppLog, errorFields } from "@/lib/logger";
import { refineSeasonTrendSummary } from "@/lib/report";
import type { SeasonTrendPayload } from "@/lib/season-trends";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const startedAt = Date.now();
  const body = (await request.json()) as { trends?: unknown };
  const trends = body.trends as SeasonTrendPayload | undefined;

  if (!trends || typeof trends !== "object" || !trends.available) {
    await appendAppLog("warn", "season_trends_summary.request.invalid", { reason: "missing_or_unavailable_trends" });
    return NextResponse.json({ error: "缺少可用的作品趋势数据。" }, { status: 400 });
  }

  try {
    const summary = await refineSeasonTrendSummary(trends);
    await appendAppLog("info", "season_trends_summary.request.complete", {
      subjectId: trends.subjectId,
      savedReportCount: trends.savedReportCount,
      durationMs: Date.now() - startedAt
    });
    return NextResponse.json({ summary });
  } catch (error) {
    await appendAppLog("error", "season_trends_summary.request.failed", {
      subjectId: trends.subjectId,
      ...errorFields(error),
      durationMs: Date.now() - startedAt
    });

    const message = error instanceof Error ? error.message : "整季总结生成失败，请稍后重试。";
    return NextResponse.json({ error: formatSummaryError(message) }, { status: 500 });
  }
}

function formatSummaryError(message: string) {
  const lowerMessage = message.toLowerCase();

  if (message.includes("429") || lowerMessage.includes("quota") || lowerMessage.includes("billing")) {
    return "模型 API 返回额度、限速或计费限制错误。请检查当前 API Key 的余额、额度和账单设置后重试。";
  }

  if (lowerMessage.includes("connection error") || lowerMessage.includes("fetch failed")) {
    return "服务端外部请求失败。请确认代理地址 BANGUMI_LENS_PROXY 可用，且模型 API 能通过该代理访问。";
  }

  return message;
}
