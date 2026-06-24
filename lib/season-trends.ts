import type { AnalyzeReport, ReportItem } from "@/lib/types";

export type SeasonTrendEpisode = {
  id: string;
  url: string;
  label: string;
  title: string;
  sortValue: number;
  episodeNumber?: number;
  episodeSort?: number;
  ratingAverage?: number;
  ratingVoteCount?: number;
  commentCount: number;
  replyCount: number;
  reactionCount: number;
  participantCount: number;
  discussionHeat: number;
};

export type SeasonTrendPoint = {
  title: string;
  summary: string;
  episodeId: string;
  episodeLabel: string;
  heat: number;
};

export type SeasonTrendDirection = "rising" | "falling" | "stable" | "unknown";

export type SeasonTrendMetricSummary = {
  first?: number;
  latest?: number;
  peak?: number;
  peakEpisodeLabel?: string;
  direction: SeasonTrendDirection;
};

export type SeasonTrendPayload = {
  subjectId?: string;
  subjectName: string;
  episodeTotal?: number;
  savedReportCount: number;
  requiredReportCount: number;
  missingReportCount: number;
  available: boolean;
  episodes: SeasonTrendEpisode[];
  metrics: {
    rating: SeasonTrendMetricSummary;
    comments: SeasonTrendMetricSummary;
    heat: SeasonTrendMetricSummary;
  };
  resonancePoints: SeasonTrendPoint[];
  controversyPoints: SeasonTrendPoint[];
  localSummary: string;
};

type SavedReportLike = {
  id?: string;
  savedAt?: string;
  report: AnalyzeReport;
};

const CONTROVERSY_KEYWORDS = [
  "争议",
  "分歧",
  "质疑",
  "不满",
  "失望",
  "吐槽",
  "批评",
  "割裂",
  "崩",
  "尬",
  "拖",
  "问题",
  "反感",
  "看不懂",
  "吵"
];

function normalizeSubjectName(report: AnalyzeReport) {
  return report.meta.subjectTitleCn?.trim() || report.meta.subjectTitle?.trim() || "未分类作品";
}

function getEpisodeSortValue(report: AnalyzeReport) {
  if (typeof report.meta.episodeSort === "number") return report.meta.episodeSort;
  if (typeof report.meta.episodeNumber === "number") return report.meta.episodeNumber;
  const numericId = Number(report.meta.episodeId);
  return Number.isFinite(numericId) ? numericId : Number.MAX_SAFE_INTEGER;
}

function formatEpisodeNumber(value?: number) {
  if (typeof value !== "number") return "";
  return Number.isInteger(value) ? String(value) : String(value).replace(/\.0$/, "");
}

function getEpisodeLabel(report: AnalyzeReport) {
  const episodeNumber = report.meta.episodeSort ?? report.meta.episodeNumber;
  const formattedNumber = formatEpisodeNumber(episodeNumber);
  return formattedNumber ? `第 ${formattedNumber} 话` : report.meta.title;
}

function getRequiredReportCount(episodeTotal?: number) {
  return typeof episodeTotal === "number" && episodeTotal > 0 ? Math.ceil(episodeTotal / 2) : 2;
}

function getTrendDirection(values: number[]): SeasonTrendDirection {
  if (values.length < 2) return "unknown";
  const first = values[0];
  const latest = values[values.length - 1];
  if (!Number.isFinite(first) || !Number.isFinite(latest)) return "unknown";
  const threshold = Math.max(Math.abs(first) * 0.05, 0.5);
  if (latest - first > threshold) return "rising";
  if (first - latest > threshold) return "falling";
  return "stable";
}

function summarizeMetric(episodes: SeasonTrendEpisode[], readValue: (episode: SeasonTrendEpisode) => number | undefined) {
  let first: number | undefined;
  let latest: number | undefined;
  let peak: number | undefined;
  let peakEpisodeLabel: string | undefined;
  let valueCount = 0;

  for (const episode of episodes) {
    const value = readValue(episode);
    if (typeof value !== "number") continue;

    if (valueCount === 0) first = value;
    latest = value;
    valueCount += 1;

    if (typeof peak !== "number" || value > peak) {
      peak = value;
      peakEpisodeLabel = episode.label;
    }
  }

  return {
    first,
    latest,
    peak,
    peakEpisodeLabel,
    direction: getTrendDirectionFromEndpoints(first, latest, valueCount)
  };
}

function getTrendDirectionFromEndpoints(first: number | undefined, latest: number | undefined, count: number): SeasonTrendDirection {
  if (count < 2) return "unknown";
  if (!Number.isFinite(first) || !Number.isFinite(latest)) return "unknown";
  const firstValue = first as number;
  const latestValue = latest as number;
  const threshold = Math.max(Math.abs(firstValue) * 0.05, 0.5);
  if (latestValue - firstValue > threshold) return "rising";
  if (firstValue - latestValue > threshold) return "falling";
  return "stable";
}

function itemHeat(item: ReportItem, episode: SeasonTrendEpisode) {
  return episode.discussionHeat + item.sourceCommentIds.length * 12;
}

function collectPoints(
  reports: AnalyzeReport[],
  episodesById: Map<string, SeasonTrendEpisode>,
  readItems: (report: AnalyzeReport) => ReportItem[],
  filterItem?: (item: ReportItem) => boolean
) {
  const points: SeasonTrendPoint[] = [];

  for (const report of reports) {
    const episode = episodesById.get(report.meta.episodeId);
    if (!episode) continue;

    for (const item of readItems(report)) {
      if (filterItem && !filterItem(item)) continue;

      const point = {
        title: item.title,
        summary: item.summary,
        episodeId: report.meta.episodeId,
        episodeLabel: episode.label,
        heat: itemHeat(item, episode)
      };
      let insertAt = points.length;
      while (insertAt > 0 && points[insertAt - 1].heat < point.heat) {
        insertAt -= 1;
      }

      if (insertAt >= 8) continue;
      points.splice(insertAt, 0, point);
      if (points.length > 8) points.pop();
    }
  }

  return points;
}

function isControversyItem(item: ReportItem) {
  const text = `${item.title} ${item.summary}`;
  return CONTROVERSY_KEYWORDS.some((keyword) => text.includes(keyword));
}

function getLocalSummary(payload: Omit<SeasonTrendPayload, "localSummary">) {
  if (!payload.available) {
    return `本地已保存 ${payload.savedReportCount} 集报告，至少需要 ${payload.requiredReportCount} 集才能生成可靠的整季趋势。`;
  }

  const latest = payload.episodes[payload.episodes.length - 1];
  const heatPeak = payload.metrics.heat.peakEpisodeLabel ? `讨论峰值出现在${payload.metrics.heat.peakEpisodeLabel}` : "讨论峰值暂不明确";
  const ratingText =
    typeof payload.metrics.rating.latest === "number"
      ? `最新单集评分 ${payload.metrics.rating.latest.toFixed(1)}`
      : "最新单集评分暂缺";
  const resonanceText = payload.resonancePoints[0]
    ? `主要共鸣集中在「${payload.resonancePoints[0].title}」`
    : "共鸣点还没有形成稳定聚类";
  const controversyText = payload.controversyPoints[0]
    ? `争议点以「${payload.controversyPoints[0].title}」最突出`
    : "目前没有明显高频争议点";

  return `截至${latest.label}，本地报告覆盖 ${payload.savedReportCount} 集，${ratingText}，${heatPeak}。${resonanceText}，${controversyText}。`;
}

function findSubjectReports(reports: AnalyzeReport[], subjectId?: string, subjectName?: string) {
  const directMatches: AnalyzeReport[] = [];
  if (subjectId) {
    for (const report of reports) {
      if (report.meta.subjectId === subjectId) {
        directMatches.push(report);
      }
    }
  }
  if (directMatches.length > 0) return directMatches;

  const normalizedSubjectName = subjectName?.trim();
  if (!normalizedSubjectName) return [];

  const nameMatches: AnalyzeReport[] = [];
  for (const report of reports) {
    if (normalizeSubjectName(report) === normalizedSubjectName) {
      nameMatches.push(report);
    }
  }
  return nameMatches;
}

function getFinalKnownEpisodeSort(reports: AnalyzeReport[]) {
  let finalKnownEpisodeSort: number | undefined;

  for (const report of reports) {
    if (report.meta.nextEpisodeId !== null) continue;
    const episodeSort = report.meta.episodeSort ?? report.meta.episodeNumber;
    if (typeof episodeSort !== "number" || episodeSort <= 0) continue;
    if (typeof finalKnownEpisodeSort !== "number" || episodeSort > finalKnownEpisodeSort) {
      finalKnownEpisodeSort = episodeSort;
    }
  }

  return finalKnownEpisodeSort;
}

function resolveEpisodeTotal(reports: AnalyzeReport[], overrideEpisodeTotal?: number) {
  if (typeof overrideEpisodeTotal === "number" && overrideEpisodeTotal > 0) return overrideEpisodeTotal;

  const reportedEpisodeTotal = reports.find((report) => typeof report.meta.episodeTotal === "number")?.meta.episodeTotal;
  const finalKnownEpisodeSort = getFinalKnownEpisodeSort(reports);
  if (
    typeof finalKnownEpisodeSort === "number" &&
    (typeof reportedEpisodeTotal !== "number" || reportedEpisodeTotal > finalKnownEpisodeSort)
  ) {
    return finalKnownEpisodeSort;
  }

  return reportedEpisodeTotal;
}

export function buildSeasonTrendPayload(
  savedReports: SavedReportLike[],
  subjectId?: string,
  subjectName?: string,
  options: { episodeTotal?: number } = {}
): SeasonTrendPayload {
  const allReports: AnalyzeReport[] = [];
  for (const item of savedReports) {
    if (item.report) {
      allReports.push(item.report);
    }
  }

  const reports = findSubjectReports(
    allReports,
    subjectId,
    subjectName
  ).sort((a, b) => {
    const episodeDiff = getEpisodeSortValue(a) - getEpisodeSortValue(b);
    if (episodeDiff !== 0) return episodeDiff;
    return new Date(a.generatedAt || 0).getTime() - new Date(b.generatedAt || 0).getTime();
  });

  const resolvedSubjectName = reports[0] ? normalizeSubjectName(reports[0]) : subjectName?.trim() || "未分类作品";
  const episodeTotal = resolveEpisodeTotal(reports, options.episodeTotal);
  const requiredReportCount = getRequiredReportCount(episodeTotal);
  const episodes: SeasonTrendEpisode[] = [];
  const episodesById = new Map<string, SeasonTrendEpisode>();

  for (const report of reports) {
    const participantCount = report.stats.participantCount ?? report.stats.commentCount;
    const discussionHeat = report.stats.commentCount + report.stats.replyCount + report.stats.reactionCount;

    const episode = {
      id: report.meta.episodeId,
      url: report.meta.url,
      label: getEpisodeLabel(report),
      title: report.meta.episodeTitleCn || report.meta.title,
      sortValue: getEpisodeSortValue(report),
      episodeNumber: report.meta.episodeNumber,
      episodeSort: report.meta.episodeSort,
      ratingAverage: report.meta.rating?.average,
      ratingVoteCount: report.meta.rating?.voteCount,
      commentCount: report.stats.commentCount,
      replyCount: report.stats.replyCount,
      reactionCount: report.stats.reactionCount,
      participantCount,
      discussionHeat
    };
    episodes.push(episode);
    episodesById.set(episode.id, episode);
  }

  const available = episodes.length >= requiredReportCount;
  const basePayload = {
    subjectId,
    subjectName: resolvedSubjectName,
    episodeTotal,
    savedReportCount: episodes.length,
    requiredReportCount,
    missingReportCount: Math.max(0, requiredReportCount - episodes.length),
    available,
    episodes,
    metrics: {
      rating: summarizeMetric(episodes, (episode) => episode.ratingAverage),
      comments: summarizeMetric(episodes, (episode) => episode.commentCount),
      heat: summarizeMetric(episodes, (episode) => episode.discussionHeat)
    },
    resonancePoints: available
      ? collectPoints(reports, episodesById, (report) => report.resonancePoints || [])
      : [],
    controversyPoints: available
      ? collectPoints(
          reports,
          episodesById,
          (report) => report.discussionHotspots || [],
          isControversyItem
        )
      : []
  };

  return {
    ...basePayload,
    localSummary: getLocalSummary(basePayload)
  };
}
