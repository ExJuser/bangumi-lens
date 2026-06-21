import { NextResponse } from "next/server";
import { appendAppLog, errorFields } from "@/lib/logger";
import { configureServerProxy } from "@/lib/proxy";
import { readServerCache, writeServerCache } from "@/lib/server-cache";

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
  firstEpisodeId: string;
  firstEpisodeTitle?: string;
  firstEpisodeNumber?: number;
  url: string;
};

const USER_AGENT =
  "BangumiLens/0.1 (+https://github.com/local/bangumi-lens; public episode comment summarizer)";
const SEARCH_CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const SEARCH_CACHE_NAMESPACE = "bangumi-search";
const cache = new Map<string, { expiresAt: number; results: SearchResult[] }>();

function normalizeQuery(query: string) {
  return query.trim().replace(/\s+/g, " ").toLowerCase();
}

function getSubjectTitle(subject: BangumiSubject) {
  return subject.name_cn?.trim() || subject.name?.trim() || `Bangumi Subject ${subject.id}`;
}

function getEpisodeTitle(episode: BangumiEpisode) {
  return episode.name_cn?.trim() || episode.name?.trim() || undefined;
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

async function searchSubjects(query: string) {
  const payload = await fetchJson<{ data?: BangumiSubject[] }>("https://api.bgm.tv/v0/search/subjects", {
    method: "POST",
    body: JSON.stringify({
      keyword: query,
      sort: "match",
      filter: {
        type: [2]
      }
    })
  });

  return (payload?.data || []).filter((subject) => subject.id).slice(0, 8);
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

async function buildSearchResults(query: string) {
  const subjects = await searchSubjects(query);
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

export async function GET(request: Request) {
  const startedAt = Date.now();
  const query = new URL(request.url).searchParams.get("q") || "";
  const normalizedQuery = normalizeQuery(query);

  if (normalizedQuery.length < 2) {
    return NextResponse.json({ error: "搜索词至少需要 2 个字符。" }, { status: 400 });
  }

  const cached = cache.get(normalizedQuery);
  if (cached && cached.expiresAt > Date.now()) {
    return NextResponse.json({ results: cached.results, cached: true });
  }

  const diskCached = await readServerCache<SearchResult[]>(SEARCH_CACHE_NAMESPACE, normalizedQuery, SEARCH_CACHE_TTL_MS);
  if (diskCached?.length) {
    cache.set(normalizedQuery, { expiresAt: Date.now() + SEARCH_CACHE_TTL_MS, results: diskCached });
    return NextResponse.json({ results: diskCached, cached: true });
  }

  try {
    configureServerProxy();
    await appendAppLog("info", "search.request.start", { query: normalizedQuery });
    const results = await buildSearchResults(query.trim());
    cache.set(normalizedQuery, { expiresAt: Date.now() + SEARCH_CACHE_TTL_MS, results });
    await writeServerCache(SEARCH_CACHE_NAMESPACE, normalizedQuery, results);
    await appendAppLog("info", "search.request.complete", {
      query: normalizedQuery,
      count: results.length,
      durationMs: Date.now() - startedAt
    });

    return NextResponse.json({ results, cached: false });
  } catch (error) {
    await appendAppLog("error", "search.request.failed", {
      query: normalizedQuery,
      ...errorFields(error),
      durationMs: Date.now() - startedAt
    });
    return NextResponse.json({ error: "搜索失败，请稍后重试。" }, { status: 502 });
  }
}
