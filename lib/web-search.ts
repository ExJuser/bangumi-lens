import * as cheerio from "cheerio";
import type { EpisodeMeta } from "@/lib/types";
import { getBangumiUserAgent } from "@/lib/bangumi-api";
import { configureServerProxy } from "@/lib/proxy";

export type WebSearchResult = {
  kind: "episode" | "production";
  title: string;
  snippet: string;
  url?: string;
};

function normalizeText(text: string) {
  return text.replace(/\s+/g, " ").trim();
}

function subjectTitle(meta: EpisodeMeta) {
  return meta.subjectTitleCn || meta.subjectTitle || "";
}

function buildEpisodeQuery(meta: EpisodeMeta) {
  return [subjectTitle(meta), meta.title, "episode", "recap", "剧情", "本集"].filter(Boolean).join(" ");
}

function buildProductionQuery(meta: EpisodeMeta) {
  return [
    subjectTitle(meta),
    meta.title,
    "staff",
    "official",
    "director",
    "script",
    "storyboard",
    "animation director",
    "key animator",
    "cast",
    "CV"
  ]
    .filter(Boolean)
    .join(" ");
}

function decodeDuckDuckGoUrl(rawUrl?: string) {
  if (!rawUrl) return undefined;

  try {
    const url = new URL(rawUrl, "https://duckduckgo.com");
    return url.searchParams.get("uddg") || url.href;
  } catch {
    return rawUrl;
  }
}

async function searchDuckDuckGo(query: string, kind: WebSearchResult["kind"], limit: number) {
  if (!query) return [];

  try {
    const response = await fetch(`https://duckduckgo.com/html/?q=${encodeURIComponent(query)}`, {
      headers: {
        "User-Agent": getBangumiUserAgent(),
        Accept: "text/html,application/xhtml+xml"
      },
      next: { revalidate: 60 * 60 }
    });

    if (!response.ok) return [];

    const $ = cheerio.load(await response.text());
    const results: WebSearchResult[] = [];

    $(".result").each((_, element) => {
      const $element = $(element);
      const title = normalizeText($element.find(".result__a").first().text());
      const snippet = normalizeText($element.find(".result__snippet").first().text());
      const url = decodeDuckDuckGoUrl($element.find(".result__a").first().attr("href"));

      if (title && snippet) {
        results.push({
          kind,
          title: title.slice(0, 140),
          snippet: snippet.slice(0, 320),
          url
        });
      }
    });

    return results.slice(0, limit);
  } catch {
    return [];
  }
}

export async function searchEpisodeWebContext(meta: EpisodeMeta): Promise<WebSearchResult[]> {
  configureServerProxy();

  const [episodeResults, productionResults] = await Promise.all([
    searchDuckDuckGo(buildEpisodeQuery(meta), "episode", 5),
    searchDuckDuckGo(buildProductionQuery(meta), "production", 5)
  ]);

  const uniqueResults = new Map<string, WebSearchResult>();
  [...episodeResults, ...productionResults].forEach((result) => {
    uniqueResults.set(result.url || `${result.kind}:${result.title}`, result);
  });

  return [...uniqueResults.values()].slice(0, 8);
}
