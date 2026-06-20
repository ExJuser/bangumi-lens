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
  const points = episodes
    .map((episode) => ({ episode, value: readValue(episode) }))
    .filter((point): point is { episode: SeasonTrendEpisode; value: number } => typeof point.value === "number");
  const peak = points.reduce<(typeof points)[number] | undefined>(
    (currentPeak, point) => (!currentPeak || point.value > currentPeak.value ? point : currentPeak),
    undefined
  );

  return {
    first: points[0]?.value,
    latest: points[points.length - 1]?.value,
    peak: peak?.value,
    peakEpisodeLabel: peak?.episode.label,
    direction: getTrendDirection(points.map((point) => point.value))
  };
}

function itemHeat(item: ReportItem, episode: SeasonTrendEpisode) {
  const quoteReactionCount =
    item.quotes?.reduce(
      (sum, quote) => sum + (quote.reactions?.reduce((reactionSum, reaction) => reactionSum + reaction.count, 0) || 0),
      0
    ) || 0;
  return episode.discussionHeat + item.sourceCommentIds.length * 12 + quoteReactionCount;
}

function collectPoints(
  reports: AnalyzeReport[],
  episodesById: Map<string, SeasonTrendEpisode>,
  readItems: (report: AnalyzeReport) => ReportItem[],
  filterItem?: (item: ReportItem) => boolean
) {
  return reports
    .flatMap((report) => {
      const episode = episodesById.get(report.meta.episodeId);
      if (!episode) return [];
      return readItems(report)
        .filter((item) => !filterItem || filterItem(item))
        .map((item) => ({
          title: item.title,
          summary: item.summary,
          episodeId: report.meta.episodeId,
          episodeLabel: episode.label,
          heat: itemHeat(item, episode)
        }));
    })
    .sort((a, b) => b.heat - a.heat)
    .slice(0, 8);
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
  const directMatches = subjectId ? reports.filter((report) => report.meta.subjectId === subjectId) : [];
  if (directMatches.length > 0) return directMatches;

  const normalizedSubjectName = subjectName?.trim();
  if (!normalizedSubjectName) return [];
  return reports.filter((report) => normalizeSubjectName(report) === normalizedSubjectName);
}

export function buildSeasonTrendPayload(
  savedReports: SavedReportLike[],
  subjectId?: string,
  subjectName?: string
): SeasonTrendPayload {
  const reports = findSubjectReports(
    savedReports.map((item) => item.report).filter(Boolean),
    subjectId,
    subjectName
  ).sort((a, b) => {
    const episodeDiff = getEpisodeSortValue(a) - getEpisodeSortValue(b);
    if (episodeDiff !== 0) return episodeDiff;
    return new Date(a.generatedAt || 0).getTime() - new Date(b.generatedAt || 0).getTime();
  });

  const resolvedSubjectName = reports[0] ? normalizeSubjectName(reports[0]) : subjectName?.trim() || "未分类作品";
  const episodeTotal = reports.find((report) => typeof report.meta.episodeTotal === "number")?.meta.episodeTotal;
  const requiredReportCount = getRequiredReportCount(episodeTotal);
  const episodes = reports.map((report) => {
    const participantCount = report.stats.participantCount ?? report.stats.commentCount;
    const discussionHeat = report.stats.commentCount + report.stats.replyCount + report.stats.reactionCount;

    return {
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
  });
  const episodesById = new Map(episodes.map((episode) => [episode.id, episode]));
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
