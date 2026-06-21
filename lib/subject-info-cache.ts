import { fetchBangumiSubjectInfo } from "@/lib/bangumi";

export type SubjectInfoPayload = Awaited<ReturnType<typeof fetchBangumiSubjectInfo>>;

export const SUBJECT_INFO_CACHE_NAMESPACE = "bangumi-subject-info";
export const SUBJECT_INFO_CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000;
export const SUBJECT_INFO_CACHE_SCHEMA_VERSION = 2;

export type CachedSubjectInfoPayload = SubjectInfoPayload & {
  cacheSchemaVersion?: number;
};

export function hasSubjectInfoEpisodeListField(subjectInfo: SubjectInfoPayload | undefined) {
  return Array.isArray(subjectInfo?.episodes);
}

export function hasCurrentSubjectInfoCacheSchema(subjectInfo: CachedSubjectInfoPayload | undefined) {
  return subjectInfo?.cacheSchemaVersion === SUBJECT_INFO_CACHE_SCHEMA_VERSION;
}

export function isSubjectInfoEpisodeTotalConsistent(subjectInfo: SubjectInfoPayload | undefined) {
  if (
    !subjectInfo ||
    typeof subjectInfo.episodeTotal !== "number" ||
    !hasSubjectInfoEpisodeListField(subjectInfo)
  ) {
    return true;
  }

  const episodes = subjectInfo.episodes || [];
  return episodes.every(
    (episode) => typeof episode.sort !== "number" || episode.sort <= subjectInfo.episodeTotal!
  );
}
