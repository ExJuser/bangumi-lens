import { NextResponse } from "next/server";
import { getHealthStatus } from "@/lib/health";
import { appendAppLog, errorFields } from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const startedAt = Date.now();

  try {
    const health = await getHealthStatus();
    await appendAppLog("info", "health.read.complete", {
      reportCount: health.reports.count,
      cacheFileCount: health.cache.fileCount,
      durationMs: Date.now() - startedAt
    });
    return NextResponse.json({ health });
  } catch (error) {
    await appendAppLog("error", "health.read.failed", {
      ...errorFields(error),
      durationMs: Date.now() - startedAt
    });
    return NextResponse.json({ error: "本地数据健康状态读取失败。" }, { status: 500 });
  }
}
