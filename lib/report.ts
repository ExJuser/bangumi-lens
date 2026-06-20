import OpenAI from "openai";
import { z } from "zod";
import { loadReportPrompt } from "@/lib/report-prompt";
import { configureServerProxy, createHttpsProxyAgent } from "@/lib/proxy";
import { buildReportStats } from "@/lib/report-stats";
import type { AnalyzeReport, EpisodeMeta, ReportItem, WeightedComment } from "@/lib/types";
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

const reportSchema = z.object({
  episodeSummary: z.string(),
  opinionSummary: z.string(),
  episodeDetails: z
    .array(
      z.object({
        title: z.string(),
        summary: z.string(),
        quotes: z.array(quoteSchema).default([]),
        sourceCommentIds: z.array(z.string())
      })
    )
    .default([]),
  productionNotes: z
    .array(
      z.object({
        title: z.string(),
        summary: z.string(),
        quotes: z.array(quoteSchema).default([]),
        sourceCommentIds: z.array(z.string())
      })
    )
    .default([]),
  discussionHotspots: z
    .array(
      z.object({
        title: z.string(),
        summary: z.string(),
        quotes: z.array(quoteSchema).default([]),
        sourceCommentIds: z.array(z.string())
      })
    )
    .default([]),
  resonancePoints: z
    .array(
      z.object({
        title: z.string(),
        summary: z.string(),
        quotes: z.array(quoteSchema).default([]),
        sourceCommentIds: z.array(z.string())
      })
    )
    .default([]),
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

function enrichReportItemsWithReactions(items: ReportItem[], comments: WeightedComment[]) {
  const commentsById = new Map(comments.map((comment) => [comment.id, comment]));

  return items.map((item) => ({
    ...item,
    quotes: item.quotes?.map((quote) => {
      if (!quote.sourceCommentId) return quote;
      const sourceComment = commentsById.get(quote.sourceCommentId);
      if (!sourceComment || sourceComment.reactions.length === 0) return quote;

      return {
        ...quote,
        reactions: sourceComment.reactions
      };
    })
  }));
}

function requireReportInputs(comments: WeightedComment[]) {
  const apiKey = process.env.DEEPSEEK_API_KEY || process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("缺少 DEEPSEEK_API_KEY，无法生成 AI 摘要。请在 .env.local 中配置后重试。");
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

export function parseReportOutput(outputText: string, meta: EpisodeMeta, comments: WeightedComment[]): AnalyzeReport {
  const parsed = reportSchema.parse(JSON.parse(outputText));

  return {
    ...parsed,
    episodeDetails: enrichReportItemsWithReactions(parsed.episodeDetails, comments),
    productionNotes: enrichReportItemsWithReactions(parsed.productionNotes, comments),
    discussionHotspots: enrichReportItemsWithReactions(parsed.discussionHotspots, comments),
    resonancePoints: enrichReportItemsWithReactions(parsed.resonancePoints, comments),
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
