import { NextResponse } from "next/server";
import { fetchBangumiSubjectInfo } from "@/lib/bangumi";
import { appendAppLog, errorFields } from "@/lib/logger";
import { deleteServerCache, readServerCache, writeServerCache } from "@/lib/server-cache";
import {
  CachedSubjectInfoPayload,
  hasCurrentSubjectInfoCacheSchema,
  hasSubjectInfoEpisodeListField,
  isSubjectInfoEpisodeTotalConsistent,
  SUBJECT_INFO_CACHE_NAMESPACE,
  SUBJECT_INFO_CACHE_SCHEMA_VERSION,
  SUBJECT_INFO_CACHE_TTL_MS
} from "@/lib/subject-info-cache";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const startedAt = Date.now();
  const searchParams = new URL(request.url).searchParams;
  const subjectId = searchParams.get("subjectId")?.trim();
  const refresh = searchParams.get("refresh") === "1";

  if (!subjectId) {
    await appendAppLog("warn", "subject-info.request.invalid", { reason: "missing_subject_id" });
    return NextResponse.json({ error: "缺少作品 ID。" }, { status: 400 });
  }

  try {
    if (refresh) {
      await deleteServerCache(SUBJECT_INFO_CACHE_NAMESPACE, subjectId);
    }

    const cached = await readServerCache<CachedSubjectInfoPayload>(
      SUBJECT_INFO_CACHE_NAMESPACE,
      subjectId,
      SUBJECT_INFO_CACHE_TTL_MS
    );
    if (
      !refresh &&
      cached &&
      hasCurrentSubjectInfoCacheSchema(cached) &&
      hasSubjectInfoEpisodeListField(cached) &&
      isSubjectInfoEpisodeTotalConsistent(cached)
    ) {
      await appendAppLog("info", "subject-info.request.cache_hit", {
        subjectId,
        durationMs: Date.now() - startedAt
      });
      return NextResponse.json(cached);
    }

    await appendAppLog("info", "subject-info.request.start", { subjectId, refresh });
    const subjectInfo = await fetchBangumiSubjectInfo(subjectId, { includeEpisodes: true });
    await writeServerCache(SUBJECT_INFO_CACHE_NAMESPACE, subjectId, {
      ...subjectInfo,
      cacheSchemaVersion: SUBJECT_INFO_CACHE_SCHEMA_VERSION
    });
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
