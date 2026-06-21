import OpenAI from "openai";
import { z } from "zod";
import { loadReportPrompt } from "@/lib/report-prompt";
import { configureServerProxy, createHttpsProxyAgent } from "@/lib/proxy";
import { buildReportStats } from "@/lib/report-stats";
import type { AnalyzeReport, EpisodeMeta, ReportItem, ReportSourceEvidence, WeightedComment } from "@/lib/types";
import type { SeasonTrendPayload } from "@/lib/season-trends";
import type { WebSearchResult } from "@/lib/web-search";
import { buildCommentDigest } from "@/lib/weights";

const quoteSchema = z
  .union([
    z.string(),
    z.object({
      text: z.string(),
      sourceCommentId: z.string().optional()
    })
  ])
  .transform((quote) => (typeof quote === "string" ? { text: quote } : quote));

const reportItemSchema = z.object({
  title: z.string(),
  summary: z.string(),
  quotes: z.array(quoteSchema).default([]),
  sourceCommentIds: z.array(z.string())
});

const reportSchema = z.object({
  episodeSummary: z.string(),
  opinionSummary: z.string(),
  episodeDetails: z.array(reportItemSchema).default([]),
  productionNotes: z.array(reportItemSchema).default([]),
  discussionHotspots: z.array(reportItemSchema).default([]),
  resonancePoints: z.array(reportItemSchema).default([]),
  spoilerNotes: z.array(z.string()).default([])
});

function responseJsonSchema() {
  return JSON.stringify({
    episodeSummary: "string",
    opinionSummary: "string",
    episodeDetails: [
      {
        title: "string",
        summary: "string",
        quotes: [{ text: "short original comment quote", sourceCommentId: "comment-id" }],
        sourceCommentIds: ["comment-id"]
      }
    ],
    productionNotes: [
      {
        title: "string",
        summary: "string",
        quotes: [{ text: "short original comment quote", sourceCommentId: "comment-id" }],
        sourceCommentIds: ["comment-id"]
      }
    ],
    discussionHotspots: [
      {
        title: "string",
        summary: "string",
        quotes: [{ text: "short original comment quote", sourceCommentId: "comment-id" }],
        sourceCommentIds: ["comment-id"]
      }
    ],
    resonancePoints: [
      {
        title: "string",
        summary: "string",
        quotes: [{ text: "short original comment quote", sourceCommentId: "comment-id" }],
        sourceCommentIds: ["comment-id"]
      }
    ],
    spoilerNotes: ["string"]
  });
}

function buildCommentUrl(episodeUrl: string, commentId: string) {
  if (/^comment-\d+$/i.test(commentId)) return undefined;

  try {
    const url = new URL(episodeUrl);
    url.hash = commentId.startsWith("post_") ? commentId : `post_${commentId}`;
    return url.toString();
  } catch {
    return undefined;
  }
}

function createSourceEvidence(comment: WeightedComment, episodeUrl: string): ReportSourceEvidence {
  return {
    id: comment.id,
    floor: comment.floor,
    author: comment.author,
    text: comment.text.slice(0, 420),
    replyCount: comment.replyCount,
    reactionCount: comment.reactionCount,
    likeCount: comment.likeCount,
    reactions: comment.reactions,
    commentUrl: buildCommentUrl(episodeUrl, comment.id)
  };
}

function enrichReportItemsWithEvidence(items: ReportItem[], comments: WeightedComment[], meta: EpisodeMeta) {
  const commentsById = new Map(comments.map((comment) => [comment.id, comment]));

  return items.map((item) => ({
    ...item,
    quotes: item.quotes?.map((quote) => {
      if (!quote.sourceCommentId) return quote;
      const sourceComment = commentsById.get(quote.sourceCommentId);
      if (!sourceComment) return quote;

      return {
        ...quote,
        reactions: sourceComment.reactions,
        source: createSourceEvidence(sourceComment, meta.url)
      };
    }),
    sourceEvidence: [...new Set([...(item.sourceCommentIds || []), ...(item.quotes || []).map((quote) => quote.sourceCommentId)])]
      .map((commentId) => (commentId ? commentsById.get(commentId) : undefined))
      .filter((comment): comment is WeightedComment => Boolean(comment))
      .slice(0, 6)
      .map((comment) => createSourceEvidence(comment, meta.url))
  }));
}

function requireReportInputs(comments: WeightedComment[]) {
  const apiKey = process.env.DEEPSEEK_API_KEY || process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("缺少 DEEPSEEK_API_KEY，无法生成 AI 摘要。请在 config/.env.local 中配置后重试。");
  }

  if (comments.length === 0) {
    throw new Error("没有解析到公开评论，暂时无法生成评论区报告。");
  }

  return apiKey;
}

function createClient(apiKey: string) {
  return new OpenAI({
    apiKey,
    baseURL: process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com",
    httpAgent: createHttpsProxyAgent(),
    fetch: globalThis.fetch.bind(globalThis)
  });
}

function requireModelApiKey() {
  const apiKey = process.env.DEEPSEEK_API_KEY || process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("缺少 DEEPSEEK_API_KEY，无法调用模型 API。请在 config/.env.local 中配置后重试。");
  }

  return apiKey;
}

function createMessages(meta: EpisodeMeta, comments: WeightedComment[], webContext: WebSearchResult[] = []) {
  const digest = buildCommentDigest(comments);
  const prompt = loadReportPrompt(responseJsonSchema());

  return [
    {
      role: "system" as const,
      content: prompt.system
    },
    {
      role: "user" as const,
      content: JSON.stringify({
        task: prompt.task,
        episode: meta,
        ratingContext: {
          episodeRating: meta.rating,
          subjectRating: meta.subjectRating,
          instruction:
            "subjectRating is the whole anime subject score. Use it only as background consensus and compare it with episodeRating when useful; do not treat it as this episode's direct rating."
        },
        publicWebContext: webContext,
        weightedComments: digest
      })
    }
  ];
}

export async function translateEpisodeTitle(input: {
  title: string;
  subjectTitle?: string;
  subjectTitleCn?: string;
  episodeNumber?: number;
}) {
  configureServerProxy();

  const apiKey = requireModelApiKey();
  const client = createClient(apiKey);
  const model = process.env.DEEPSEEK_MODEL || "deepseek-v4-flash";

  const response = await client.chat.completions.create({
    model,
    messages: [
      {
        role: "system",
        content:
          "你是动画章节标题翻译助手。只把输入的单集标题翻译成自然、简洁的中文，不解释，不添加引号，不输出集数前缀。"
      },
      {
        role: "user",
        content: JSON.stringify({
          title: input.title,
          subjectTitle: input.subjectTitle,
          subjectTitleCn: input.subjectTitleCn,
          episodeNumber: input.episodeNumber
        })
      }
    ],
    temperature: 0.1
  });

  const translatedTitle = response.choices[0]?.message.content?.trim().replace(/^["“”'「」]+|["“”'「」]+$/g, "");
  if (!translatedTitle) {
    throw new Error("模型 API 未返回可用的标题翻译。");
  }

  return translatedTitle;
}

export async function translateSubjectTitle(input: { title: string }) {
  configureServerProxy();

  const apiKey = requireModelApiKey();
  const client = createClient(apiKey);
  const model = process.env.DEEPSEEK_MODEL || "deepseek-v4-flash";

  const response = await client.chat.completions.create({
    model,
    messages: [
      {
        role: "system",
        content:
          "你是动画标题翻译助手。只把输入的动画标题翻译成自然、简洁的中文标题，不解释，不添加引号，不输出其他内容。"
      },
      {
        role: "user",
        content: JSON.stringify({
          title: input.title
        })
      }
    ],
    temperature: 0.1
  });

  const translatedTitle = response.choices[0]?.message.content?.trim().replace(/^["“”「」『』]+|["“”「」『』]+$/g, "");
  if (!translatedTitle) {
    throw new Error("模型 API 未返回可用的标题翻译。");
  }

  return translatedTitle;
}

export async function refineSeasonTrendSummary(trends: SeasonTrendPayload) {
  configureServerProxy();

  const apiKey = requireModelApiKey();
  const client = createClient(apiKey);
  const model = process.env.DEEPSEEK_MODEL || "deepseek-v4-flash";

  const response = await client.chat.completions.create({
    model,
    messages: [
      {
        role: "system",
        content:
          "你是动画评论趋势总结助手。基于输入的本地 Bangumi Lens 多集趋势，只输出一段自然中文总结，不编造未给出的数据，不超过 220 字。"
      },
      {
        role: "user",
        content: JSON.stringify({
          subjectName: trends.subjectName,
          episodeTotal: trends.episodeTotal,
          savedReportCount: trends.savedReportCount,
          episodes: trends.episodes.map((episode) => ({
            label: episode.label,
            title: episode.title,
            ratingAverage: episode.ratingAverage,
            ratingVoteCount: episode.ratingVoteCount,
            commentCount: episode.commentCount,
            replyCount: episode.replyCount,
            reactionCount: episode.reactionCount,
            participantCount: episode.participantCount,
            discussionHeat: episode.discussionHeat
          })),
          metrics: trends.metrics,
          resonancePoints: trends.resonancePoints.slice(0, 5),
          controversyPoints: trends.controversyPoints.slice(0, 5),
          localSummary: trends.localSummary
        })
      }
    ],
    temperature: 0.2
  });

  const summary = response.choices[0]?.message.content?.trim();
  if (!summary) {
    throw new Error("模型 API 未返回可用的整季总结。");
  }

  return summary;
}

export function parseReportOutput(outputText: string, meta: EpisodeMeta, comments: WeightedComment[]): AnalyzeReport {
  const parsed = reportSchema.parse(JSON.parse(outputText));

  return {
    ...parsed,
    episodeDetails: enrichReportItemsWithEvidence(parsed.episodeDetails, comments, meta),
    productionNotes: enrichReportItemsWithEvidence(parsed.productionNotes, comments, meta),
    discussionHotspots: enrichReportItemsWithEvidence(parsed.discussionHotspots, comments, meta),
    resonancePoints: enrichReportItemsWithEvidence(parsed.resonancePoints, comments, meta),
    generatedAt: new Date().toISOString(),
    meta,
    stats: buildReportStats(comments)
  };
}

export async function createReportStream(
  meta: EpisodeMeta,
  comments: WeightedComment[],
  webContext: WebSearchResult[] = []
) {
  configureServerProxy();

  const apiKey = requireReportInputs(comments);
  const client = createClient(apiKey);
  const model = process.env.DEEPSEEK_MODEL || "deepseek-v4-flash";

  return client.chat.completions.create({
    model,
    messages: createMessages(meta, comments, webContext),
    response_format: { type: "json_object" },
    stream: true,
    temperature: 0.2
  });
}

export async function generateReport(meta: EpisodeMeta, comments: WeightedComment[]): Promise<AnalyzeReport> {
  configureServerProxy();

  const apiKey = requireReportInputs(comments);
  const client = createClient(apiKey);
  const model = process.env.DEEPSEEK_MODEL || "deepseek-v4-flash";

  const response = await client.chat.completions.create({
    model,
    messages: createMessages(meta, comments),
    response_format: { type: "json_object" },
    temperature: 0.2
  });

  const outputText = response.choices[0]?.message.content;
  if (!outputText) {
    throw new Error("DeepSeek 未返回可解析的报告内容。");
  }

  return parseReportOutput(outputText, meta, comments);
}
