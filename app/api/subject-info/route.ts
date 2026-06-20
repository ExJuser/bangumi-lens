import { NextResponse } from "next/server";
import { fetchBangumiSubjectInfo } from "@/lib/bangumi";
import { appendAppLog, errorFields } from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const startedAt = Date.now();
  const subjectId = new URL(request.url).searchParams.get("subjectId")?.trim();

  if (!subjectId) {
    await appendAppLog("warn", "subject-info.request.invalid", { reason: "missing_subject_id" });
    return NextResponse.json({ error: "缺少作品 ID。" }, { status: 400 });
  }

  try {
    await appendAppLog("info", "subject-info.request.start", { subjectId });
    const subjectInfo = await fetchBangumiSubjectInfo(subjectId);
    await appendAppLog("info", "subject-info.request.complete", {
      subjectId,
      durationMs: Date.now() - startedAt
    });
    return NextResponse.json(subjectInfo);
  } catch (error) {
    await appendAppLog("error", "subject-info.request.failed", {
      subjectId,
      ...errorFields(error),
      durationMs: Date.now() - startedAt
    });
    throw error;
  }
}
