import * as cheerio from "cheerio";
import type { Element } from "domhandler";
import type {
  BangumiComment,
  BangumiReaction,
  BangumiReply,
  EpisodeAvailabilitySignals,
  EpisodeRating,
  ScrapedEpisode
} from "@/lib/types";
import { createBangumiApiHeaders, createBangumiPageHeaders, getBangumiUserAgent } from "@/lib/bangumi-api";
import { configureServerProxy } from "@/lib/proxy";
import { parseBangumiEpisodeUrl } from "@/lib/url";

function normalizeText(text: string) {
  return text.replace(/\s+/g, " ").trim();
}

function textFrom($: cheerio.CheerioAPI, selectors: string[]) {
  for (const selector of selectors) {
    const value = normalizeText($(selector).first().text());
    if (value) return value;
  }

  return "";
}

function parseEpisodeTitleFromDocumentTitle(documentTitle: string, subjectTitle: string) {
  const normalizedTitle = normalizeText(documentTitle);
  if (!normalizedTitle) return "";

  const slashIndex = normalizedTitle.lastIndexOf(" / ");
  const episodeTitle = slashIndex >= 0 ? normalizedTitle.slice(0, slashIndex) : normalizedTitle;
  const cleanedEpisodeTitle = episodeTitle.replace(/^ep\.\s*\d+\s*/i, "").trim();

  if (!cleanedEpisodeTitle || cleanedEpisodeTitle === subjectTitle) {
    return "";
  }

  return cleanedEpisodeTitle;
}

function parseEpisodeNumberFromDocumentTitle(documentTitle: string) {
  const normalizedTitle = normalizeText(documentTitle);
  const episodePart = normalizedTitle.split(" / ")[0] || normalizedTitle;
  const match = episodePart.match(/^ep\.\s*(\d+(?:\.\d+)?)/i);
  if (!match) return undefined;

  const episodeNumber = Number(match[1]);
  return Number.isFinite(episodeNumber) ? episodeNumber : undefined;
}

type SubjectInfo = {
  titleCn?: string;
  episodeTotal?: number;
  subjectRating?: EpisodeRating;
  episodes?: EpisodeAvailabilitySignals[];
};

type BangumiEpisodeApiItem = {
  id?: unknown;
  sort?: unknown;
  type?: unknown;
  name?: unknown;
  name_cn?: unknown;
  airdate?: unknown;
  duration?: unknown;
  comment?: unknown;
};

type EpisodeNavigationInfo = {
  episodeSort?: number;
  previousEpisodeId?: string | null;
  nextEpisodeId?: string | null;
  episodeTitleCn?: string;
  currentEpisode?: EpisodeAvailabilitySignals;
  previousEpisode?: EpisodeAvailabilitySignals | null;
  nextEpisode?: EpisodeAvailabilitySignals | null;
};

function parseSubjectId($: cheerio.CheerioAPI) {
  const href = $("#headerSubject a, .headerSubject a, h1.nameSingle a").first().attr("href") || "";
  return href.match(/subject\/(\d+)/)?.[1];
}

export async function fetchBangumiSubjectInfo(
  subjectId?: string,
  options: { includeEpisodes?: boolean } = {}
): Promise<SubjectInfo> {
  if (!subjectId) return {};

  try {
    const response = await fetch(`https://api.bgm.tv/v0/subjects/${subjectId}`, {
      headers: createBangumiApiHeaders(),
      next: { revalidate: 60 * 60 * 24 }
    });

    if (!response.ok) return {};

    const subject = (await response.json()) as {
      name?: unknown;
      name_cn?: unknown;
      eps?: unknown;
      total_episodes?: unknown;
      rating?: unknown;
    };
    const titleCn = typeof subject.name_cn === "string" && subject.name_cn.trim() ? subject.name_cn.trim() : undefined;
    const rawEpisodeTotal = Number(subject.eps || subject.total_episodes);
    const episodeTotal = Number.isFinite(rawEpisodeTotal) && rawEpisodeTotal > 0 ? rawEpisodeTotal : undefined;
    const subjectRating = summarizeSubjectRating(subject.rating);
    const subjectInfo: SubjectInfo = { titleCn, episodeTotal, subjectRating };
    if (options.includeEpisodes) {
      subjectInfo.episodes = await fetchSubjectMainEpisodes(subjectId, episodeTotal);
    }
    return subjectInfo;
  } catch {
    return {};
  }
}

export async function fetchBangumiSubjectTitleCn(subjectId: string) {
  configureServerProxy();

  try {
    const response = await fetch(`https://api.bgm.tv/v0/subjects/${encodeURIComponent(subjectId)}`, {
      headers: createBangumiApiHeaders(),
      next: { revalidate: 60 * 60 * 24 }
    });

    if (!response.ok) return undefined;

    const subject = (await response.json()) as { name_cn?: unknown };
    return typeof subject.name_cn === "string" && subject.name_cn.trim() ? subject.name_cn.trim() : undefined;
  } catch {
    return undefined;
  }
}

function summarizeSubjectRating(rating: unknown): EpisodeRating | undefined {
  if (!rating || typeof rating !== "object") return undefined;

  const payload = rating as {
    count?: unknown;
    score?: unknown;
    total?: unknown;
  };
  if (!payload.count || typeof payload.count !== "object") return undefined;

  const votes = Object.fromEntries(
    Object.entries(payload.count as Record<string, unknown>)
      .map(([score, count]) => [score, Number(count)] as const)
      .filter(([score, count]) => /^\d+$/.test(score) && Number.isFinite(count) && count > 0)
  );
  const voteCountFromDistribution = Object.values(votes).reduce((sum, count) => sum + count, 0);
  const voteCount = Number(payload.total) || voteCountFromDistribution;
  if (!Number.isFinite(voteCount) || voteCount <= 0 || voteCountFromDistribution === 0) return undefined;

  const modeEntry = Object.entries(votes).reduce((best, current) => (current[1] > best[1] ? current : best));
  const score = Number(payload.score);
  const fallbackAverage =
    Object.entries(votes).reduce((sum, [ratingScore, count]) => sum + Number(ratingScore) * count, 0) /
    voteCountFromDistribution;

  return {
    average: Number((Number.isFinite(score) && score > 0 ? score : fallbackAverage).toFixed(2)),
    voteCount,
    modeScore: Number(modeEntry[0]),
    votes
  };
}

function isWithinMainEpisodeTotal(episode: EpisodeAvailabilitySignals, episodeTotal?: number) {
  if (typeof episodeTotal !== "number" || episodeTotal <= 0) return true;
  return typeof episode.sort !== "number" || episode.sort <= episodeTotal;
}

async function fetchSubjectMainEpisodes(subjectId: string, episodeTotal?: number): Promise<EpisodeAvailabilitySignals[]> {
  const episodes: BangumiEpisodeApiItem[] = [];
  const limit = 100;
  let offset = 0;

  while (offset < 1000) {
    const response = await fetch(
      `https://api.bgm.tv/v0/episodes?subject_id=${subjectId}&type=0&limit=${limit}&offset=${offset}`,
      {
        headers: createBangumiApiHeaders(),
        next: { revalidate: 60 * 60 * 6 }
      }
    );

    if (!response.ok) return [];

    const payload = (await response.json()) as { data?: BangumiEpisodeApiItem[]; total?: unknown };
    const pageEpisodes = Array.isArray(payload.data) ? payload.data : [];
    episodes.push(...pageEpisodes);

    const total = Number(payload.total);
    if (pageEpisodes.length < limit || (Number.isFinite(total) && episodes.length >= total)) break;
    offset += limit;
  }

  return episodes
    .map(normalizeEpisodeApiItem)
    .filter((episode): episode is EpisodeAvailabilitySignals => Boolean(episode))
    .filter((episode) => isWithinMainEpisodeTotal(episode, episodeTotal))
    .sort((a, b) => (a.sort ?? Number.MAX_SAFE_INTEGER) - (b.sort ?? Number.MAX_SAFE_INTEGER) || Number(a.id) - Number(b.id));
}

function normalizeOptionalString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function normalizeOptionalAirdate(value: unknown) {
  const normalized = normalizeOptionalString(value);
  if (!normalized || normalized === "0000-00-00") return null;
  return normalized;
}

function normalizeOptionalNumber(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
}

function normalizeEpisodeApiItem(episode: BangumiEpisodeApiItem): EpisodeAvailabilitySignals | undefined {
  const id = typeof episode.id === "number" || typeof episode.id === "string" ? String(episode.id) : undefined;
  if (!id) return undefined;

  const sort = normalizeOptionalNumber(episode.sort);
  return {
    id,
    sort,
    title: normalizeOptionalString(episode.name),
    titleCn: normalizeOptionalString(episode.name_cn),
    airdate: normalizeOptionalAirdate(episode.airdate),
    duration: normalizeOptionalString(episode.duration),
    commentCount: normalizeOptionalNumber(episode.comment)
  };
}

async function fetchEpisodeNavigationInfo(
  subjectId: string | undefined,
  episodeId: string,
  episodeTotal?: number
): Promise<EpisodeNavigationInfo> {
  if (!subjectId) return {};

  try {
    const mainEpisodes = await fetchSubjectMainEpisodes(subjectId, episodeTotal);
    const currentIndex = mainEpisodes.findIndex((episode) => episode.id === episodeId);
    if (currentIndex < 0) return {};
    const currentEpisode = mainEpisodes[currentIndex];

    return {
      episodeSort: currentEpisode.sort,
      previousEpisodeId: mainEpisodes[currentIndex - 1]?.id ?? null,
      nextEpisodeId: mainEpisodes[currentIndex + 1]?.id ?? null,
      episodeTitleCn: currentEpisode.titleCn,
      currentEpisode,
      previousEpisode: mainEpisodes[currentIndex - 1] ?? null,
      nextEpisode: mainEpisodes[currentIndex + 1] ?? null
    };
  } catch {
    return {};
  }
}

export async function fetchBangumiEpisodeTitleCn(episodeId: string) {
  configureServerProxy();

  try {
    const response = await fetch(`https://api.bgm.tv/v0/episodes/${encodeURIComponent(episodeId)}`, {
      headers: createBangumiApiHeaders(),
      next: { revalidate: 60 * 60 * 24 }
    });

    if (!response.ok) return undefined;

    const episode = (await response.json()) as BangumiEpisodeApiItem;
    return typeof episode.name_cn === "string" && episode.name_cn.trim() ? episode.name_cn.trim() : undefined;
  } catch {
    return undefined;
  }
}

function summarizeEpisodeRating(votes: Record<string, number>): EpisodeRating | undefined {
  const entries = Object.entries(votes)
    .map(([score, count]) => [Number(score), Number(count)] as const)
    .filter(([score, count]) => Number.isFinite(score) && Number.isFinite(count) && count > 0);

  const voteCount = entries.reduce((sum, [, count]) => sum + count, 0);
  if (voteCount === 0) return undefined;

  const scoreSum = entries.reduce((sum, [score, count]) => sum + score * count, 0);
  const [modeScore] = entries.reduce(
    (best, current) => (current[1] > best[1] ? current : best),
    entries[0]
  );

  return {
    average: Number((scoreSum / voteCount).toFixed(2)),
    voteCount,
    modeScore,
    votes: Object.fromEntries(entries.map(([score, count]) => [String(score), count]))
  };
}

async function fetchEpisodeRating(subjectId: string | undefined, episodeId: string): Promise<EpisodeRating | undefined> {
  if (!subjectId) return undefined;

  try {
    const response = await fetch(
      `https://bgm-ep-ratings.deno.dev/api/v1/subjects/${subjectId}/episodes/${episodeId}/ratings`,
      {
        headers: {
          "User-Agent": getBangumiUserAgent(),
          Accept: "application/json"
        },
        next: { revalidate: 60 * 10 }
      }
    );

    if (!response.ok) return undefined;

    const payload = (await response.json()) as ["ok", { votes?: Record<string, number> }] | ["error", string, string];
    if (payload[0] !== "ok" || !payload[1].votes) return undefined;

    return summarizeEpisodeRating(payload[1].votes);
  } catch {
    return undefined;
  }
}

function countFromText(text: string, patterns: RegExp[]) {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) return Number(match[1]);
  }

  return 0;
}

function extractCount($node: cheerio.Cheerio<Element>, selectors: string[]) {
  for (const selector of selectors) {
    const text = normalizeText($node.find(selector).text());
    const count = countFromText(text, [/(\d+)/]);
    if (count) return count;
  }

  return 0;
}

function extractReactionLabel($reaction: cheerio.Cheerio<Element>) {
  const image = $reaction.is("img") ? $reaction : $reaction.find("img").first();
  const rawLabel =
    normalizeText(image.attr("alt") || "") ||
    normalizeText(image.attr("title") || "") ||
    normalizeText($reaction.attr("title") || "") ||
    normalizeText($reaction.attr("aria-label") || "") ||
    "";
  const label = rawLabel.replace(/^(表情|emoji|reaction)[:：\s-]*/i, "").trim();

  if (!label || /^\d+$/.test(label) || label.length > 8) {
    return "表情";
  }

  return label;
}

function extractReactions(
  $: cheerio.CheerioAPI,
  $node: cheerio.Cheerio<Element>
): BangumiReaction[] {
  const reactions = new Map<string, number>();
  const reactionNodes = $node
    .find(".reactions img, .emoji img, .reactions .item, .emoji .item")
    .toArray()
    .filter(isElement);

  reactionNodes.forEach((node) => {
    const $reaction = $(node);
    const containerText = normalizeText($reaction.parent().text()) || normalizeText($reaction.text());
    const count = countFromText(containerText, [/(\d+)/]) || 1;
    const label = extractReactionLabel($reaction);
    reactions.set(label, (reactions.get(label) || 0) + count);
  });

  const parsedReactions = [...reactions.entries()]
    .map(([label, count]) => ({ label, count }))
    .filter((reaction) => reaction.count > 0 && reaction.label !== "表情")
    .slice(0, 6);

  return parsedReactions;
}

function extractId($node: cheerio.Cheerio<Element>, fallback: string) {
  const id = $node.attr("id") || $node.attr("data-id") || $node.find("[id]").first().attr("id");
  return id ? id.replace(/^post_?/, "") : fallback;
}

function firstTextFrom($: cheerio.CheerioAPI, $node: cheerio.Cheerio<Element>, selectors: string[]) {
  for (const selector of selectors) {
    const value = normalizeText(
      $node
        .find(selector)
        .toArray()
        .map((node) => $(node).text())
        .find((text) => normalizeText(text))
        || ""
    );
    if (value) return value;
  }

  return "";
}

function extractAuthor($: cheerio.CheerioAPI, $node: cheerio.Cheerio<Element>) {
  return (
    firstTextFrom($, $node, [
      "a[href^='/user/']",
      "a[href*='bangumi.tv/user/']",
      "a[href*='bgm.tv/user/']",
      ".user a",
      ".name a",
      ".user",
      ".name"
    ]) || undefined
  );
}

function extractAuthorId($node: cheerio.Cheerio<Element>) {
  const href = $node
    .find("a[href^='/user/'], a[href*='bangumi.tv/user/'], a[href*='bgm.tv/user/']")
    .toArray()
    .map((node) => node.attribs?.href || "")
    .find((value) => /(?:^|\/)user\/[^/?#]+/.test(value));
  const userId = href?.match(/(?:^|\/)user\/([^/?#]+)/)?.[1];
  return userId ? decodeURIComponent(userId) : undefined;
}

function isElement(node: unknown): node is Element {
  return Boolean(node && typeof node === "object" && "type" in node && (node as { type?: string }).type === "tag");
}

function extractReply($: cheerio.CheerioAPI, node: Element, parentId: string, index: number): BangumiReply {
  const $node = $(node);
  const text =
    normalizeText($node.find(".message, .reply_content, .text, .content, .cmt_sub_content").first().text()) ||
    normalizeText($node.clone().children(".avatar, .user, .time, .action, .actions").remove().end().text());

  return {
    id: `${parentId}-reply-${index + 1}`,
    author: extractAuthor($, $node),
    authorId: extractAuthorId($node),
    text,
    reactionCount: extractCount($node, [".likes", ".reactions", ".emoji", ".tip_j"])
  };
}

function extractComment($: cheerio.CheerioAPI, node: Element, index: number): BangumiComment | null {
  const $node = $(node);
  const id = extractId($node, `comment-${index + 1}`);
  const replies = $node
    .find(".reply, .sub_reply, .topic_sub_reply, .cmt_sub, .inner .row_reply")
    .toArray()
    .map((replyNode, replyIndex) => extractReply($, replyNode, id, replyIndex))
    .filter((reply) => reply.text.length > 0);

  const cloned = $node.clone();
  cloned.find(".reply, .sub_reply, .topic_sub_reply, .cmt_sub, .inner .row_reply, script, style").remove();

  const text =
    normalizeText(cloned.find(".message, .content, .text, .cmt_content, .reply_content").first().text()) ||
    normalizeText(cloned.text());

  if (!text || text.length < 2) return null;

  const nodeText = normalizeText($node.text());
  const replyCount =
    replies.length ||
    extractCount($node, [".reply_count", ".sub_reply_count", ".replies"]) ||
    countFromText(nodeText, [/(\d+)\s*条回复/, /回复\s*\(?(\d+)\)?/]);
  const reactionCount =
    extractCount($node, [".reactions", ".emoji", ".likes", ".tip_j"]) ||
    countFromText(nodeText, [/(\d+)\s*个?表情/, /表情\s*\(?(\d+)\)?/]);
  const likeCount = countFromText(nodeText, [/(\d+)\s*个?赞/, /赞\s*\(?(\d+)\)?/]);
  const reactions = extractReactions($, $node);

  return {
    id,
    floor: $node.attr("data-floor") || $node.find(".floor, .no").first().text().trim() || undefined,
    author: extractAuthor($, $node),
    authorId: extractAuthorId($node),
    text: text.slice(0, 1600),
    createdAt: normalizeText($node.find("time, .time, .date").first().text()) || undefined,
    replyCount,
    reactionCount,
    likeCount,
    reactions,
    replies
  };
}

function parseComments($: cheerio.CheerioAPI) {
  const selectors = [
    "#comment_list > .row_reply",
    "#comment_list .item",
    ".topic_list .row_reply",
    ".row_reply",
    ".comment",
    "li[id^='post_']"
  ];

  for (const selector of selectors) {
    const comments = $(selector)
      .toArray()
      .filter(isElement)
      .map((node, index) => extractComment($, node, index))
      .filter((comment): comment is BangumiComment => Boolean(comment));

    if (comments.length > 0) {
      const unique = new Map<string, BangumiComment>();
      comments.forEach((comment) => unique.set(comment.id, comment));
      return [...unique.values()];
    }
  }

  return [];
}

function parseEpisode(
  html: string,
  normalizedUrl: string,
  episodeId: string,
  subjectId?: string,
  subjectInfo: SubjectInfo = {},
  rating?: EpisodeRating,
  navigationInfo: EpisodeNavigationInfo = {}
): ScrapedEpisode {
  const $ = cheerio.load(html);
  const documentTitle = textFrom($, ["title"]);
  const subjectTitle =
    textFrom($, ["#headerSubject a", ".headerSubject a", "h1.nameSingle a", "h1.nameSingle", "h1"]) ||
    undefined;
  const title =
    parseEpisodeTitleFromDocumentTitle(documentTitle, subjectTitle || "") ||
    textFrom($, [".episodeTitle", ".epTitle", ".title"]) ||
    `Bangumi Episode ${episodeId}`;
  const episodeNumber = parseEpisodeNumberFromDocumentTitle(documentTitle);
  const summary = textFrom($, ["#columnEpB .tip", ".episodeSummary", ".summary", "#infobox"]);

  return {
    meta: {
      url: normalizedUrl,
      episodeId,
      episodeNumber,
      episodeSort: navigationInfo.episodeSort,
      previousEpisodeId: navigationInfo.previousEpisodeId,
      nextEpisodeId: navigationInfo.nextEpisodeId,
      currentEpisode: navigationInfo.currentEpisode,
      previousEpisode: navigationInfo.previousEpisode,
      nextEpisode: navigationInfo.nextEpisode,
      subjectId,
      title,
      episodeTitleCn: navigationInfo.episodeTitleCn,
      subjectTitle,
      subjectTitleCn: subjectInfo.titleCn,
      episodeTotal: subjectInfo.episodeTotal,
      rating,
      subjectRating: subjectInfo.subjectRating,
      summary: summary.slice(0, 900) || undefined
    },
    comments: parseComments($)
  };
}

export async function fetchBangumiEpisode(inputUrl: string): Promise<ScrapedEpisode> {
  configureServerProxy();

  const { normalizedUrl, episodeId } = parseBangumiEpisodeUrl(inputUrl);
  const response = await fetch(normalizedUrl, {
    headers: createBangumiPageHeaders(),
    next: { revalidate: 0 }
  });

  if (!response.ok) {
    throw new Error(`Bangumi 页面请求失败：HTTP ${response.status}`);
  }

  const html = await response.text();
  const $ = cheerio.load(html);
  const subjectId = parseSubjectId($);
  const subjectInfo = await fetchBangumiSubjectInfo(subjectId);
  const [navigationInfo, rating] = await Promise.all([
    fetchEpisodeNavigationInfo(subjectId, episodeId, subjectInfo.episodeTotal),
    fetchEpisodeRating(subjectId, episodeId)
  ]);

  return parseEpisode(html, normalizedUrl, episodeId, subjectId, subjectInfo, rating, navigationInfo);
}

export const bangumiInternals = {
  parseEpisode
};
