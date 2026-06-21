import { NextResponse } from "next/server";
import { fetchBangumiSubjectInfo } from "@/lib/bangumi";
import { appendAppLog, errorFields } from "@/lib/logger";
import { readServerCache, writeServerCache } from "@/lib/server-cache";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type SubjectInfoPayload = Awaited<ReturnType<typeof fetchBangumiSubjectInfo>>;

const SUBJECT_INFO_CACHE_NAMESPACE = "bangumi-subject-info";
const SUBJECT_INFO_CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const SUBJECT_INFO_CACHE_SCHEMA_VERSION = 2;

type CachedSubjectInfoPayload = SubjectInfoPayload & {
  cacheSchemaVersion?: number;
};

function hasEpisodeList(subjectInfo: SubjectInfoPayload | undefined) {
  return Array.isArray(subjectInfo?.episodes) && subjectInfo.episodes.length > 0;
}

function hasCurrentCacheSchema(subjectInfo: CachedSubjectInfoPayload | undefined) {
  return subjectInfo?.cacheSchemaVersion === SUBJECT_INFO_CACHE_SCHEMA_VERSION;
}

function isEpisodeTotalConsistent(subjectInfo: SubjectInfoPayload | undefined) {
  if (!subjectInfo || typeof subjectInfo.episodeTotal !== "number" || !hasEpisodeList(subjectInfo)) return true;
  return subjectInfo.episodes.every(
    (episode) => typeof episode.sort !== "number" || episode.sort <= subjectInfo.episodeTotal!
  );
}

export async function GET(request: Request) {
  const startedAt = Date.now();
  const subjectId = new URL(request.url).searchParams.get("subjectId")?.trim();

  if (!subjectId) {
    await appendAppLog("warn", "subject-info.request.invalid", { reason: "missing_subject_id" });
    return NextResponse.json({ error: "缺少作品 ID。" }, { status: 400 });
  }

  try {
    const cached = await readServerCache<CachedSubjectInfoPayload>(
      SUBJECT_INFO_CACHE_NAMESPACE,
      subjectId,
      SUBJECT_INFO_CACHE_TTL_MS
    );
    if (cached && hasCurrentCacheSchema(cached) && hasEpisodeList(cached) && isEpisodeTotalConsistent(cached)) {
      await appendAppLog("info", "subject-info.request.cache_hit", {
        subjectId,
        durationMs: Date.now() - startedAt
      });
      return NextResponse.json(cached);
    }

    await appendAppLog("info", "subject-info.request.start", { subjectId });
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
