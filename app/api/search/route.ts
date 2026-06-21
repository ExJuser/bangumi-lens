import { NextResponse } from "next/server";
import { appendAppLog, errorFields } from "@/lib/logger";
import { configureServerProxy } from "@/lib/proxy";
import { readServerCache, writeServerCache } from "@/lib/server-cache";
import {
  CachedSubjectInfoPayload,
  hasCurrentSubjectInfoCacheSchema,
  hasSubjectInfoEpisodeListField,
  isSubjectInfoEpisodeTotalConsistent,
  SubjectInfoPayload,
  SUBJECT_INFO_CACHE_NAMESPACE,
  SUBJECT_INFO_CACHE_TTL_MS
} from "@/lib/subject-info-cache";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type BangumiSubject = {
  id?: number;
  name?: string;
  name_cn?: string;
  eps?: number;
  total_episodes?: number;
  date?: string;
};

type BangumiEpisode = {
  id?: number;
  sort?: number;
  name?: string;
  name_cn?: string;
  type?: number;
};

export type SearchResult = {
  subjectId: string;
  title: string;
  titleCn?: string;
  episodeTotal?: number;
  subjectInfo?: SubjectInfoPayload;
  firstEpisodeId: string;
  firstEpisodeTitle?: string;
  firstEpisodeNumber?: number;
  url: string;
};

type SearchPayload = {
  results: SearchResult[];
  total: number;
  page: number;
  pageSize: number;
  hasNext: boolean;
};

const USER_AGENT =
  "BangumiLens/0.1 (+https://github.com/local/bangumi-lens; public episode comment summarizer)";
const SEARCH_PAGE_SIZE = 8;
const SEARCH_PAGE_EXTRA_SCAN_PAGES = 5;
const SEARCH_CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const SEARCH_CACHE_NAMESPACE = "bangumi-search-v2";
const cache = new Map<string, { expiresAt: number; payload: SearchPayload }>();

function normalizeQuery(query: string) {
  return query.trim().replace(/\s+/g, " ").toLowerCase();
}

function getSubjectTitle(subject: BangumiSubject) {
  return subject.name_cn?.trim() || subject.name?.trim() || `Bangumi Subject ${subject.id}`;
}

function getEpisodeTitle(episode: BangumiEpisode) {
  return episode.name_cn?.trim() || episode.name?.trim() || undefined;
}

function normalizePage(page: string | null) {
  const parsedPage = Number(page);
  return Number.isInteger(parsedPage) && parsedPage > 0 ? parsedPage : 1;
}

function buildSearchCacheKey(query: string, page: number) {
  return `${query}::page=${page}::size=${SEARCH_PAGE_SIZE}`;
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T | undefined> {
  const response = await fetch(url, {
    ...init,
    headers: {
      "User-Agent": USER_AGENT,
      Accept: "application/json",
      "Content-Type": "application/json",
      ...init?.headers
    },
    next: { revalidate: 0 }
  });

  if (!response.ok) return undefined;
  return (await response.json()) as T;
}

async function searchSubjects(query: string, offset: number) {
  const payload = await fetchJson<{ data?: BangumiSubject[]; total?: number }>(
    `https://api.bgm.tv/v0/search/subjects?limit=${SEARCH_PAGE_SIZE}&offset=${offset}`,
    {
      method: "POST",
      body: JSON.stringify({
        keyword: query,
        sort: "match",
        filter: {
          type: [2]
        }
      })
    }
  );

  return {
    subjects: (payload?.data || []).filter((subject) => subject.id),
    total: typeof payload?.total === "number" && payload.total >= 0 ? payload.total : 0
  };
}

async function fetchFirstEpisode(subjectId: number) {
  const payload = await fetchJson<{ data?: BangumiEpisode[] }>(
    `https://api.bgm.tv/v0/episodes?subject_id=${subjectId}&type=0&limit=100&offset=0`
  );
  const episodes = (payload?.data || []).filter((episode) => episode.id);
  if (episodes.length === 0) return undefined;

  return [...episodes].sort((a, b) => {
    const aSort = typeof a.sort === "number" ? a.sort : Number.MAX_SAFE_INTEGER;
    const bSort = typeof b.sort === "number" ? b.sort : Number.MAX_SAFE_INTEGER;
    return aSort - bSort;
  })[0];
}

async function buildSearchResults(subjects: BangumiSubject[]) {
  const results = await Promise.all(
    subjects.map(async (subject) => {
      if (!subject.id) return undefined;
      const episode = await fetchFirstEpisode(subject.id);
      if (!episode?.id) return undefined;

      const episodeTotal = Number(subject.eps || subject.total_episodes);
      const result: SearchResult = {
        subjectId: String(subject.id),
        title: subject.name?.trim() || getSubjectTitle(subject),
        titleCn: subject.name_cn?.trim() || undefined,
        episodeTotal: Number.isFinite(episodeTotal) && episodeTotal > 0 ? episodeTotal : undefined,
        firstEpisodeId: String(episode.id),
        firstEpisodeTitle: getEpisodeTitle(episode),
        firstEpisodeNumber: typeof episode.sort === "number" ? episode.sort : undefined,
        url: `https://bgm.tv/ep/${episode.id}`
      };
      return result;
    })
  );

  return results.filter((result): result is SearchResult => Boolean(result));
}

async function buildSearchPayload(query: string, page: number): Promise<SearchPayload> {
  const targetStart = (page - 1) * SEARCH_PAGE_SIZE;
  const targetEnd = page * SEARCH_PAGE_SIZE;
  const targetUsableCount = targetEnd + 1;
  const maxScannedPages = page + SEARCH_PAGE_EXTRA_SCAN_PAGES;
  let offset = 0;
  let total = 0;
  let scannedPages = 0;
  const usableResults: SearchResult[] = [];

  while (usableResults.length < targetUsableCount && scannedPages < maxScannedPages) {
    const subjectPage = await searchSubjects(query, offset);
    total = subjectPage.total;
    scannedPages += 1;
    if (subjectPage.subjects.length === 0) break;

    usableResults.push(...(await buildSearchResults(subjectPage.subjects)));
    offset += SEARCH_PAGE_SIZE;
    if (offset >= total) break;
  }

  return {
    results: usableResults.slice(targetStart, targetEnd),
    total,
    page,
    pageSize: SEARCH_PAGE_SIZE,
    hasNext: usableResults.length > targetEnd || offset < total
  };
}

function isReusableSubjectInfoCache(cached: CachedSubjectInfoPayload | undefined) {
  return (
    cached &&
    hasCurrentSubjectInfoCacheSchema(cached) &&
    hasSubjectInfoEpisodeListField(cached) &&
    isSubjectInfoEpisodeTotalConsistent(cached)
  );
}

async function attachCachedSubjectInfo(results: SearchResult[]) {
  const enrichedResults = await Promise.all(
    results.map(async (result) => {
      const cached = await readServerCache<CachedSubjectInfoPayload>(
        SUBJECT_INFO_CACHE_NAMESPACE,
        result.subjectId,
        SUBJECT_INFO_CACHE_TTL_MS
      );
      if (!isReusableSubjectInfoCache(cached)) return result;

      return {
        ...result,
        subjectInfo: cached
      };
    })
  );

  return enrichedResults;
}

async function attachCachedSubjectInfoToPayload(payload: SearchPayload) {
  return {
    ...payload,
    results: await attachCachedSubjectInfo(payload.results)
  };
}

export async function GET(request: Request) {
  const startedAt = Date.now();
  const searchParams = new URL(request.url).searchParams;
  const query = searchParams.get("q") || "";
  const normalizedQuery = normalizeQuery(query);
  const page = normalizePage(searchParams.get("page"));
  const cacheKey = buildSearchCacheKey(normalizedQuery, page);

  if (normalizedQuery.length < 2) {
    return NextResponse.json({ error: "搜索词至少需要 2 个字符。" }, { status: 400 });
  }

  const cached = cache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return NextResponse.json({ ...(await attachCachedSubjectInfoToPayload(cached.payload)), cached: true });
  }

  const diskCached = await readServerCache<SearchPayload>(SEARCH_CACHE_NAMESPACE, cacheKey, SEARCH_CACHE_TTL_MS);
  if (diskCached?.results) {
    cache.set(cacheKey, { expiresAt: Date.now() + SEARCH_CACHE_TTL_MS, payload: diskCached });
    return NextResponse.json({ ...(await attachCachedSubjectInfoToPayload(diskCached)), cached: true });
  }

  try {
    configureServerProxy();
    await appendAppLog("info", "search.request.start", { query: normalizedQuery, page });
    const payload = await buildSearchPayload(query.trim(), page);
    cache.set(cacheKey, { expiresAt: Date.now() + SEARCH_CACHE_TTL_MS, payload });
    await writeServerCache(SEARCH_CACHE_NAMESPACE, cacheKey, payload);
    await appendAppLog("info", "search.request.complete", {
      query: normalizedQuery,
      page,
      count: payload.results.length,
      total: payload.total,
      hasNext: payload.hasNext,
      durationMs: Date.now() - startedAt
    });

    return NextResponse.json({ ...(await attachCachedSubjectInfoToPayload(payload)), cached: false });
  } catch (error) {
    await appendAppLog("error", "search.request.failed", {
      query: normalizedQuery,
      page,
      ...errorFields(error),
      durationMs: Date.now() - startedAt
    });
    return NextResponse.json({ error: "搜索失败，请稍后重试。" }, { status: 502 });
  }
}
