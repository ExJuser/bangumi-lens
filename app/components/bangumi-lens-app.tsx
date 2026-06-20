"use client";

import {
  AlertCircle,
  ArrowRight,
  BarChart3,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock,
  Trash2,
  ExternalLink,
  Eye,
  Heart,
  Home,
  History,
  LineChart,
  Loader2,
  MessageCircle,
  Moon,
  Quote,
  RefreshCw,
  Search,
  Sparkles,
  Star,
  Sun,
  ThumbsUp
} from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { type CSSProperties, type FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { getEpisodeAvailabilityWarning, type EpisodeAvailabilityWarning } from "@/lib/episode-availability";
import type { EpisodeAvailabilitySignals } from "@/lib/types";
import { ConfirmDialog } from "./confirm-dialog";

type ReportItem = {
  title: string;
  summary: string;
  quotes?: ReportQuote[] | string[];
  sourceCommentIds: string[];
};

type ReportQuote = {
  text: string;
  sourceCommentId?: string;
  reactions?: {
    label: string;
    count: number;
  }[];
};

type Report = {
  episodeSummary: string;
  opinionSummary: string;
  episodeDetails?: ReportItem[];
  productionNotes?: ReportItem[];
  discussionHotspots: ReportItem[];
  resonancePoints: ReportItem[];
  spoilerNotes: string[];
  generatedAt?: string;
  meta: {
    url: string;
    episodeId: string;
    episodeNumber?: number;
    episodeSort?: number;
    previousEpisodeId?: string | null;
    nextEpisodeId?: string | null;
    currentEpisode?: EpisodeAvailabilitySignals;
    previousEpisode?: EpisodeAvailabilitySignals | null;
    nextEpisode?: EpisodeAvailabilitySignals | null;
    subjectId?: string;
    title: string;
    episodeTitleCn?: string;
    subjectTitle?: string;
    subjectTitleCn?: string;
    episodeTotal?: number;
    rating?: {
      average: number;
      voteCount: number;
      modeScore?: number;
      votes: Record<string, number>;
    };
    subjectRating?: {
      average: number;
      voteCount: number;
      modeScore?: number;
      votes: Record<string, number>;
    };
    summary?: string;
  };
  stats: {
    commentCount: number;
    replyCount: number;
    reactionCount: number;
    participantCount?: number;
  };
};

type SavedReport = {
  id: string;
  url: string;
  savedAt: string;
  likedAt?: string;
  reportPath?: string;
  meta: Report["meta"];
  stats: Report["stats"];
  report?: Report;
};

type SeasonTrendDirection = "rising" | "falling" | "stable" | "unknown";

type SeasonTrendEpisode = {
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

type SeasonTrendPoint = {
  title: string;
  summary: string;
  episodeId: string;
  episodeLabel: string;
  heat: number;
};

type SeasonTrendMetricSummary = {
  first?: number;
  latest?: number;
  peak?: number;
  peakEpisodeLabel?: string;
  direction: SeasonTrendDirection;
};

type SeasonTrendPayload = {
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

function HoverScrollText({ className, text }: { className?: string; text: string }) {
  const viewportRef = useRef<HTMLSpanElement>(null);
  const textRef = useRef<HTMLSpanElement>(null);
  const [scrollDistance, setScrollDistance] = useState(0);

  useEffect(() => {
    const viewport = viewportRef.current;
    const textElement = textRef.current;
    if (!viewport || !textElement) return;

    function measure() {
      const currentViewport = viewportRef.current;
      const currentTextElement = textRef.current;
      if (!currentViewport || !currentTextElement) return;
      setScrollDistance(Math.max(0, currentTextElement.scrollWidth - currentViewport.clientWidth));
    }

    measure();

    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", measure);
      return () => window.removeEventListener("resize", measure);
    }

    const resizeObserver = new ResizeObserver(measure);
    resizeObserver.observe(viewport);
    resizeObserver.observe(textElement);
    return () => resizeObserver.disconnect();
  }, [text]);

  const scrollDuration = scrollDistance > 0 ? Math.max(4500, scrollDistance * 65) : 0;
  const scrollClassName = [className, "hover-scroll-text", scrollDistance > 0 ? "is-overflowing" : ""]
    .filter(Boolean)
    .join(" ");

  return (
    <span
      className={scrollClassName}
      ref={viewportRef}
      style={
        {
          "--scroll-distance": `${scrollDistance}px`,
          "--scroll-duration": `${scrollDuration}ms`
        } as CSSProperties
      }
      title={text}
    >
      <span className="hover-scroll-text-inner" ref={textRef}>
        {text}
      </span>
    </span>
  );
}

const THEME_STORAGE_KEY = "bangumi-lens-theme";
const HOME_ROUTE = "/home";
const REPORT_ROUTE_PREFIX = "/reports/";
const REPORT_STALE_THRESHOLD_MS = 15 * 24 * 60 * 60 * 1000;
type ThemeMode = "day" | "night";
type EpisodeDirection = "previous" | "next";
type MissingEpisodePrompt = {
  direction: EpisodeDirection;
  reason?: "unavailable" | "unaired";
  url?: string;
  episode?: EpisodeAvailabilitySignals;
  warning?: EpisodeAvailabilityWarning;
};
type EpisodeTitleTranslationSource = "official" | "ai";
type EpisodeTitleTranslationState = {
  status: "loading" | "ready" | "needs-ai" | "error";
  translation?: string;
  source?: EpisodeTitleTranslationSource;
  error?: string;
};
type PendingAiTitleTranslation = {
  episodeId: string;
  title: string;
  subjectTitle?: string;
  subjectTitleCn?: string;
  episodeNumber?: number;
};
type PendingReportRegeneration = {
  url: string;
  title: string;
};
type PendingAiSubjectTitleTranslation = {
  subjectId: string;
  title: string;
};
type LikeHistoryPrompt = {
  item: SavedReport;
  liked: boolean;
};

type SeasonReportGenerationItemStatus = "pending" | "running" | "completed" | "failed" | "cancelled";

type SeasonReportGenerationItem = {
  id: string;
  url: string;
  label: string;
  status: SeasonReportGenerationItemStatus;
  error?: string;
};

type SeasonReportGenerationState = {
  subjectKey: string;
  status: "running" | "completed" | "cancelled" | "failed";
  totalCount: number;
  completedCount: number;
  failedCount: number;
  initialSavedReportCount: number;
  savedReportCount: number;
  requiredReportCount: number;
  missingReportCount: number;
  currentIndex: number;
  currentLabel?: string;
  streamingText: string;
  message?: string;
  items: SeasonReportGenerationItem[];
};

type PendingSeasonReportGeneration = {
  subjectKey: string;
  subjectName: string;
  savedReportCount: number;
  episodeTotal?: number;
  candidates: SeasonReportGenerationItem[];
};

type SubjectInfo = {
  titleCn?: string;
  episodeTotal?: number;
  episodes?: EpisodeAvailabilitySignals[];
};

type SearchResult = {
  subjectId: string;
  title: string;
  titleCn?: string;
  episodeTotal?: number;
  firstEpisodeId: string;
  firstEpisodeTitle?: string;
  firstEpisodeNumber?: number;
  url: string;
};

type SearchEpisodeChoice = EpisodeAvailabilitySignals & {
  url: string;
};

type RatingSummary = NonNullable<Report["meta"]["rating"]>;

const BANGUMI_EPISODE_PATH = /^\/ep\/(\d+)\/?$/;
const BANGUMI_HOSTS = new Set(["bgm.tv", "bangumi.tv", "chii.in", "www.bgm.tv", "www.bangumi.tv", "www.chii.in"]);

function getComparableEpisodeUrl(input: string) {
  try {
    const parsedUrl = new URL(input.trim());
    const episodeMatch = parsedUrl.pathname.match(BANGUMI_EPISODE_PATH);
    if (BANGUMI_HOSTS.has(parsedUrl.hostname) && episodeMatch) {
      return `https://bgm.tv/ep/${episodeMatch[1]}`;
    }
  } catch {
    // Keep the raw value for validation in the analyze API.
  }

  return input.trim();
}

function isBangumiEpisodeUrl(input: string) {
  try {
    const parsedUrl = new URL(input.trim());
    return BANGUMI_HOSTS.has(parsedUrl.hostname) && BANGUMI_EPISODE_PATH.test(parsedUrl.pathname);
  } catch {
    return false;
  }
}

function findExistingReport(history: SavedReport[], candidateUrl: string) {
  const comparableUrl = getComparableEpisodeUrl(candidateUrl);
  return history.find((item) => {
    const itemUrl = getComparableEpisodeUrl(item.url);
    const metaUrl = getComparableEpisodeUrl(getSavedReportMeta(item).url);
    return itemUrl === comparableUrl || metaUrl === comparableUrl;
  });
}

function normalizeSearchText(text: string) {
  return text.trim().toLocaleLowerCase("zh-CN").replace(/\s+/g, " ");
}

function findHistoryByTitle(history: SavedReport[], query: string) {
  const normalizedQuery = normalizeSearchText(query);
  if (!normalizedQuery) return undefined;

  return history.find((item) => {
    const meta = getSavedReportMeta(item);
    return [meta.subjectTitleCn, meta.subjectTitle, meta.title, getHistoryEpisodeLabelFromMeta(meta)]
      .filter((value): value is string => Boolean(value))
      .some((value) => normalizeSearchText(value).includes(normalizedQuery));
  });
}

function getSearchResultTitle(result: SearchResult) {
  return result.titleCn || result.title;
}

function getSearchResultSubtitle(result: SearchResult) {
  const titles = [result.title, result.titleCn].filter(Boolean);
  return titles.length > 1 ? titles.join(" / ") : "选择作品后再选择具体话数";
}

function buildSearchEpisodeUrl(episodeId: string) {
  return `https://bgm.tv/ep/${episodeId}`;
}

function getEpisodeSortLabel(sort?: number, fallbackId?: string) {
  if (typeof sort === "number") return `第 ${formatEpisodeNumber(sort)} 话`;
  return fallbackId ? `ep.${fallbackId}` : "未知话数";
}

function getEpisodeChoiceLabel(episode: EpisodeAvailabilitySignals) {
  const episodeNumber = typeof episode.sort === "number" ? `第 ${formatEpisodeNumber(episode.sort)} 话` : `ep.${episode.id}`;
  const title = episode.titleCn || episode.title;
  return title ? `${episodeNumber} ${title}` : episodeNumber;
}

const EMPTY_PREVIEW_ITEMS = [
  {
    title: "剧情概览",
    description: "先把公开评论中的剧情信息归纳成可快速回看的短摘要。",
    icon: <Sparkles size={18} />
  },
  {
    title: "评论区观点",
    description: "拆出主流评价、分歧点和反复出现的关键词。",
    icon: <MessageCircle size={18} />
  },
  {
    title: "讨论热点",
    description: "聚合被回复、表情和点赞放大的讨论信号。",
    icon: <ThumbsUp size={18} />
  },
  {
    title: "评分参照",
    description: "把单集评分与整部条目的投票分布放在一起看。",
    icon: <Star size={18} />
  }
];

function formatMetricValue(value: number) {
  return new Intl.NumberFormat("zh-CN", {
    notation: "compact",
    maximumFractionDigits: 1
  }).format(value);
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="metric">
      <span title={String(value)}>{formatMetricValue(value)}</span>
      <p>{label}</p>
    </div>
  );
}

function RatingBars({ rating }: { rating: RatingSummary }) {
  const distribution = Array.from({ length: 10 }, (_, index) => {
    const score = 10 - index;
    const count = rating.votes[String(score)] || 0;
    return {
      score,
      count,
      percent: rating.voteCount > 0 ? (count / rating.voteCount) * 100 : 0
    };
  });

  return (
    <div className="rating-bars">
      {distribution.map((item) => (
        <div className="rating-column" key={item.score} title={`${item.score} 分：${item.count} 票`}>
          <b>{item.count}</b>
          <div className="rating-track">
            <i style={{ height: item.count > 0 ? `${item.percent}%` : 0 }} />
          </div>
          <span>{item.score}</span>
        </div>
      ))}
    </div>
  );
}

function RatingMetric({
  rating,
  subjectRating
}: {
  rating?: Report["meta"]["rating"];
  subjectRating?: Report["meta"]["subjectRating"];
}) {
  const primaryRating = rating ?? subjectRating;
  if (!primaryRating) return null;

  return (
    <div className="metric rating-metric" tabIndex={0}>
      <div className="rating-score-row">
        <span>
          <Star size={18} />
          {primaryRating.average.toFixed(1)}
        </span>
        {rating && subjectRating ? (
          <em className="subject-rating-score">
            <Star size={15} />
            {subjectRating.average.toFixed(1)}
          </em>
        ) : null}
      </div>
      <p>
        {rating ? `单集 ${rating.voteCount} 票` : `全集 ${formatMetricValue(primaryRating.voteCount)} 票`}
        {rating && subjectRating ? ` / 全集 ${formatMetricValue(subjectRating.voteCount)} 票` : ""}
      </p>
      <div className="rating-popover" role="tooltip">
        {rating ? (
          <div className="rating-popover-section">
            <div className="rating-popover-head">
              <strong>单集评分分布</strong>
              <em>{rating.voteCount} 票</em>
            </div>
            <RatingBars rating={rating} />
          </div>
        ) : null}
        {subjectRating ? (
          <div className="rating-popover-section">
            <div className="rating-popover-head">
              <strong>全集评分分布</strong>
              <em>{subjectRating.voteCount} 票</em>
            </div>
            <RatingBars rating={subjectRating} />
          </div>
        ) : null}
      </div>
    </div>
  );
}

const richTextPattern =
  /(《[^》]{1,40}》|「[^」]{1,50}」|『[^』]{1,50}』|“[^”]{1,50}”|【[^】]{1,50}】|\d+(?:\.\d+)?(?:分|票|%|话|集|条)?|导演|演出|脚本|分镜|作画监督|原画师?|CV|声优|制作组|官方|社交媒体|评论区|争议|共鸣|伏笔|暗示|细节|评分|投票|后续|原作)/g;
const richTokenPattern =
  /^(《[^》]{1,40}》|「[^」]{1,50}」|『[^』]{1,50}』|“[^”]{1,50}”|【[^】]{1,50}】|\d+(?:\.\d+)?(?:分|票|%|话|集|条)?|导演|演出|脚本|分镜|作画监督|原画师?|CV|声优|制作组|官方|社交媒体|评论区|争议|共鸣|伏笔|暗示|细节|评分|投票|后续|原作)$/;

function richTextClassName(text: string) {
  if (/^(《|「|『|“|【)/.test(text)) return "rich-quote";
  if (/^\d/.test(text)) return "rich-number";
  if (/导演|演出|脚本|分镜|作画监督|原画|CV|声优|制作组|官方|社交媒体/.test(text)) return "rich-role";
  if (/后续|原作|伏笔|暗示/.test(text)) return "rich-risk";
  return "rich-emphasis";
}

function RichText({ text }: { text: string }) {
  const parts = text.split(richTextPattern).filter(Boolean);

  return (
    <>
      {parts.map((part, index) =>
        richTokenPattern.test(part) ? (
          <span className={richTextClassName(part)} key={`${part}-${index}`}>
            {part}
          </span>
        ) : (
          <span key={`${part}-${index}`}>{part}</span>
        )
      )}
    </>
  );
}

function normalizeQuote(quote: ReportQuote | string): ReportQuote {
  return typeof quote === "string" ? { text: quote } : quote;
}

function getCommentLink(episodeUrl: string, commentId?: string) {
  if (!commentId || /^comment-\d+$/i.test(commentId)) return undefined;

  try {
    const url = new URL(episodeUrl);
    url.hash = commentId.startsWith("post_") ? commentId : `post_${commentId}`;
    return url.toString();
  } catch {
    return undefined;
  }
}

function ReportList({ items, icon, episodeUrl }: { items: ReportItem[]; icon: React.ReactNode; episodeUrl: string }) {
  if (items.length === 0) {
    return <p className="muted">这部分没有足够明确的公开评论信号。</p>;
  }

  return (
    <div className="report-list">
      {items.map((item, index) => (
          <article className="report-item" key={`${item.title}-${index}`}>
            <div className="item-icon">{icon}</div>
            <div>
              <div className="report-item-head">
                <h3>{item.title}</h3>
              </div>
              <p>
                <RichText text={item.summary} />
              </p>
              {item.quotes && item.quotes.length > 0 ? (
                <div className="quote-list" aria-label="代表评论">
                  {item.quotes.slice(0, 4).map((rawQuote, quoteIndex) => {
                    const quote = normalizeQuote(rawQuote);
                    const quoteLink = getCommentLink(episodeUrl, quote.sourceCommentId);

                    return (
                      <blockquote key={`${quote.text}-${quoteIndex}`}>
                        <Quote size={14} />
                        <span>
                          <RichText text={quote.text} />
                          {quote.reactions && quote.reactions.length > 0 ? (
                            <span className="reaction-pills" aria-label="表情回复">
                              {quote.reactions.map((reaction, reactionIndex) => (
                                <span className="reaction-pill" key={`${reaction.label}-${reactionIndex}`}>
                                  {reaction.label}
                                  <strong>{reaction.count}</strong>
                                </span>
                              ))}
                            </span>
                          ) : null}
                        </span>
                        {quoteLink ? (
                          <a href={quoteLink} rel="noreferrer" target="_blank">
                            <ExternalLink size={13} />
                            原文
                          </a>
                        ) : null}
                      </blockquote>
                    );
                  })}
                </div>
              ) : null}
            </div>
          </article>
      ))}
    </div>
  );
}

function ReportSection({
  title,
  icon,
  items,
  episodeUrl
}: {
  title: string;
  icon: React.ReactNode;
  items?: ReportItem[];
  episodeUrl: string;
}) {
  return (
    <article className="panel">
      <div className="panel-title">
        {icon}
        <h2>{title}</h2>
      </div>
      <ReportList items={items || []} icon={icon} episodeUrl={episodeUrl} />
    </article>
  );
}

function formatTrendNumber(value?: number, digits = 0) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "暂无";
  return value.toLocaleString("zh-CN", {
    maximumFractionDigits: digits,
    minimumFractionDigits: digits
  });
}

function getTrendDirectionLabel(direction: SeasonTrendDirection) {
  if (direction === "rising") return "上升";
  if (direction === "falling") return "回落";
  if (direction === "stable") return "平稳";
  return "不足";
}

function SeasonTrendMetricCard({
  label,
  metric,
  digits = 0
}: {
  label: string;
  metric: SeasonTrendMetricSummary;
  digits?: number;
}) {
  return (
    <div className="season-trend-metric">
      <span>{label}</span>
      <strong>{formatTrendNumber(metric.latest, digits)}</strong>
      <p>
        峰值 {formatTrendNumber(metric.peak, digits)}
        {metric.peakEpisodeLabel ? ` / ${metric.peakEpisodeLabel}` : ""} · {getTrendDirectionLabel(metric.direction)}
      </p>
    </div>
  );
}

function SeasonTrendBars({
  episodes,
  valueKey,
  label,
  digits = 0
}: {
  episodes: SeasonTrendEpisode[];
  valueKey: keyof Pick<SeasonTrendEpisode, "ratingAverage" | "commentCount" | "discussionHeat">;
  label: string;
  digits?: number;
}) {
  const values = episodes.map((episode) => Number(episode[valueKey]) || 0);
  const maxValue = Math.max(...values, 1);

  return (
    <div className="season-trend-chart" aria-label={label}>
      {episodes.map((episode) => {
        const value = Number(episode[valueKey]) || 0;
        const height = `${Math.max(6, (value / maxValue) * 100)}%`;
        return (
          <div className="season-trend-bar" key={`${label}-${episode.id}`} title={`${episode.label} ${formatTrendNumber(value, digits)}`}>
            <i style={{ height }} />
            <span>{episode.episodeSort ?? episode.episodeNumber ?? episode.id}</span>
          </div>
        );
      })}
    </div>
  );
}

function SeasonTrendPointList({ title, points }: { title: string; points: SeasonTrendPoint[] }) {
  return (
    <article className="panel season-trend-points">
      <div className="panel-title">
        <MessageCircle size={18} />
        <h2>{title}</h2>
      </div>
      {points.length > 0 ? (
        <div className="season-trend-point-list">
          {points.slice(0, 5).map((point) => (
            <section className="season-trend-point" key={`${point.episodeId}-${point.title}`}>
              <span>{point.episodeLabel}</span>
              <h3>{point.title}</h3>
              <p>
                <RichText text={point.summary} />
              </p>
            </section>
          ))}
        </div>
      ) : (
        <p className="muted">当前本地报告里还没有足够明确的聚合信号。</p>
      )}
    </article>
  );
}

function SeasonReportGenerationProgress({
  generation,
  onCancel
}: {
  generation: SeasonReportGenerationState;
  onCancel: () => void;
}) {
  const running = generation.status === "running";
  const settledCount = generation.completedCount + generation.failedCount;
  const progressCount = running ? Math.min(generation.totalCount, settledCount + 0.45) : settledCount;
  const percent = generation.totalCount > 0 ? Math.round((progressCount / generation.totalCount) * 100) : 0;

  return (
    <article className="season-report-generation">
      <div className="season-report-generation-head">
        <div>
          <strong>全集总结报告生成进度</strong>
          <p>
            已完成 {generation.completedCount} / {generation.totalCount}
            {generation.failedCount > 0 ? `，失败 ${generation.failedCount}` : ""}
            {generation.currentLabel ? `，当前 ${generation.currentLabel}` : ""}
          </p>
          <p>
            已保存 {generation.savedReportCount} 集，至少需要 {generation.requiredReportCount} 集
            {generation.missingReportCount > 0
              ? `；还差 ${generation.missingReportCount} 集后再生成整季趋势。`
              : "；已满足整季趋势生成门槛。"}
          </p>
        </div>
        {running ? (
          <button className="season-report-cancel" type="button" onClick={onCancel}>
            取消生成
          </button>
        ) : null}
      </div>
      <div className="season-report-progress-row">
        <div
          className={running ? "season-report-progress-track running" : "season-report-progress-track"}
          aria-label="全集总结报告生成进度"
          aria-valuemax={100}
          aria-valuemin={0}
          aria-valuenow={percent}
          role="progressbar"
        >
          <i style={{ width: `${percent}%` }} />
        </div>
        <strong className="season-report-progress-percent">{percent}%</strong>
      </div>
      {generation.message ? <p className="season-report-generation-message">{generation.message}</p> : null}
      <div className="season-report-generation-list">
        {generation.items.map((item) => (
          <div className={`season-report-generation-item ${item.status}`} key={item.id}>
            <span>{item.label}</span>
            <strong>
              {item.status === "running"
                ? "生成中"
                : item.status === "completed"
                  ? "已完成"
                  : item.status === "failed"
                    ? "失败"
                    : item.status === "cancelled"
                      ? "已取消"
                      : "等待中"}
            </strong>
            {item.error ? <em>{item.error}</em> : null}
          </div>
        ))}
      </div>
      {generation.streamingText ? <pre className="season-report-stream-preview">{generation.streamingText}</pre> : null}
    </article>
  );
}

function SeasonTrendPanel({
  trends,
  loading,
  error,
  aiSummary,
  aiSummaryLoading,
  aiSummaryError,
  generation,
  onRequestAiSummary,
  onPrepareSeasonGeneration,
  onCancelSeasonGeneration
}: {
  trends: SeasonTrendPayload | null;
  loading: boolean;
  error: string;
  aiSummary: string;
  aiSummaryLoading: boolean;
  aiSummaryError: string;
  generation: SeasonReportGenerationState | null;
  onRequestAiSummary: () => void;
  onPrepareSeasonGeneration: () => void;
  onCancelSeasonGeneration: () => void;
}) {
  if (loading) {
    return (
      <section className="season-trend-panel">
        <div className="season-trend-loading">
          <Loader2 className="spin" size={18} />
          <span>正在读取本地作品报告...</span>
        </div>
      </section>
    );
  }

  if (error) {
    return (
      <section className="season-trend-panel">
        <article className="season-trend-empty">
          <AlertCircle size={20} />
          <div>
            <strong>作品趋势读取失败</strong>
            <p>{error}</p>
          </div>
        </article>
      </section>
    );
  }

  if (!trends) return null;

  if (!trends.available) {
    return (
      <section className="season-trend-panel">
        <article className="season-trend-empty">
          <BarChart3 size={20} />
          <div>
            <strong>作品趋势还需要更多本地报告</strong>
            <p>
              已保存 {trends.savedReportCount} 集，至少需要 {trends.requiredReportCount} 集
              {trends.missingReportCount > 0
                ? `；还差 ${trends.missingReportCount} 集后再生成整季趋势。`
                : "；正在生成整季趋势。"}
            </p>
            <button
              className="season-report-generate-button"
              type="button"
              onClick={onPrepareSeasonGeneration}
              disabled={generation?.status === "running"}
            >
              {generation?.status === "running" ? <Loader2 className="spin" size={17} /> : <Sparkles size={17} />}
              <span>{generation?.status === "running" ? "正在生成全集总结报告" : "生成全集总结报告"}</span>
            </button>
          </div>
        </article>
        {generation ? <SeasonReportGenerationProgress generation={generation} onCancel={onCancelSeasonGeneration} /> : null}
      </section>
    );
  }

  return (
    <section className="season-trend-panel">
      <div className="season-trend-head">
        <div>
          <span className="label">Season Trends</span>
          <h2>{trends.subjectName} 观众观感趋势</h2>
          <p>
            已覆盖 {trends.savedReportCount}
            {trends.episodeTotal ? ` / ${trends.episodeTotal}` : ""} 集本地报告。
          </p>
        </div>
      </div>

      <div className="season-trend-summary">
        <div>
          <h3>本作到目前为止的观众观感总结</h3>
          <p>
            <RichText text={aiSummary || trends.localSummary} />
          </p>
          {aiSummaryError ? <p className="season-trend-error">{aiSummaryError}</p> : null}
        </div>
        <button
          className="season-trend-ai-summary"
          type="button"
          onClick={onRequestAiSummary}
          disabled={aiSummaryLoading}
          title="调用模型精炼整季总结"
        >
          {aiSummaryLoading ? <Loader2 className="spin" size={17} /> : <Sparkles size={17} />}
          <span>{aiSummaryLoading ? "总结中" : aiSummary ? "重新精炼" : "AI 精炼"}</span>
        </button>
      </div>

      <div className="season-trend-metrics">
        <SeasonTrendMetricCard label="最新评分" metric={trends.metrics.rating} digits={1} />
        <SeasonTrendMetricCard label="最新评论" metric={trends.metrics.comments} />
        <SeasonTrendMetricCard label="讨论热度" metric={trends.metrics.heat} />
      </div>

      <div className="season-trend-grid">
        <article className="panel season-trend-chart-card">
          <div className="panel-title">
            <LineChart size={18} />
            <h2>评分变化</h2>
          </div>
          <SeasonTrendBars episodes={trends.episodes} valueKey="ratingAverage" label="评分变化" digits={1} />
        </article>
        <article className="panel season-trend-chart-card">
          <div className="panel-title">
            <BarChart3 size={18} />
            <h2>讨论热度变化</h2>
          </div>
          <SeasonTrendBars episodes={trends.episodes} valueKey="discussionHeat" label="讨论热度变化" />
        </article>
      </div>

      <div className="season-trend-episode-list" aria-label="多集对比">
        {trends.episodes.map((episode) => (
          <article className="season-trend-episode" key={episode.id}>
            <div>
              <span>{episode.label}</span>
              <strong>{episode.title}</strong>
            </div>
            <p>
              评分 {formatTrendNumber(episode.ratingAverage, 1)} · 评论 {formatTrendNumber(episode.commentCount)} · 热度{" "}
              {formatTrendNumber(episode.discussionHeat)}
            </p>
          </article>
        ))}
      </div>

      <div className="season-trend-grid">
        <SeasonTrendPointList title="共鸣点变化" points={trends.resonancePoints} />
        <SeasonTrendPointList title="争议点变化" points={trends.controversyPoints} />
      </div>
    </section>
  );
}

function getSubjectName(report: Report) {
  return getSubjectNameFromMeta(report.meta);
}

function getSubjectNameFromMeta(meta: Report["meta"]) {
  return meta.subjectTitleCn || meta.subjectTitle || "未分类动画";
}

function getSubjectKeyFromMeta(meta: Report["meta"]) {
  return meta.subjectId ? `id:${meta.subjectId}` : `name:${getSubjectNameFromMeta(meta)}`;
}

function getSubjectKeyFromSeasonTrend(trends: Pick<SeasonTrendPayload, "subjectId" | "subjectName">) {
  return trends.subjectId ? `id:${trends.subjectId}` : `name:${trends.subjectName}`;
}

function getSubjectKey(report: Report) {
  return getSubjectKeyFromMeta(report.meta);
}

function getHeroSubjectTitle(meta: Report["meta"]) {
  return meta.subjectTitle || meta.subjectTitleCn || "未分类动画";
}

function getSavedReportMeta(item: SavedReport) {
  return item.report?.meta || item.meta;
}

function isSavedReportLiked(item?: SavedReport | null) {
  return Boolean(item?.likedAt);
}

function isSameReportEpisode(item: SavedReport, currentReport: Report) {
  return getSavedReportMeta(item).url === currentReport.meta.url;
}

function getEpisodeSortValue(item: SavedReport) {
  const meta = getSavedReportMeta(item);

  if (typeof meta.episodeSort === "number") {
    return meta.episodeSort;
  }

  if (typeof meta.episodeNumber === "number") {
    return meta.episodeNumber;
  }

  const numericId = Number(meta.episodeId);
  return Number.isFinite(numericId) ? numericId : Number.MAX_SAFE_INTEGER;
}

function formatEpisodeNumber(episodeNumber: number) {
  return Number.isInteger(episodeNumber) ? String(episodeNumber) : String(episodeNumber).replace(/\.0$/, "");
}

function getHistoryEpisodeLabel(report: Report) {
  return getHistoryEpisodeLabelFromMeta(report.meta);
}

function formatSavedAt(savedAt: string) {
  const savedTime = new Date(savedAt).getTime();
  if (!Number.isFinite(savedTime)) return "";

  const elapsedMs = Date.now() - savedTime;
  if (elapsedMs < 60_000) return "刚刚";

  const minute = 60_000;
  const hour = 60 * minute;
  const day = 24 * hour;

  if (elapsedMs < hour) return `${Math.floor(elapsedMs / minute)} 分前`;
  if (elapsedMs < day) return `${Math.floor(elapsedMs / hour)} 小时前`;
  if (elapsedMs < 2 * day) return "昨天";
  if (elapsedMs < 30 * day) return `${Math.floor(elapsedMs / day)} 天前`;

  return new Intl.DateTimeFormat("zh-CN", {
    month: "numeric",
    day: "numeric"
  }).format(new Date(savedTime));
}

function formatReportGeneratedAt(generatedAt?: string) {
  if (!generatedAt) return "";

  const generatedTime = new Date(generatedAt).getTime();
  if (!Number.isFinite(generatedTime)) return "";

  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(generatedTime));
}

function isReportStale(generatedAt?: string) {
  if (!generatedAt) return false;

  const generatedTime = new Date(generatedAt).getTime();
  if (!Number.isFinite(generatedTime)) return false;

  return Date.now() - generatedTime > REPORT_STALE_THRESHOLD_MS;
}

function getHistoryEpisodeLabelFromMeta(meta: Report["meta"]) {
  if (typeof meta.episodeNumber !== "number") {
    return meta.title;
  }

  return `第 ${formatEpisodeNumber(meta.episodeNumber)} 话 ${meta.title}`;
}

function getHeroEpisodeTitle(meta: Report["meta"]) {
  if (typeof meta.episodeNumber !== "number") {
    return meta.title;
  }

  const episodeLabel = `第 ${formatEpisodeNumber(meta.episodeNumber)} 话`;
  const compactEpisodeLabel = episodeLabel.replace(/\s+/g, "");
  const title = meta.title.trim();

  if (title.startsWith(episodeLabel) || title.startsWith(compactEpisodeLabel)) {
    return title;
  }

  return `${episodeLabel} ${title}`;
}

function getHeroEpisodeTitleTranslation(meta: Report["meta"], translationState?: EpisodeTitleTranslationState) {
  if (meta.episodeTitleCn?.trim()) {
    return {
      status: "ready" as const,
      translation: formatHeroEpisodeTitle(meta, meta.episodeTitleCn.trim()),
      source: "official" as const
    };
  }

  if (translationState?.status === "ready" && translationState.translation?.trim()) {
    return {
      ...translationState,
      translation: formatHeroEpisodeTitle(meta, translationState.translation.trim())
    };
  }

  return translationState;
}

function HeroEpisodeTitle({
  meta,
  translationState,
  onRequestTranslation
}: {
  meta: Report["meta"];
  translationState?: EpisodeTitleTranslationState;
  onRequestTranslation: (meta: Report["meta"], allowAi: boolean) => void;
}) {
  const title = getHeroEpisodeTitle(meta);
  const translation = getHeroEpisodeTitleTranslation(meta, translationState);
  const translationStatus = translation?.status || "idle";

  function requestTranslation() {
    onRequestTranslation(meta, false);
  }

  return (
    <h1
      className="hero-episode-title"
      tabIndex={0}
      onFocus={requestTranslation}
      onMouseEnter={requestTranslation}
    >
      <span>{title}</span>
      <span className={`hero-title-translation is-${translationStatus}`} role="tooltip">
        {translation?.status === "ready" ? (
          <>
            <strong>{translation.translation}</strong>
            <em>{translation.source === "official" ? "Bangumi 官方中文名" : "AI 翻译"}</em>
          </>
        ) : translation?.status === "needs-ai" ? (
          <>
            <strong>Bangumi 官方暂无中文名</strong>
            <em>确认后可调用模型 API 翻译</em>
          </>
        ) : translation?.status === "error" ? (
          <>
            <strong>标题翻译失败</strong>
            <em>{translation.error || "请稍后重试"}</em>
          </>
        ) : (
          <>
            <strong>正在查询中文标题</strong>
            <em>优先使用 Bangumi 官方数据</em>
          </>
        )}
      </span>
    </h1>
  );
}

function getHeroSubjectTitleTranslation(meta: Report["meta"], translationState?: EpisodeTitleTranslationState) {
  if (meta.subjectTitleCn?.trim()) {
    return {
      status: "ready" as const,
      translation: meta.subjectTitleCn.trim(),
      source: "official" as const
    };
  }

  if (translationState?.status === "ready" && translationState.translation?.trim()) {
    return {
      ...translationState,
      translation: translationState.translation.trim()
    };
  }

  return translationState;
}

function HeroSubjectTitle({
  meta,
  translationState,
  onRequestTranslation
}: {
  meta: Report["meta"];
  translationState?: EpisodeTitleTranslationState;
  onRequestTranslation: (meta: Report["meta"], allowAi: boolean) => void;
}) {
  const title = getHeroSubjectTitle(meta);
  const translation = getHeroSubjectTitleTranslation(meta, translationState);
  const translationStatus = translation?.status || "idle";

  function requestTranslation() {
    onRequestTranslation(meta, false);
  }

  return (
    <p
      className="hero-subject-title"
      tabIndex={0}
      onFocus={requestTranslation}
      onMouseEnter={requestTranslation}
    >
      <span>{title}</span>
      <span className={`hero-title-translation is-${translationStatus}`} role="tooltip">
        {translation?.status === "ready" ? (
          <>
            <strong>{translation.translation}</strong>
            <em>{translation.source === "official" ? "Bangumi 官方中文名" : "AI 翻译"}</em>
          </>
        ) : translation?.status === "needs-ai" ? (
          <>
            <strong>Bangumi 官方暂无中文名</strong>
            <em>确认后可调用模型 API 翻译</em>
          </>
        ) : translation?.status === "error" ? (
          <>
            <strong>标题翻译失败</strong>
            <em>{translation.error || "请稍后重试"}</em>
          </>
        ) : (
          <>
            <strong>正在查询中文标题</strong>
            <em>优先使用 Bangumi 官方数据</em>
          </>
        )}
      </span>
    </p>
  );
}

function formatHeroEpisodeTitle(meta: Report["meta"], title: string) {
  if (typeof meta.episodeNumber !== "number") {
    return title;
  }

  return `第 ${formatEpisodeNumber(meta.episodeNumber)} 话 ${title}`;
}

function sortSavedReportsByEpisode(items: SavedReport[]) {
  return [...items].sort((a, b) => {
    const episodeDiff = getEpisodeSortValue(a) - getEpisodeSortValue(b);
    if (episodeDiff !== 0) return episodeDiff;
    return new Date(b.savedAt).getTime() - new Date(a.savedAt).getTime();
  });
}

function getDirectionLabel(direction: EpisodeDirection) {
  return direction === "previous" ? "上一集" : "下一集";
}

function buildEpisodeUrl(report: Report, episodeId: string) {
  try {
    const url = new URL(report.meta.url);
    url.pathname = `/ep/${episodeId}`;
    url.search = "";
    url.hash = "";
    return url.toString();
  } catch {
    return `https://bgm.tv/ep/${episodeId}`;
  }
}

function buildAdjacentEpisodeUrl(report: Report, direction: EpisodeDirection) {
  const adjacentEpisodeId =
    direction === "previous" ? report.meta.previousEpisodeId : report.meta.nextEpisodeId;
  if (adjacentEpisodeId) return buildEpisodeUrl(report, adjacentEpisodeId);

  const episodeId = Number(report.meta.episodeId);
  if (!Number.isInteger(episodeId)) return undefined;

  const fallbackEpisodeId = episodeId + (direction === "previous" ? -1 : 1);
  if (fallbackEpisodeId <= 0) return undefined;
  return buildEpisodeUrl(report, String(fallbackEpisodeId));
}

function getSubjectEpisodeById(subjectInfo: SubjectInfo | undefined, episodeId: string | null | undefined) {
  if (!episodeId) return undefined;
  return subjectInfo?.episodes?.find((episode) => episode.id === episodeId);
}

function getAdjacentEpisodeInfo(
  report: Report,
  direction: EpisodeDirection,
  subjectInfo: SubjectInfo | undefined
) {
  const adjacentFromReport = direction === "previous" ? report.meta.previousEpisode : report.meta.nextEpisode;
  if (adjacentFromReport) return adjacentFromReport;

  const adjacentEpisodeId = direction === "previous" ? report.meta.previousEpisodeId : report.meta.nextEpisodeId;
  const adjacentById = getSubjectEpisodeById(subjectInfo, adjacentEpisodeId);
  if (adjacentById) return adjacentById;

  const currentSort = report.meta.episodeSort ?? report.meta.episodeNumber;
  if (typeof currentSort !== "number") return undefined;

  const expectedSort = currentSort + (direction === "previous" ? -1 : 1);
  return subjectInfo?.episodes?.find((episode) => episode.sort === expectedSort);
}

function getReportFallbackEpisodes(report: Report) {
  const episodes = [report.meta.previousEpisode, report.meta.currentEpisode, report.meta.nextEpisode].filter(
    (episode): episode is EpisodeAvailabilitySignals => Boolean(episode?.id)
  );
  const uniqueEpisodes = new Map<string, EpisodeAvailabilitySignals>();
  episodes.forEach((episode) => uniqueEpisodes.set(episode.id, episode));
  return [...uniqueEpisodes.values()].sort(
    (a, b) => (a.sort ?? Number.MAX_SAFE_INTEGER) - (b.sort ?? Number.MAX_SAFE_INTEGER) || Number(a.id) - Number(b.id)
  );
}

function formatEpisodeAirdate(airdate?: string) {
  if (!airdate) return "";
  const match = airdate.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return airdate;
  return `${match[1]} 年 ${Number(match[2])} 月 ${Number(match[3])} 日`;
}

function getMissingEpisodePrimaryActionLabel(prompt: MissingEpisodePrompt) {
  if (prompt.reason === "unaired") return "仍然生成";
  return <>生成{getDirectionLabel(prompt.direction)}</>;
}

function isEpisodeBoundary(report: Report, direction: EpisodeDirection, knownEpisodeTotal?: number) {
  if (direction === "previous" && report.meta.previousEpisodeId === null) return true;
  if (direction === "next" && report.meta.nextEpisodeId === null) {
    const episodeTotal = report.meta.episodeTotal || knownEpisodeTotal;
    const episodeSort = report.meta.episodeSort ?? report.meta.episodeNumber;
    return !(typeof episodeTotal === "number" && episodeTotal > 0 && typeof episodeSort === "number" && episodeSort < episodeTotal);
  }

  if (direction === "previous" && report.meta.previousEpisodeId === undefined && typeof report.meta.episodeSort === "number") {
    return report.meta.episodeSort <= 1;
  }

  if (direction === "next" && report.meta.nextEpisodeId === undefined && typeof report.meta.episodeSort === "number") {
    const episodeTotal = report.meta.episodeTotal || knownEpisodeTotal;
    return typeof episodeTotal === "number" && episodeTotal > 0 && report.meta.episodeSort >= episodeTotal;
  }

  if (direction === "previous" && report.meta.previousEpisodeId !== undefined) return false;
  if (direction === "next" && report.meta.nextEpisodeId !== undefined) return false;

  const episodeNumber = report.meta.episodeNumber;
  if (typeof episodeNumber !== "number") return false;

  if (direction === "previous") {
    return episodeNumber <= 1;
  }

  const episodeTotal = report.meta.episodeTotal || knownEpisodeTotal;
  return typeof episodeTotal === "number" && episodeTotal > 0 && episodeNumber >= episodeTotal;
}

function getReportRoute(itemId: string) {
  return `${REPORT_ROUTE_PREFIX}${encodeURIComponent(itemId)}`;
}

function getReportIdFromPath(pathname: string) {
  if (!pathname.startsWith(REPORT_ROUTE_PREFIX)) return "";
  return decodeURIComponent(pathname.slice(REPORT_ROUTE_PREFIX.length).split("/")[0] || "");
}

function isHomePath(pathname: string) {
  return pathname === HOME_ROUTE || pathname === "/";
}

function isEpisodeUnavailable(report: Report, direction: EpisodeDirection, knownEpisodeTotal?: number) {
  if (direction !== "next") return false;
  if (report.meta.nextEpisodeId !== null) return false;

  const episodeTotal = report.meta.episodeTotal || knownEpisodeTotal;
  const episodeSort = report.meta.episodeSort ?? report.meta.episodeNumber;
  return typeof episodeTotal === "number" && episodeTotal > 0 && typeof episodeSort === "number" && episodeSort < episodeTotal;
}

async function analyzeEpisodeReport(
  trimmedUrl: string,
  options: {
    signal?: AbortSignal;
    onDelta?: (text: string) => void;
    onFinal?: (report: Report) => void;
  } = {}
) {
  const response = await fetch("/api/analyze", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url: trimmedUrl }),
    signal: options.signal
  });

  if (!response.ok) {
    const payload = await response.json();
    throw new Error(payload.error || "生成失败，请稍后重试。");
  }

  if (!response.body) {
    throw new Error("浏览器没有收到流式响应。");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let finalReport: Report | null = null;

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const events = buffer.split("\n\n");
    buffer = events.pop() || "";

    for (const eventBlock of events) {
      const eventName = eventBlock.match(/^event: (.+)$/m)?.[1];
      const dataLine = eventBlock.match(/^data: (.+)$/m)?.[1];
      if (!eventName || !dataLine) continue;

      const payload = JSON.parse(dataLine);

      if (eventName === "delta") {
        options.onDelta?.(payload.text);
      }

      if (eventName === "final") {
        finalReport = payload;
        options.onFinal?.(payload);
      }

      if (eventName === "error") {
        throw new Error(payload.error || "流式生成失败，请稍后重试。");
      }
    }
  }

  if (!finalReport) {
    throw new Error("生成结束但没有收到完整报告。");
  }

  return finalReport;
}

export default function BangumiLensApp() {
  const router = useRouter();
  const pathname = usePathname();
  const [url, setUrl] = useState("");
  const [report, setReport] = useState<Report | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [streamingText, setStreamingText] = useState("");
  const [history, setHistory] = useState<SavedReport[]>([]);
  const [theme, setTheme] = useState<ThemeMode>("day");
  const [pendingDuplicate, setPendingDuplicate] = useState<SavedReport | null>(null);
  const [pendingAutoAnalyzeUrl, setPendingAutoAnalyzeUrl] = useState("");
  const [missingEpisodePrompt, setMissingEpisodePrompt] = useState<MissingEpisodePrompt | null>(null);
  const [pendingReportRegeneration, setPendingReportRegeneration] = useState<PendingReportRegeneration | null>(null);
  const [pendingAiTitleTranslation, setPendingAiTitleTranslation] = useState<PendingAiTitleTranslation | null>(null);
  const [pendingAiSubjectTitleTranslation, setPendingAiSubjectTitleTranslation] =
    useState<PendingAiSubjectTitleTranslation | null>(null);
  const [episodeTitleTranslations, setEpisodeTitleTranslations] = useState<Record<string, EpisodeTitleTranslationState>>({});
  const [subjectTitleTranslations, setSubjectTitleTranslations] = useState<Record<string, EpisodeTitleTranslationState>>({});
  const [likeHistoryPrompt, setLikeHistoryPrompt] = useState<LikeHistoryPrompt | null>(null);
  const [deleteHistoryPrompt, setDeleteHistoryPrompt] = useState<SavedReport | null>(null);
  const [subjectInfoById, setSubjectInfoById] = useState<Record<string, SubjectInfo>>({});
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const [searching, setSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [selectedSearchResult, setSelectedSearchResult] = useState<SearchResult | null>(null);
  const [searchEpisodes, setSearchEpisodes] = useState<SearchEpisodeChoice[]>([]);
  const [loadingSearchEpisodes, setLoadingSearchEpisodes] = useState(false);
  const [reportSwitching, setReportSwitching] = useState(false);
  const [collapsedSubjects, setCollapsedSubjects] = useState<Set<string>>(() => new Set());
  const [showSeasonTrend, setShowSeasonTrend] = useState(false);
  const [seasonTrend, setSeasonTrend] = useState<SeasonTrendPayload | null>(null);
  const [seasonTrendLoading, setSeasonTrendLoading] = useState(false);
  const [seasonTrendError, setSeasonTrendError] = useState("");
  const [seasonTrendAiSummary, setSeasonTrendAiSummary] = useState("");
  const [seasonTrendAiSummaryLoading, setSeasonTrendAiSummaryLoading] = useState(false);
  const [seasonTrendAiSummaryError, setSeasonTrendAiSummaryError] = useState("");
  const [seasonReportGeneration, setSeasonReportGeneration] = useState<SeasonReportGenerationState | null>(null);
  const [pendingSeasonReportGeneration, setPendingSeasonReportGeneration] =
    useState<PendingSeasonReportGeneration | null>(null);
  const autoAnalyzeUrlRef = useRef<string | null>(null);
  const seasonReportGenerationAbortRef = useRef<AbortController | null>(null);
  const seasonReportGenerationCancelledRef = useRef(false);
  const loadedRouteReportIdRef = useRef<string | null>(null);
  const pendingRouteReportIdRef = useRef<string | null>(null);
  const returningHomeRef = useRef(false);
  const reportSwitchingFrameRef = useRef<number | null>(null);
  const reportSwitchingTimeoutRef = useRef<number | null>(null);
  const currentSubjectKey = report ? getSubjectKey(report) : "";
  const visibleSeasonReportGeneration =
    seasonReportGeneration?.subjectKey === currentSubjectKey ? seasonReportGeneration : null;
  const visiblePendingSeasonReportGeneration =
    pendingSeasonReportGeneration?.subjectKey === currentSubjectKey ? pendingSeasonReportGeneration : null;
  const searchSelectionOpen = searchResults.length > 0 || Boolean(selectedSearchResult);
  const modalOpen = Boolean(
    searchSelectionOpen ||
      pendingDuplicate ||
      pendingAutoAnalyzeUrl ||
      pendingReportRegeneration ||
      visiblePendingSeasonReportGeneration ||
      pendingAiTitleTranslation ||
      pendingAiSubjectTitleTranslation ||
      missingEpisodePrompt ||
      deleteHistoryPrompt ||
      likeHistoryPrompt
  );

  const scheduleReportSwitchingEnd = useCallback(() => {
    if (reportSwitchingFrameRef.current !== null) {
      window.cancelAnimationFrame(reportSwitchingFrameRef.current);
    }
    if (reportSwitchingTimeoutRef.current !== null) {
      window.clearTimeout(reportSwitchingTimeoutRef.current);
    }

    reportSwitchingFrameRef.current = window.requestAnimationFrame(() => {
      reportSwitchingFrameRef.current = window.requestAnimationFrame(() => {
        reportSwitchingTimeoutRef.current = window.setTimeout(() => {
          setReportSwitching(false);
          reportSwitchingFrameRef.current = null;
          reportSwitchingTimeoutRef.current = null;
        }, 200);
      });
    });
  }, []);

  useEffect(() => {
    return () => {
      if (reportSwitchingFrameRef.current !== null) {
        window.cancelAnimationFrame(reportSwitchingFrameRef.current);
      }
      if (reportSwitchingTimeoutRef.current !== null) {
        window.clearTimeout(reportSwitchingTimeoutRef.current);
      }
      seasonReportGenerationAbortRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    if (!modalOpen) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [modalOpen]);

  const openSavedReport = useCallback(async (item: SavedReport, options?: { replace?: boolean }) => {
    const currentReportUrl = report?.meta.url;
    const targetReportUrl = item.report?.meta.url || item.meta?.url || item.url;
    const shouldMaskSwitch = Boolean(currentReportUrl && targetReportUrl && currentReportUrl !== targetReportUrl);

    try {
      if (shouldMaskSwitch) {
        flushSync(() => setReportSwitching(true));
      }

      let nextReport = item.report;
      let nextUrl = item.url;
      if (!nextReport) {
        const response = await fetch(`/api/history?id=${encodeURIComponent(item.id)}`, { cache: "no-store" });
        if (!response.ok) return;
        const payload = (await response.json()) as { item?: SavedReport & { report: Report } };
        nextReport = payload.item?.report;
        nextUrl = payload.item?.url || nextUrl;
      }

      if (!nextReport) return;

      loadedRouteReportIdRef.current = item.id;
      setReport(nextReport);
      setUrl(nextUrl || nextReport.meta.url);
      setError("");
      setStreamingText("");
      setShowSeasonTrend(false);
      setSeasonTrend(null);
      setSeasonTrendError("");
      setSeasonTrendAiSummary("");
      setSeasonTrendAiSummaryError("");
      setMissingEpisodePrompt(null);
      setPendingDuplicate(null);
      setHistory((currentHistory) =>
        currentHistory.map((historyItem) => (historyItem.id === item.id ? { ...historyItem, report: nextReport } : historyItem))
      );
      const route = getReportRoute(item.id);
      if (window.location.pathname !== route) {
        pendingRouteReportIdRef.current = item.id;
        if (options?.replace) {
          router.replace(route);
        } else {
          router.push(route);
        }
      }
    } catch {
      // Opening a saved report can be retried from the history list.
    } finally {
      if (shouldMaskSwitch) {
        scheduleReportSwitchingEnd();
      }
    }
  }, [report?.meta.url, router, scheduleReportSwitchingEnd]);

  useEffect(() => {
    const routeReportId = getReportIdFromPath(pathname);
    if (pendingRouteReportIdRef.current === routeReportId) {
      pendingRouteReportIdRef.current = null;
    }
  }, [pathname]);

  useEffect(() => {
    async function loadHistory() {
      try {
        const response = await fetch("/api/history", { cache: "no-store" });
        if (response.ok) {
          const payload = (await response.json()) as { history?: SavedReport[] };
          setHistory(payload.history || []);
        }
      } catch {
        setHistory([]);
      } finally {
        setHistoryLoaded(true);
      }
    }

    void loadHistory();

    try {
      const savedTheme = window.localStorage.getItem(THEME_STORAGE_KEY);
      if (savedTheme === "day" || savedTheme === "night") {
        setTheme(savedTheme);
        document.documentElement.dataset.theme = savedTheme;
      }
    } catch {
      // Theme loading is optional.
    }
  }, []);

  useEffect(() => {
    if (!pendingDuplicate) return;
    const duplicate = pendingDuplicate;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        void openSavedReport(duplicate);
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [openSavedReport, pendingDuplicate]);

  useEffect(() => {
    if (!pendingAutoAnalyzeUrl) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setPendingAutoAnalyzeUrl("");
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [pendingAutoAnalyzeUrl]);

  useEffect(() => {
    if (!searchSelectionOpen) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        closeSearchSelectionDialog();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [searchSelectionOpen]);

  useEffect(() => {
    if (!missingEpisodePrompt) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setMissingEpisodePrompt(null);
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [missingEpisodePrompt]);

  useEffect(() => {
    if (!deleteHistoryPrompt) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setDeleteHistoryPrompt(null);
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [deleteHistoryPrompt]);

  useEffect(() => {
    if (!likeHistoryPrompt) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setLikeHistoryPrompt(null);
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [likeHistoryPrompt]);

  useEffect(() => {
    if (!pendingAiTitleTranslation) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setPendingAiTitleTranslation(null);
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [pendingAiTitleTranslation]);

  useEffect(() => {
    if (!pendingAiSubjectTitleTranslation) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setPendingAiSubjectTitleTranslation(null);
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [pendingAiSubjectTitleTranslation]);

  useEffect(() => {
    setPendingSeasonReportGeneration((current) => (current && current.subjectKey !== currentSubjectKey ? null : current));
    setSeasonReportGeneration((current) => (current && current.subjectKey !== currentSubjectKey ? null : current));
  }, [currentSubjectKey]);

  useEffect(() => {
    const subjectId = report?.meta.subjectId;
    if (!subjectId || subjectInfoById[subjectId]) return;

    let ignore = false;
    const currentSubjectId = subjectId;

    async function loadSubjectInfo() {
      try {
        const response = await fetch(`/api/subject-info?subjectId=${encodeURIComponent(currentSubjectId)}`, { cache: "no-store" });
        if (!response.ok) return;
        const payload = (await response.json()) as SubjectInfo;
        if (!ignore) {
          setSubjectInfoById((current) => ({ ...current, [currentSubjectId]: payload }));
        }
      } catch {
        // Navigation checks fall back to local report metadata.
      }
    }

    void loadSubjectInfo();
    return () => {
      ignore = true;
    };
  }, [report?.meta.episodeTotal, report?.meta.subjectId, subjectInfoById]);

  function toggleTheme() {
    const nextTheme = theme === "day" ? "night" : "day";
    setTheme(nextTheme);
    document.documentElement.dataset.theme = nextTheme;
    window.localStorage.setItem(THEME_STORAGE_KEY, nextTheme);
  }

  function goHome() {
    returningHomeRef.current = true;
    loadedRouteReportIdRef.current = null;
    setReport(null);
    setError("");
    setLoading(false);
    setStreamingText("");
    setSearchResults([]);
    setShowSeasonTrend(false);
    setSeasonTrend(null);
    setSeasonTrendError("");
    setSeasonTrendAiSummary("");
    setSeasonTrendAiSummaryError("");
    setSeasonReportGeneration(null);
    setPendingSeasonReportGeneration(null);
    seasonReportGenerationCancelledRef.current = true;
    seasonReportGenerationAbortRef.current?.abort();
    setMissingEpisodePrompt(null);
    setPendingDuplicate(null);
    setPendingAutoAnalyzeUrl("");
    setPendingReportRegeneration(null);
    setPendingAiTitleTranslation(null);
    setPendingAiSubjectTitleTranslation(null);
    router.push(HOME_ROUTE);
  }

  const saveReport = useCallback((nextReport: Report, sourceUrl: string, options: { navigate?: boolean } = {}) => {
    const existingLikedAt = history.find((item) => getSavedReportMeta(item).url === nextReport.meta.url)?.likedAt;
    const nextItem: SavedReport = {
      id: `${nextReport.meta.episodeId}-${Date.now()}`,
      url: sourceUrl,
      savedAt: new Date().toISOString(),
      likedAt: existingLikedAt,
      meta: nextReport.meta,
      stats: nextReport.stats,
      report: nextReport
    };

    setHistory((currentHistory) => {
      const dedupedHistory = currentHistory.filter((item) => getSavedReportMeta(item).url !== nextReport.meta.url);
      return [nextItem, ...dedupedHistory];
    });

    return fetch("/api/history", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ report: nextReport, url: sourceUrl })
    })
      .then(async (response) => {
        if (!response.ok) return;
        const payload = (await response.json()) as { history?: SavedReport[] };
        if (payload.history) {
          setHistory(payload.history);
          const savedItem = findExistingReport(payload.history, nextReport.meta.url);
          if (savedItem && options.navigate !== false) {
            loadedRouteReportIdRef.current = savedItem.id;
            pendingRouteReportIdRef.current = savedItem.id;
            router.replace(getReportRoute(savedItem.id));
          }
        }
      })
      .catch(() => undefined);
  }, [history, router]);

  function toggleReportLike(item: SavedReport, liked: boolean) {
    const nextLikedAt = liked ? new Date().toISOString() : undefined;
    const previousHistory = history;

    setHistory((currentHistory) =>
      currentHistory.map((historyItem) =>
        historyItem.id === item.id ? { ...historyItem, likedAt: nextLikedAt } : historyItem
      )
    );

    void fetch("/api/history", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: item.id, liked })
    })
      .then(async (response) => {
        const payload = (await response.json()) as { history?: SavedReport[] };
        if (!response.ok) {
          setHistory(previousHistory);
          return;
        }
        if (payload.history) setHistory(payload.history);
      })
      .catch(() => setHistory(previousHistory));
  }

  function deleteHistoryItem(itemId: string) {
    let itemToDelete: SavedReport | undefined;

    setHistory((currentHistory) => {
      itemToDelete = currentHistory.find((item) => item.id === itemId);
      const nextHistory = currentHistory.filter((item) => item.id !== itemId);

      if (itemToDelete && report?.meta.url === getSavedReportMeta(itemToDelete).url) {
        setReport(null);
        setStreamingText("");
        loadedRouteReportIdRef.current = null;
        router.push(HOME_ROUTE);
      }

      return nextHistory;
    });

    void fetch("/api/history", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: itemId })
    })
      .then(async (response) => {
        if (!response.ok) return;
        const payload = (await response.json()) as { history?: SavedReport[] };
        if (payload.history) setHistory(payload.history);
      })
      .catch(() => undefined);
  }

  function confirmDeleteHistoryItem() {
    if (!deleteHistoryPrompt) return;
    const itemId = deleteHistoryPrompt.id;
    setDeleteHistoryPrompt(null);
    deleteHistoryItem(itemId);
  }

  function confirmLikeHistoryItem() {
    if (!likeHistoryPrompt) return;
    const { item, liked } = likeHistoryPrompt;
    setLikeHistoryPrompt(null);
    toggleReportLike(item, liked);
  }

  async function loadSeasonTrend() {
    const currentReport = report;
    const subjectName = currentReport ? getSubjectName(currentReport) : "";
    if (!currentReport?.meta.subjectId && !subjectName) {
      setShowSeasonTrend(true);
      setSeasonTrend(null);
      setSeasonTrendError("当前报告缺少作品信息，暂时无法读取作品趋势。");
      return;
    }

    setShowSeasonTrend(true);
    setSeasonTrendLoading(true);
    setSeasonTrendError("");
    setSeasonTrendAiSummary("");
    setSeasonTrendAiSummaryError("");

    try {
      const params = new URLSearchParams();
      if (currentReport?.meta.subjectId) params.set("subjectId", currentReport.meta.subjectId);
      if (subjectName) params.set("subjectName", subjectName);
      const response = await fetch(`/api/season-trends?${params.toString()}`, { cache: "no-store" });
      const payload = (await response.json()) as { trends?: SeasonTrendPayload; error?: string };
      if (!response.ok || !payload.trends) {
        throw new Error(payload.error || "作品趋势读取失败。");
      }
      setSeasonTrend(payload.trends);
    } catch (error) {
      setSeasonTrend(null);
      setSeasonTrendError(error instanceof Error ? error.message : "作品趋势读取失败。");
    } finally {
      setSeasonTrendLoading(false);
    }
  }

  async function requestSeasonTrendAiSummary() {
    if (!seasonTrend?.available || seasonTrendAiSummaryLoading) return;

    setSeasonTrendAiSummaryLoading(true);
    setSeasonTrendAiSummaryError("");

    try {
      const response = await fetch("/api/season-trends/summary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ trends: seasonTrend })
      });
      const payload = (await response.json()) as { summary?: string; error?: string };
      if (!response.ok || !payload.summary) {
        throw new Error(payload.error || "AI 总结生成失败。");
      }
      setSeasonTrendAiSummary(payload.summary);
    } catch (error) {
      setSeasonTrendAiSummaryError(error instanceof Error ? error.message : "AI 总结生成失败。");
    } finally {
      setSeasonTrendAiSummaryLoading(false);
    }
  }

  async function prepareSeasonReportGeneration() {
    const currentReport = report;
    if (!currentReport || visibleSeasonReportGeneration?.status === "running") return;

    setSeasonTrendError("");

    try {
      let subjectInfo = currentReport.meta.subjectId ? subjectInfoById[currentReport.meta.subjectId] : undefined;
      if (currentReport.meta.subjectId && !subjectInfo?.episodes) {
        const response = await fetch(`/api/subject-info?subjectId=${encodeURIComponent(currentReport.meta.subjectId)}`, {
          cache: "no-store"
        });
        const payload = (await response.json()) as SubjectInfo & { error?: string };
        if (!response.ok) {
          throw new Error(payload.error || "章节列表加载失败，请稍后重试。");
        }
        subjectInfo = payload;
        setSubjectInfoById((current) => ({ ...current, [currentReport.meta.subjectId as string]: payload }));
      }

      const subjectName = getSubjectName(currentReport);
      const subjectKey = getSubjectKey(currentReport);
      const savedEpisodeIds = new Set(
        history
          .filter((item) => {
            const meta = getSavedReportMeta(item);
            return meta.subjectId
              ? meta.subjectId === currentReport.meta.subjectId
              : getSubjectNameFromMeta(meta) === subjectName;
          })
          .map((item) => getSavedReportMeta(item).episodeId)
      );
      const sourceEpisodes =
        subjectInfo?.episodes && subjectInfo.episodes.length > 0
          ? subjectInfo.episodes
          : getReportFallbackEpisodes(currentReport);
      const missingEpisodes = sourceEpisodes.filter((episode) => episode.id && !savedEpisodeIds.has(episode.id));
      const savedCount = seasonTrend?.savedReportCount ?? currentSubjectHistory.length;
      const candidates = missingEpisodes.map((episode) => ({
        id: episode.id,
        url: buildSearchEpisodeUrl(episode.id),
        label: getEpisodeChoiceLabel(episode),
        status: "pending" as const
      }));

      if (candidates.length === 0) {
        throw new Error("没有找到可补齐的未保存章节。");
      }

      setPendingSeasonReportGeneration({
        subjectKey,
        subjectName,
        savedReportCount: savedCount,
        episodeTotal: subjectInfo?.episodeTotal ?? currentReport.meta.episodeTotal,
        candidates
      });
    } catch (caught) {
      setSeasonTrendError(caught instanceof Error ? caught.message : "章节列表加载失败，请稍后重试。");
    }
  }

  async function confirmSeasonReportGeneration() {
    if (!visiblePendingSeasonReportGeneration) return;
    const generationPlan = visiblePendingSeasonReportGeneration;
    setPendingSeasonReportGeneration(null);
    seasonReportGenerationCancelledRef.current = false;
    seasonReportGenerationAbortRef.current?.abort();

    const initialItems = generationPlan.candidates.map((item) => ({ ...item, status: "pending" as const }));
    const currentSeasonTrend = seasonTrend;
    const requiredReportCount =
      currentSeasonTrend &&
      (currentSeasonTrend.subjectId === report?.meta.subjectId || currentSeasonTrend.subjectName === generationPlan.subjectName)
        ? currentSeasonTrend.requiredReportCount
        : generationPlan.episodeTotal
          ? Math.ceil(generationPlan.episodeTotal / 2)
          : 2;
    const initialSavedReportCount = generationPlan.savedReportCount;
    setSeasonReportGeneration({
      subjectKey: generationPlan.subjectKey,
      status: "running",
      totalCount: initialItems.length,
      completedCount: 0,
      failedCount: 0,
      initialSavedReportCount,
      savedReportCount: initialSavedReportCount,
      requiredReportCount,
      missingReportCount: Math.max(0, requiredReportCount - initialSavedReportCount),
      currentIndex: 0,
      currentLabel: initialItems[0]?.label,
      streamingText: "",
      message: "正在串行生成缺失章节报告。",
      items: initialItems
    });

    let completedCount = 0;
    let failedCount = 0;

    for (let index = 0; index < initialItems.length; index += 1) {
      const item = initialItems[index];
      if (seasonReportGenerationCancelledRef.current) break;

      const abortController = new AbortController();
      seasonReportGenerationAbortRef.current = abortController;
      setSeasonReportGeneration((current) =>
        current
          ? {
              ...current,
              status: "running",
              currentIndex: index,
              currentLabel: item.label,
              streamingText: "",
              items: current.items.map((entry) =>
                entry.id === item.id ? { ...entry, status: "running", error: undefined } : entry
              )
            }
          : current
      );

      try {
        const nextReport = await analyzeEpisodeReport(item.url, {
          signal: abortController.signal,
          onDelta: (text) => {
            setSeasonReportGeneration((current) =>
              current ? { ...current, streamingText: `${current.streamingText}${text}` } : current
            );
          }
        });

        await saveReport(nextReport, item.url, { navigate: false });
        completedCount += 1;
        const savedReportCount = initialSavedReportCount + completedCount;
        const missingReportCount = Math.max(0, requiredReportCount - savedReportCount);
        setSeasonReportGeneration((current) =>
          current
            ? {
                ...current,
                completedCount,
                savedReportCount,
                missingReportCount,
                items: current.items.map((entry) =>
                  entry.id === item.id ? { ...entry, status: "completed" } : entry
                )
              }
            : current
        );
        setSeasonTrend((current) =>
          current && getSubjectKeyFromSeasonTrend(current) === generationPlan.subjectKey
            ? {
                ...current,
                savedReportCount,
                missingReportCount,
                available: current.available
              }
            : current
        );
      } catch (caught) {
        if (abortController.signal.aborted || seasonReportGenerationCancelledRef.current) {
          break;
        }

        failedCount += 1;
        const message = caught instanceof Error ? caught.message : "生成失败，请稍后重试。";
        setSeasonReportGeneration((current) =>
          current
            ? {
                ...current,
                failedCount,
                items: current.items.map((entry) =>
                  entry.id === item.id ? { ...entry, status: "failed", error: message } : entry
                )
              }
            : current
        );
      } finally {
        if (seasonReportGenerationAbortRef.current === abortController) {
          seasonReportGenerationAbortRef.current = null;
        }
      }
    }

    const cancelled = seasonReportGenerationCancelledRef.current;
    setSeasonReportGeneration((current) => {
      if (!current) return current;
      return {
        ...current,
        status: cancelled ? "cancelled" : failedCount > 0 ? "failed" : "completed",
        completedCount,
        failedCount,
        currentLabel: undefined,
        streamingText: "",
        message: cancelled
          ? "已取消生成，已完成的报告已保留。"
          : failedCount > 0
            ? "部分章节生成失败，已完成的报告已保留。"
            : "缺失章节报告已生成完成。"
      };
    });
    seasonReportGenerationCancelledRef.current = false;
    void loadSeasonTrend();
  }

  function cancelSeasonReportGeneration() {
    seasonReportGenerationCancelledRef.current = true;
    seasonReportGenerationAbortRef.current?.abort();
    setSeasonReportGeneration((current) =>
      current
        ? {
            ...current,
            status: "cancelled",
            currentLabel: undefined,
            streamingText: "",
            message: "正在取消，已完成的报告会保留。",
            items: current.items.map((item) => (item.status === "pending" ? { ...item, status: "cancelled" } : item))
          }
        : current
    );
  }

  const groupedHistory = useMemo(() => {
    const groups = new Map<string, SavedReport[]>();
    history.forEach((item) => {
      const subjectName = getSubjectNameFromMeta(getSavedReportMeta(item));
      groups.set(subjectName, [...(groups.get(subjectName) || []), item]);
    });
    return [...groups.entries()].map(([subjectName, items]) => [
      subjectName,
      sortSavedReportsByEpisode(items)
    ] as const);
  }, [history]);

  useEffect(() => {
    setCollapsedSubjects((current) => {
      if (current.size === 0) return current;

      const availableSubjects = new Set(groupedHistory.map(([subjectName]) => subjectName));
      const next = new Set([...current].filter((subjectName) => availableSubjects.has(subjectName)));
      return next.size === current.size ? current : next;
    });
  }, [groupedHistory]);

  const currentSubjectHistory = useMemo(() => {
    if (!currentSubjectKey) return [];
    return sortSavedReportsByEpisode(history.filter((item) => getSubjectKeyFromMeta(getSavedReportMeta(item)) === currentSubjectKey));
  }, [currentSubjectKey, history]);

  const currentKnownEpisodeTotal = report?.meta.subjectId ? subjectInfoById[report.meta.subjectId]?.episodeTotal : undefined;
  const currentSubjectInfo = report?.meta.subjectId ? subjectInfoById[report.meta.subjectId] : undefined;
  const bangumiSourceUrl = isBangumiEpisodeUrl(url) ? getComparableEpisodeUrl(url) : "";
  const currentSavedReport = useMemo(() => {
    if (!report) return undefined;
    return history.find((item) => isSameReportEpisode(item, report));
  }, [history, report]);
  const currentReportLiked = isSavedReportLiked(currentSavedReport);
  const reportGeneratedAt = report?.generatedAt || currentSavedReport?.savedAt;
  const reportGeneratedAtLabel = formatReportGeneratedAt(reportGeneratedAt);
  const reportIsStale = isReportStale(reportGeneratedAt);
  const requestSubjectTitleTranslation = useCallback(async (meta: Report["meta"], allowAi: boolean) => {
    if (!meta.subjectId || !meta.subjectTitle?.trim()) return;
    if (!allowAi && meta.subjectTitleCn?.trim()) return;

    const existingState = subjectTitleTranslations[meta.subjectId];
    if (!allowAi && existingState?.status === "needs-ai") {
      setPendingAiSubjectTitleTranslation({
        subjectId: meta.subjectId,
        title: meta.subjectTitle
      });
      return;
    }

    if (!allowAi && (existingState?.status === "loading" || existingState?.status === "ready")) {
      return;
    }

    setSubjectTitleTranslations((current) => ({
      ...current,
      [meta.subjectId as string]: { status: "loading" }
    }));

    try {
      const response = await fetch("/api/subject-translation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subjectId: meta.subjectId,
          title: meta.subjectTitle,
          allowAi
        })
      });
      const payload = (await response.json()) as {
        translation?: string;
        source?: EpisodeTitleTranslationSource;
        needsAiConfirmation?: boolean;
        error?: string;
      };

      if (!response.ok) {
        throw new Error(payload.error || "标题翻译失败，请稍后重试。");
      }

      if (payload.translation && payload.source) {
        setSubjectTitleTranslations((current) => ({
          ...current,
          [meta.subjectId as string]: {
            status: "ready",
            translation: payload.translation,
            source: payload.source
          }
        }));
        return;
      }

      if (payload.needsAiConfirmation) {
        setSubjectTitleTranslations((current) => ({
          ...current,
          [meta.subjectId as string]: { status: "needs-ai" }
        }));
        setPendingAiSubjectTitleTranslation({
          subjectId: meta.subjectId,
          title: meta.subjectTitle
        });
      }
    } catch (caught) {
      setSubjectTitleTranslations((current) => ({
        ...current,
        [meta.subjectId as string]: {
          status: "error",
          error: caught instanceof Error ? caught.message : "标题翻译失败，请稍后重试。"
        }
      }));
    }
  }, [subjectTitleTranslations]);

  const requestEpisodeTitleTranslation = useCallback(async (meta: Report["meta"], allowAi: boolean) => {
    if (!allowAi && meta.episodeTitleCn?.trim()) return;
    const existingState = episodeTitleTranslations[meta.episodeId];
    if (!allowAi && existingState?.status === "needs-ai") {
      setPendingAiTitleTranslation({
        episodeId: meta.episodeId,
        title: meta.title,
        subjectTitle: meta.subjectTitle,
        subjectTitleCn: meta.subjectTitleCn,
        episodeNumber: meta.episodeNumber
      });
      return;
    }

    if (!allowAi && (existingState?.status === "loading" || existingState?.status === "ready")) {
      return;
    }

    setEpisodeTitleTranslations((current) => ({
      ...current,
      [meta.episodeId]: { status: "loading" }
    }));

    try {
      const response = await fetch("/api/episode-translation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          episodeId: meta.episodeId,
          title: meta.title,
          subjectTitle: meta.subjectTitle,
          subjectTitleCn: meta.subjectTitleCn,
          episodeNumber: meta.episodeNumber,
          allowAi
        })
      });
      const payload = (await response.json()) as {
        translation?: string;
        source?: EpisodeTitleTranslationSource;
        needsAiConfirmation?: boolean;
        error?: string;
      };

      if (!response.ok) {
        throw new Error(payload.error || "标题翻译失败，请稍后重试。");
      }

      if (payload.translation && payload.source) {
        setEpisodeTitleTranslations((current) => ({
          ...current,
          [meta.episodeId]: {
            status: "ready",
            translation: payload.translation,
            source: payload.source
          }
        }));
        return;
      }

      if (payload.needsAiConfirmation) {
        setEpisodeTitleTranslations((current) => ({
          ...current,
          [meta.episodeId]: { status: "needs-ai" }
        }));
        setPendingAiTitleTranslation({
          episodeId: meta.episodeId,
          title: meta.title,
          subjectTitle: meta.subjectTitle,
          subjectTitleCn: meta.subjectTitleCn,
          episodeNumber: meta.episodeNumber
        });
      }
    } catch (caught) {
      setEpisodeTitleTranslations((current) => ({
        ...current,
        [meta.episodeId]: {
          status: "error",
          error: caught instanceof Error ? caught.message : "标题翻译失败，请稍后重试。"
        }
      }));
    }
  }, [episodeTitleTranslations]);

  function confirmAiTitleTranslation() {
    if (!pendingAiTitleTranslation || !report) return;
    const translationRequest = pendingAiTitleTranslation;
    setPendingAiTitleTranslation(null);
    void requestEpisodeTitleTranslation(
      {
        ...report.meta,
        episodeId: translationRequest.episodeId,
        title: translationRequest.title,
        subjectTitle: translationRequest.subjectTitle,
        subjectTitleCn: translationRequest.subjectTitleCn,
        episodeNumber: translationRequest.episodeNumber
      },
      true
    );
  }

  function confirmAiSubjectTitleTranslation() {
    if (!pendingAiSubjectTitleTranslation || !report) return;
    const translationRequest = pendingAiSubjectTitleTranslation;
    setPendingAiSubjectTitleTranslation(null);
    void requestSubjectTitleTranslation(
      {
        ...report.meta,
        subjectId: translationRequest.subjectId,
        subjectTitle: translationRequest.title
      },
      true
    );
  }

  const runAnalysis = useCallback(async (trimmedUrl: string) => {
    setError("");
    setReport(null);
    setStreamingText("");
    setLoading(true);

    try {
      const response = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: trimmedUrl })
      });

      if (!response.ok) {
        const payload = await response.json();
        throw new Error(payload.error || "生成失败，请稍后重试。");
      }

      if (!response.body) {
        throw new Error("浏览器没有收到流式响应。");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const events = buffer.split("\n\n");
        buffer = events.pop() || "";

        for (const eventBlock of events) {
          const eventName = eventBlock.match(/^event: (.+)$/m)?.[1];
          const dataLine = eventBlock.match(/^data: (.+)$/m)?.[1];
          if (!eventName || !dataLine) continue;

          const payload = JSON.parse(dataLine);

          if (eventName === "delta") {
            setStreamingText((current) => current + payload.text);
          }

          if (eventName === "final") {
            setReport(payload);
            saveReport(payload, trimmedUrl);
          }

          if (eventName === "error") {
            throw new Error(payload.error || "流式生成失败，请稍后重试。");
          }
        }
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "生成失败，请稍后重试。");
    } finally {
      setLoading(false);
    }
  }, [saveReport]);

  const startAnalysis = useCallback((trimmedUrl: string) => {
    const existingReport = findExistingReport(history, trimmedUrl);
    if (existingReport) {
      setPendingDuplicate(existingReport);
      return;
    }

    void runAnalysis(trimmedUrl);
  }, [history, runAnalysis]);

  async function searchByTitle(query: string) {
    setError("");
    setSearchResults([]);
    setSelectedSearchResult(null);
    setSearchEpisodes([]);
    setSearching(true);

    try {
      const response = await fetch(`/api/search?q=${encodeURIComponent(query)}`, { cache: "no-store" });
      const payload = (await response.json()) as { results?: SearchResult[]; error?: string };
      if (!response.ok) {
        throw new Error(payload.error || "搜索失败，请稍后重试。");
      }

      const results = payload.results || [];
      if (results.length === 0) {
        throw new Error("没有找到匹配的 Bangumi 条目，请试试更完整的作品名。");
      }

      setSearchResults(results);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "搜索失败，请稍后重试。");
    } finally {
      setSearching(false);
    }
  }

  useEffect(() => {
    if (!historyLoaded || loading) return;

    const params = new URLSearchParams(window.location.search);
    const queryUrl = (params.get("url") || params.get("episodeUrl") || "").trim();
    if (!queryUrl || autoAnalyzeUrlRef.current === queryUrl) return;

    autoAnalyzeUrlRef.current = queryUrl;
    setUrl(queryUrl);
    setPendingAutoAnalyzeUrl(queryUrl);
  }, [historyLoaded, loading]);

  useEffect(() => {
    if (!historyLoaded) return;

    async function openRouteReport() {
      const routeReportId = getReportIdFromPath(pathname);
      if (returningHomeRef.current) {
        loadedRouteReportIdRef.current = null;
        if (!routeReportId) {
          returningHomeRef.current = false;
        }
        return;
      }

      if (!routeReportId) {
        if (pendingRouteReportIdRef.current) return;
        loadedRouteReportIdRef.current = null;
        setReport(null);
        return;
      }

      if (pendingRouteReportIdRef.current && pendingRouteReportIdRef.current !== routeReportId) return;
      if (loadedRouteReportIdRef.current === routeReportId) return;
      const routeItem = history.find((item) => item.id === routeReportId) || { id: routeReportId } as SavedReport;
      await openSavedReport(routeItem, { replace: true });
    }

    void openRouteReport();
  }, [history, historyLoaded, openSavedReport, pathname]);

  function analyze(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmedUrl = url.trim();
    if (!trimmedUrl) return;

    if (isBangumiEpisodeUrl(trimmedUrl)) {
      setSearchResults([]);
      setSelectedSearchResult(null);
      setSearchEpisodes([]);
      startAnalysis(trimmedUrl);
      return;
    }

    void searchByTitle(trimmedUrl);
  }

  async function selectSearchResult(result: SearchResult) {
    setError("");
    setSelectedSearchResult(result);
    setSearchEpisodes([]);
    setLoadingSearchEpisodes(true);

    try {
      const cachedInfo = subjectInfoById[result.subjectId];
      let subjectInfo = cachedInfo;

      if (!subjectInfo?.episodes) {
        const response = await fetch(`/api/subject-info?subjectId=${encodeURIComponent(result.subjectId)}`, {
          cache: "no-store"
        });
        const payload = (await response.json()) as SubjectInfo & { error?: string };
        if (!response.ok) {
          throw new Error(payload.error || "章节列表加载失败，请稍后重试。");
        }
        subjectInfo = payload;
        setSubjectInfoById((current) => ({ ...current, [result.subjectId]: payload }));
      }

      if (subjectInfo) {
        setSubjectInfoById((current) => ({ ...current, [result.subjectId]: subjectInfo }));
      }

      const episodes = (subjectInfo?.episodes || []).map((episode) => ({
        ...episode,
        url: buildSearchEpisodeUrl(episode.id)
      }));
      if (episodes.length === 0) {
        throw new Error("这个条目暂时没有可选择的正片章节。");
      }

      setSearchEpisodes(episodes);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "章节列表加载失败，请稍后重试。");
    } finally {
      setLoadingSearchEpisodes(false);
    }
  }

  function selectSearchEpisode(episode: SearchEpisodeChoice) {
    setSearchResults([]);
    setSelectedSearchResult(null);
    setSearchEpisodes([]);
    setUrl(episode.url);
    startAnalysis(episode.url);
  }

  function closeSearchSelectionDialog() {
    setSearchResults([]);
    setSelectedSearchResult(null);
    setSearchEpisodes([]);
    setLoadingSearchEpisodes(false);
  }

  function useExistingReport() {
    if (!pendingDuplicate) return;
    void openSavedReport(pendingDuplicate);
  }

  function regenerateDuplicateReport() {
    if (!pendingDuplicate) return;
    const duplicateUrl = url.trim() || pendingDuplicate.url;
    setPendingDuplicate(null);
    void runAnalysis(duplicateUrl);
  }

  function regenerateCurrentReport() {
    if (!report) return;
    setPendingReportRegeneration({
      url: report.meta.url,
      title: getHistoryEpisodeLabel(report)
    });
  }

  function confirmReportRegeneration() {
    if (!pendingReportRegeneration) return;
    const regenerationUrl = pendingReportRegeneration.url;
    setPendingReportRegeneration(null);
    void runAnalysis(regenerationUrl);
  }

  function confirmAutoAnalyze() {
    if (!pendingAutoAnalyzeUrl) return;
    const analysisUrl = pendingAutoAnalyzeUrl;
    setPendingAutoAnalyzeUrl("");
    startAnalysis(analysisUrl);
  }

  function navigateEpisode(direction: EpisodeDirection) {
    if (!report) return;
    if (isEpisodeBoundary(report, direction, currentKnownEpisodeTotal)) return;

    const step = direction === "previous" ? -1 : 1;
    let target: SavedReport | undefined;
    const adjacentEpisodeId =
      direction === "previous" ? report.meta.previousEpisodeId : report.meta.nextEpisodeId;

    if (adjacentEpisodeId) {
      target = currentSubjectHistory.find((item) => getSavedReportMeta(item).episodeId === adjacentEpisodeId);
    } else if (typeof report.meta.episodeSort === "number") {
      const expectedEpisodeSort = report.meta.episodeSort + step;
      target = currentSubjectHistory.find((item) => getSavedReportMeta(item).episodeSort === expectedEpisodeSort);
    } else if (typeof report.meta.episodeNumber === "number") {
      const expectedEpisodeNumber = report.meta.episodeNumber + step;
      target = currentSubjectHistory.find((item) => getSavedReportMeta(item).episodeNumber === expectedEpisodeNumber);
    } else {
      const currentIndex = currentSubjectHistory.findIndex((item) => getSavedReportMeta(item).url === report.meta.url);
      target = currentIndex >= 0 ? currentSubjectHistory[currentIndex + step] : undefined;
    }

    if (target) {
      void openSavedReport(target);
      return;
    }

    const adjacentEpisode = getAdjacentEpisodeInfo(report, direction, currentSubjectInfo);
    const availabilityWarning = getEpisodeAvailabilityWarning(adjacentEpisode);
    if (direction === "next" && availabilityWarning) {
      setMissingEpisodePrompt({
        direction,
        reason: "unaired",
        url: buildAdjacentEpisodeUrl(report, direction),
        episode: adjacentEpisode,
        warning: availabilityWarning
      });
      return;
    }

    if (isEpisodeUnavailable(report, direction, currentKnownEpisodeTotal)) {
      setMissingEpisodePrompt({
        direction,
        reason: "unavailable"
      });
      return;
    }

    setMissingEpisodePrompt({
      direction,
      url: buildAdjacentEpisodeUrl(report, direction)
    });
  }

  function generateMissingEpisode() {
    if (!missingEpisodePrompt?.url) return;
    const generationUrl = missingEpisodePrompt.url;
    setMissingEpisodePrompt(null);
    setUrl(generationUrl);
    void runAnalysis(generationUrl);
  }

  function toggleHistoryGroup(subjectName: string) {
    setCollapsedSubjects((current) => {
      const next = new Set(current);
      if (next.has(subjectName)) {
        next.delete(subjectName);
      } else {
        next.add(subjectName);
      }
      return next;
    });
  }

  return (
    <main className="app-shell">
      {reportSwitching ? <div className="report-switch-mask" aria-hidden="true" /> : null}
      <aside className="history-sidebar">
        <div className="history-title">
          <span>
            <History size={18} />
            最近
          </span>
        </div>
        {groupedHistory.length > 0 ? (
          <div className="history-groups">
            {groupedHistory.map(([subjectName, items]) => {
              const isCollapsed = collapsedSubjects.has(subjectName);

              return (
                <section className="history-group" key={subjectName}>
                  <button
                    aria-expanded={!isCollapsed}
                    className="history-group-toggle"
                    type="button"
                    onClick={() => toggleHistoryGroup(subjectName)}
                  >
                    <span className="history-group-name">
                      {isCollapsed ? <ChevronRight size={17} /> : <ChevronDown size={17} />}
                      <HoverScrollText className="history-group-label" text={subjectName} />
                    </span>
                    <span className="history-group-count">{items.length}</span>
                  </button>
                  {!isCollapsed ? (
                    <div className="history-items">
                      {items.map((item) => {
                        const meta = getSavedReportMeta(item);
                        const savedAtLabel = formatSavedAt(item.savedAt);
                        const liked = isSavedReportLiked(item);

                        return (
                          <button
                            className={[report?.meta.url === meta.url ? "history-item active" : "history-item", liked ? "liked" : ""]
                              .filter(Boolean)
                              .join(" ")}
                            key={item.id}
                            type="button"
                            onClick={() => void openSavedReport(item)}
                          >
                            <HoverScrollText className="history-item-label" text={getHistoryEpisodeLabelFromMeta(meta)} />
                            <span className="history-item-meta">
                              {liked ? (
                                <span className="history-like-indicator" title="已喜欢">
                                  <Heart size={15} fill="currentColor" />
                                </span>
                              ) : null}
                              {savedAtLabel ? <span className="history-saved-at">{savedAtLabel}</span> : null}
                              <span
                                className="history-delete"
                                role="button"
                                tabIndex={0}
                                title="删除这条历史"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  setDeleteHistoryPrompt(item);
                                }}
                                onKeyDown={(event) => {
                                  if (event.key === "Enter" || event.key === " ") {
                                    event.preventDefault();
                                    event.stopPropagation();
                                    setDeleteHistoryPrompt(item);
                                  }
                                }}
                              >
                                <Trash2 size={17} />
                              </span>
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  ) : null}
                </section>
              );
            })}
          </div>
        ) : (
          <p className="history-empty">生成报告后会按动画标题保存在这里。</p>
        )}
      </aside>

      <div className="main-content">
      <div className="top-actions">
        {report || !isHomePath(pathname) ? (
          <button className="home-button" type="button" onClick={goHome}>
            <Home size={17} />
            <span>回到首页</span>
          </button>
        ) : null}
        <button className="theme-toggle" type="button" onClick={toggleTheme}>
          {theme === "day" ? <Moon size={17} /> : <Sun size={17} />}
          <span>{theme === "day" ? "夜间模式" : "日间模式"}</span>
        </button>
      </div>
      <section className={report ? "hero hero-report" : "hero"}>
        <div className="hero-copy">
          {report ? (
            <>
              <div className="eyebrow">
                <Eye size={16} />
                Bangumi Lens / Episode Report
              </div>
              <HeroSubjectTitle
                meta={report.meta}
                translationState={report.meta.subjectId ? subjectTitleTranslations[report.meta.subjectId] : undefined}
                onRequestTranslation={requestSubjectTitleTranslation}
              />
              <HeroEpisodeTitle
                meta={report.meta}
                translationState={episodeTitleTranslations[report.meta.episodeId]}
                onRequestTranslation={requestEpisodeTitleTranslation}
              />
              {reportGeneratedAtLabel ? (
                <p className="hero-report-meta">
                  <Clock size={15} />
                  <span>该报告生成时间 {reportGeneratedAtLabel}</span>
                  {reportIsStale && !loading ? (
                    <button type="button" onClick={regenerateCurrentReport}>
                      <RefreshCw size={14} />
                      <span>重新生成</span>
                    </button>
                  ) : null}
                </p>
              ) : null}
            </>
          ) : (
            <>
              <div className="eyebrow">
                <Eye size={16} />
                Bangumi Lens
              </div>
              <h1>把单集评论区整理成一份可复盘的阅读报告</h1>
              <p>
                输入 Bangumi 章节链接，聚合公开评论、楼中楼回复、表情和点赞信号，生成剧情简述、主流观点、讨论热点与共鸣吐槽。
              </p>
            </>
          )}
        </div>

        <form className="analyze-box" onSubmit={analyze}>
          <label htmlFor="episode-url">Bangumi 章节链接或作品名</label>
          <div className="input-row">
            <input
              id="episode-url"
              placeholder="输入作品名或 https://bgm.tv/ep/123456"
              value={url}
              onChange={(event) => setUrl(event.target.value)}
              disabled={loading || searching}
            />
            {bangumiSourceUrl ? (
              <a className="source-link-button" href={bangumiSourceUrl} rel="noreferrer" target="_blank" title="打开 Bangumi 原页">
                <ExternalLink size={18} />
                <span>原页</span>
              </a>
            ) : null}
            <button disabled={loading || searching || !url.trim()} type="submit">
              {loading || searching ? (
                <Loader2 className="spin" size={18} />
              ) : isBangumiEpisodeUrl(url) ? (
                <ArrowRight size={18} />
              ) : (
                <Search size={18} />
              )}
              <span>{loading ? "分析中" : searching ? "搜索中" : isBangumiEpisodeUrl(url) ? "生成" : "搜索"}</span>
            </button>
          </div>
          <p className="hint">输入作品名会先搜索 Bangumi 条目；确认作品后再选择具体话数。已有本地报告会在选中章节后提示查看或重新生成。</p>
        </form>
      </section>

      {error ? (
        <section className="notice error">
          <AlertCircle size={20} />
          <span>{error}</span>
        </section>
      ) : null}

      {loading ? (
        <section className="loading-panel">
          <Loader2 className="spin" size={28} />
          <div>
            <h2>正在整理评论区</h2>
            <p>
              {streamingText
                ? "DeepSeek 正在流式生成报告。"
                : "抓取公开评论、联网检索本集公开信息，并计算讨论权重。"}
            </p>
            {streamingText ? <pre className="stream-preview">{streamingText}</pre> : null}
          </div>
        </section>
      ) : null}

      {!loading && !report && !error ? (
        <section className="empty-dashboard" aria-label="报告预览">
          <div className="empty-dashboard-head">
            <div>
              <span className="label">Report Preview</span>
              <h2>生成后会在这里展开完整阅读报告</h2>
            </div>
            <p>可从左侧或下方打开最近报告，继续按章节阅读。</p>
          </div>

          <div className="preview-grid">
            {EMPTY_PREVIEW_ITEMS.map((item) => (
              <article className="preview-card" key={item.title}>
                <div className="item-icon">{item.icon}</div>
                <div>
                  <h3>{item.title}</h3>
                  <p>{item.description}</p>
                </div>
              </article>
            ))}
          </div>

          <div className="recent-shortcuts">
            <div className="recent-shortcuts-head">
              <span className="label">Recent Reports</span>
              <p>{history.length > 0 ? "最近保存的报告" : "还没有本地报告"}</p>
            </div>
            {history.length > 0 ? (
              <div className="recent-shortcut-list">
                {history.slice(0, 3).map((item) => (
                  <button className="recent-shortcut" key={item.id} type="button" onClick={() => void openSavedReport(item)}>
                    <span>
                      {isSavedReportLiked(item) ? (
                        <span className="recent-like-mark" aria-label="已喜欢">
                          <Heart size={13} fill="currentColor" />
                        </span>
                      ) : null}
                      {getSubjectNameFromMeta(getSavedReportMeta(item))}
                    </span>
                    <strong>{getHistoryEpisodeLabelFromMeta(getSavedReportMeta(item))}</strong>
                  </button>
                ))}
              </div>
            ) : (
              <p className="recent-empty">粘贴一个 Bangumi 章节链接并生成后，报告会保存在这里，之后可以直接点开回看。</p>
            )}
          </div>
        </section>
      ) : null}

      {report ? (
        <section className="report-shell">
          {(() => {
            const isFirstEpisode = isEpisodeBoundary(report, "previous", currentKnownEpisodeTotal);
            const isFinalEpisode = isEpisodeBoundary(report, "next", currentKnownEpisodeTotal);

            return (
          <div className="report-header">
            <div className="report-title-block">
              <div className="episode-nav" aria-label="章节导航">
                <button
                  type="button"
                  onClick={() => navigateEpisode("previous")}
                  disabled={isFirstEpisode}
                  title={isFirstEpisode ? "已经是第一话" : "上一集"}
                >
                  <ChevronLeft size={17} />
                  <span>上一集</span>
                </button>
                <button
                  type="button"
                  onClick={() => navigateEpisode("next")}
                  disabled={isFinalEpisode}
                  title={isFinalEpisode ? "已经是最终话" : "下一集"}
                >
                  <span>下一集</span>
                  <ChevronRight size={17} />
                </button>
                <button
                  className={showSeasonTrend ? "season-trend-toggle active" : "season-trend-toggle"}
                  type="button"
                  onClick={() => (showSeasonTrend ? setShowSeasonTrend(false) : void loadSeasonTrend())}
                  aria-pressed={showSeasonTrend}
                  title="查看作品趋势"
                >
                  <BarChart3 size={17} />
                  <span>作品趋势</span>
                </button>
                {currentSavedReport ? (
                  <>
                    <button
                      className={currentReportLiked ? "episode-like-button liked" : "episode-like-button"}
                      type="button"
                      aria-pressed={currentReportLiked}
                      onClick={() => setLikeHistoryPrompt({ item: currentSavedReport, liked: !currentReportLiked })}
                      title={currentReportLiked ? "取消喜欢本集" : "喜欢本集"}
                    >
                      <Heart size={17} fill={currentReportLiked ? "currentColor" : "none"} />
                      <span>{currentReportLiked ? "已喜欢" : "喜欢本集"}</span>
                    </button>
                    <button
                      className="episode-delete-button"
                      type="button"
                      onClick={() => setDeleteHistoryPrompt(currentSavedReport)}
                      title="删除本集记录"
                    >
                      <Trash2 size={17} />
                      <span>删除本集记录</span>
                    </button>
                  </>
                ) : null}
              </div>
            </div>
            <div className="metrics">
              <RatingMetric rating={report.meta.rating} subjectRating={report.meta.subjectRating} />
              <Metric label="评论" value={report.stats.commentCount} />
              <Metric label="回复" value={report.stats.replyCount} />
              <Metric label="参与用户" value={report.stats.participantCount ?? report.stats.commentCount} />
            </div>
          </div>
            );
          })()}

          {showSeasonTrend ? (
            <SeasonTrendPanel
              trends={seasonTrend}
              loading={seasonTrendLoading}
              error={seasonTrendError}
              aiSummary={seasonTrendAiSummary}
              aiSummaryLoading={seasonTrendAiSummaryLoading}
              aiSummaryError={seasonTrendAiSummaryError}
              generation={visibleSeasonReportGeneration}
              onRequestAiSummary={requestSeasonTrendAiSummary}
              onPrepareSeasonGeneration={prepareSeasonReportGeneration}
              onCancelSeasonGeneration={cancelSeasonReportGeneration}
            />
          ) : null}

          <div className="report-grid">
            <article className="panel primary">
              <div className="panel-title">
                <Sparkles size={18} />
                <h2>单集剧情简述</h2>
              </div>
              <p>
                <RichText text={report.episodeSummary} />
              </p>
            </article>

            <article className="panel primary">
              <div className="panel-title">
                <MessageCircle size={18} />
                <h2>评论区观点总结</h2>
              </div>
              <p>
                <RichText text={report.opinionSummary} />
              </p>
            </article>

            <ReportSection
              title="讨论热点"
              items={report.discussionHotspots}
              icon={<MessageCircle size={18} />}
              episodeUrl={report.meta.url}
            />

            <ReportSection
              title="共鸣吐槽"
              items={report.resonancePoints}
              icon={<ThumbsUp size={18} />}
              episodeUrl={report.meta.url}
            />
          </div>

          <section className="extension-section">
            <div className="extension-head">
              <span className="label">Extended Notes</span>
              <h2>延伸信息与剧透风险</h2>
              <p>补充评论区提到的小细节和公开资料中的场外制作线索；可能涉及后续内容的信息仍会隐藏。</p>
            </div>

            <div className="extension-grid">
              <ReportSection
                title="本集小细节"
                items={report.episodeDetails}
                icon={<Sparkles size={18} />}
                episodeUrl={report.meta.url}
              />
              <ReportSection
                title="场外制作信息"
                items={report.productionNotes}
                icon={<Star size={18} />}
                episodeUrl={report.meta.url}
              />
            </div>
          </section>

          {report.spoilerNotes.length > 0 ? (
            <article className="spoiler-card">
              <div className="spoiler-card-head">
                <span className="spoiler-icon">
                  <AlertCircle size={18} />
                </span>
                <div>
                  <strong>含剧透风险</strong>
                  <p>以下内容可能涉及原作、后续剧情或评论区推测。</p>
                </div>
              </div>
              <div>
                <ol className="spoiler-list">
                  {report.spoilerNotes.map((note, index) => (
                    <li key={`${note}-${index}`} tabIndex={0}>
                      <span>
                        <RichText text={note} />
                      </span>
                    </li>
                  ))}
                </ol>
              </div>
            </article>
          ) : null}
        </section>
      ) : null}

      {searchSelectionOpen ? (
        <div className="modal-backdrop" role="presentation" onMouseDown={closeSearchSelectionDialog}>
          <section
            aria-labelledby="search-selection-title"
            aria-modal="true"
            className="search-selection-modal"
            role="dialog"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="search-selection-head">
              <div>
                <span className="label">搜索结果</span>
                <h2 id="search-selection-title">选择作品和章节</h2>
              </div>
              <button className="secondary-action" type="button" onClick={closeSearchSelectionDialog}>
                关闭
              </button>
            </div>
            <div className="search-selection-grid">
              <section className="search-selection-column" aria-label="作品选择">
                <div className="search-selection-column-head">
                  <strong>作品</strong>
                  <span>{searchResults.length} 个结果</span>
                </div>
                <div className="search-results" aria-label="搜索结果">
                  {searchResults.map((result) => (
                    <button
                      className={selectedSearchResult?.subjectId === result.subjectId ? "selected" : ""}
                      key={`${result.subjectId}-${result.firstEpisodeId}`}
                      type="button"
                      onClick={() => selectSearchResult(result)}
                    >
                      <span>{getSearchResultTitle(result)}</span>
                      <strong>{getSearchResultSubtitle(result)}</strong>
                      {result.episodeTotal ? <em>全 {result.episodeTotal} 话</em> : null}
                    </button>
                  ))}
                </div>
              </section>
              <section className="search-selection-column" aria-label="章节选择">
                <div className="search-selection-column-head">
                  <strong>章节</strong>
                  <span>{selectedSearchResult ? getSearchResultTitle(selectedSearchResult) : "先选择作品"}</span>
                </div>
                {selectedSearchResult ? (
                  <div className="episode-choice-panel" aria-label="章节选择">
                    {loadingSearchEpisodes ? (
                      <p className="episode-choice-loading">
                        <Loader2 className="spin" size={16} />
                        正在加载章节列表
                      </p>
                    ) : (
                      <div className="episode-choice-list">
                        {searchEpisodes.map((episode) => (
                          <button key={episode.id} type="button" onClick={() => selectSearchEpisode(episode)}>
                            <span>{getEpisodeChoiceLabel(episode)}</span>
                            {episode.airdate ? <em>{episode.airdate}</em> : null}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                ) : (
                  <p className="search-selection-empty">选择左侧作品后，会在这里显示可生成报告的具体话数。</p>
                )}
              </section>
            </div>
          </section>
        </div>
      ) : null}
      {pendingDuplicate ? (
        <ConfirmDialog
          titleId="duplicate-title"
          icon={<History size={20} />}
          label="已有报告"
          title="这个章节已经分析过"
          description={
            <>
              已保存的是《{getSubjectNameFromMeta(getSavedReportMeta(pendingDuplicate))}》
              的「{getSavedReportMeta(pendingDuplicate).title}」。你可以直接查看旧报告，也可以用最新评论重新生成并覆盖旧记录。
            </>
          }
          onClose={useExistingReport}
          actions={[
            { label: "查看旧报告", onClick: useExistingReport, className: "secondary-action" },
            { label: "重新生成", onClick: regenerateDuplicateReport, className: "primary-action" }
          ]}
        />
      ) : null}
      {pendingAutoAnalyzeUrl ? (
        <ConfirmDialog
          titleId="auto-analyze-title"
          icon={<Sparkles size={20} />}
          label="准备分析"
          title="确认生成这集的 Bangumi Lens 报告"
          description={
            <>
              即将读取公开评论并生成本地报告。确认后才会开始分析，取消会保留当前链接供你稍后手动生成。
            </>
          }
          onClose={() => setPendingAutoAnalyzeUrl("")}
          actions={[
            { label: "取消", onClick: () => setPendingAutoAnalyzeUrl(""), className: "secondary-action" },
            { label: "确认生成", onClick: confirmAutoAnalyze, className: "primary-action" }
          ]}
        />
      ) : null}
      {pendingReportRegeneration ? (
        <ConfirmDialog
          titleId="report-regeneration-title"
          icon={<RefreshCw size={20} />}
          label="重新生成"
          title="确认重新生成这份报告？"
          description={
            <>
              将重新读取公开评论并覆盖当前本地报告「{pendingReportRegeneration.title}」。确认后才会开始分析。
            </>
          }
          onClose={() => setPendingReportRegeneration(null)}
          actions={[
            { label: "取消", onClick: () => setPendingReportRegeneration(null), className: "secondary-action" },
            { label: "确认重新生成", onClick: confirmReportRegeneration, className: "primary-action" }
          ]}
        />
      ) : null}
      {visiblePendingSeasonReportGeneration ? (
        <ConfirmDialog
          titleId="season-report-generation-title"
          icon={<Sparkles size={20} />}
          label="全集总结报告"
          title="确认生成缺失章节报告？"
          description={
            <>
              将为《{visiblePendingSeasonReportGeneration.subjectName}》串行生成 {visiblePendingSeasonReportGeneration.candidates.length} 集缺失报告，
              生成完成一集就保存一集。中途取消只会停止后续生成，已经完成的报告会保留。
            </>
          }
          onClose={() => setPendingSeasonReportGeneration(null)}
          actions={[
            { label: "取消", onClick: () => setPendingSeasonReportGeneration(null), className: "secondary-action" },
            { label: "确认生成", onClick: confirmSeasonReportGeneration, className: "primary-action" }
          ]}
        />
      ) : null}
      {pendingAiTitleTranslation ? (
        <ConfirmDialog
          titleId="title-translation-title"
          icon={<Sparkles size={20} />}
          label="AI 翻译"
          title="调用模型 API 翻译标题？"
          description={
            <>
              Bangumi 官方数据里没有这个章节的中文标题。确认后会调用一次模型 API 生成悬停翻译，可能产生少量费用。
            </>
          }
          onClose={() => setPendingAiTitleTranslation(null)}
          actions={[
            { label: "取消", onClick: () => setPendingAiTitleTranslation(null), className: "secondary-action" },
            { label: "确认翻译", onClick: confirmAiTitleTranslation, className: "primary-action" }
          ]}
        />
      ) : null}
      {pendingAiSubjectTitleTranslation ? (
        <ConfirmDialog
          titleId="subject-title-translation-title"
          icon={<Sparkles size={20} />}
          label="AI 翻译"
          title="调用模型 API 翻译动画标题？"
          description={
            <>
              Bangumi 官方数据里没有这个动画标题的中文名。确认后会调用一次模型 API 生成悬停翻译，可能产生少量费用。
            </>
          }
          onClose={() => setPendingAiSubjectTitleTranslation(null)}
          actions={[
            { label: "取消", onClick: () => setPendingAiSubjectTitleTranslation(null), className: "secondary-action" },
            { label: "确认翻译", onClick: confirmAiSubjectTitleTranslation, className: "primary-action" }
          ]}
        />
      ) : null}
      {missingEpisodePrompt ? (
        <ConfirmDialog
          titleId="missing-episode-title"
          icon={<AlertCircle size={20} />}
          label={
            missingEpisodePrompt.reason === "unavailable"
              ? "章节未开放"
              : missingEpisodePrompt.reason === "unaired"
                ? "可能未播出"
                : "本地未命中"
          }
          title={
            missingEpisodePrompt.reason === "unavailable" ? (
              <>还没有可打开的{getDirectionLabel(missingEpisodePrompt.direction)}</>
            ) : missingEpisodePrompt.reason === "unaired" ? (
              <>{getDirectionLabel(missingEpisodePrompt.direction)}可能还没有播出</>
            ) : (
              <>还没有{getDirectionLabel(missingEpisodePrompt.direction)}的分析结果</>
            )
          }
          description={
            missingEpisodePrompt.reason === "unavailable" ? (
              <>
                这部作品的总话数里还包含后续章节，但 Bangumi 当前没有提供对应章节链接，可能还没有播出或暂未开放。
              </>
            ) : missingEpisodePrompt.reason === "unaired" ? (
              <>
                Bangumi 已经提供章节链接
                {missingEpisodePrompt.warning?.airdate
                  ? `，官方章节日期是 ${formatEpisodeAirdate(missingEpisodePrompt.warning.airdate)}`
                  : ""}
                {missingEpisodePrompt.warning?.certainty === "possible"
                  ? "，但目前还没有评论，可能还没到实际播出时间。"
                  : "，看起来还没有到播出日期。"}
                你可以先留在当前报告，或者确认后仍然生成。
              </>
            ) : (
              <>
                本地没有保存对应章节的报告。你可以先留在当前报告，也可以现在生成{getDirectionLabel(missingEpisodePrompt.direction)}
                的分析结果。
              </>
            )
          }
          onClose={() => setMissingEpisodePrompt(null)}
          actions={[
            {
              label: missingEpisodePrompt.reason === "unavailable" ? "知道了" : "暂不生成",
              onClick: () => setMissingEpisodePrompt(null),
              className: "secondary-action"
            },
            ...(missingEpisodePrompt.reason !== "unavailable" && missingEpisodePrompt.url
              ? [
                  {
                    label: getMissingEpisodePrimaryActionLabel(missingEpisodePrompt),
                    onClick: generateMissingEpisode,
                    className: "primary-action" as const
                  }
                ]
              : [])
          ]}
        />
      ) : null}
      {deleteHistoryPrompt ? (
        <ConfirmDialog
          titleId="delete-history-title"
          icon={<Trash2 size={20} />}
          label="删除历史"
          title="确认删除这条历史"
          description={
            <>
              将从本地历史中删除「{getHistoryEpisodeLabelFromMeta(getSavedReportMeta(deleteHistoryPrompt))}」。这个操作不会删除 Bangumi 上的内容。
            </>
          }
          onClose={() => setDeleteHistoryPrompt(null)}
          actions={[
            { label: "取消", onClick: () => setDeleteHistoryPrompt(null), className: "secondary-action" },
            { label: "删除", onClick: confirmDeleteHistoryItem, className: "primary-action" }
          ]}
        />
      ) : null}
      {likeHistoryPrompt ? (
        <ConfirmDialog
          titleId="like-history-title"
          icon={<Heart size={20} fill={likeHistoryPrompt.liked ? "currentColor" : "none"} />}
          label={likeHistoryPrompt.liked ? "喜欢本集" : "取消喜欢"}
          title={likeHistoryPrompt.liked ? "确认喜欢本集" : "确认取消喜欢"}
          description={
            <>
              将{likeHistoryPrompt.liked ? "标记" : "取消标记"}「
              {getHistoryEpisodeLabelFromMeta(getSavedReportMeta(likeHistoryPrompt.item))}」为喜欢状态。
            </>
          }
          onClose={() => setLikeHistoryPrompt(null)}
          actions={[
            { label: "取消", onClick: () => setLikeHistoryPrompt(null), className: "secondary-action" },
            { label: likeHistoryPrompt.liked ? "确认喜欢" : "取消喜欢", onClick: confirmLikeHistoryItem, className: "primary-action" }
          ]}
        />
      ) : null}
      </div>
    </main>
  );
}
