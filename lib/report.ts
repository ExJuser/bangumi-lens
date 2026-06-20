import OpenAI from "openai";
import { z } from "zod";
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

  return [
    {
      role: "system" as const,
      content: `你是辅助阅读 Bangumi 动画章节评论区的中文分析助手。输出必须是合法 JSON，不能包含 Markdown。JSON 结构必须匹配这个形状：${responseJsonSchema()}。内容要克制、结构化、可复盘，不能逐条堆砌评论，不能把外部推测伪装成本集事实。`
    },
    {
      role: "user" as const,
      content: JSON.stringify({
        task:
          "基于公开章节元数据、单集评分、评论摘要和公开网页检索摘要，生成看完本集后的复盘报告。episodeSummary 需要比简报更详细，控制在 300-450 字，按本集主要事件、角色行动、冲突推进、结尾信息组织；只能概括这一集已经发生或评论区明确讨论的内容。opinionSummary 也控制在 300-450 字，不能简单堆砌评论，要综合主流观点、争议点、共鸣吐槽、少数但有信息量的看法，并结合单集评分的平均分、投票数和分布判断观众整体接受度；如果评分样本很少，要明确把它当作弱信号。episodeDetails 输出 3-6 条本集小细节，优先提炼评论区提到的台词、分镜、演出、作画、背景物件、标题梗、角色动作或被忽略的信息点；每条 summary 60-120 字。productionNotes 输出 2-5 条场外制作信息，可以参考公开网页检索中的制作组社交媒体、官网公告、导演、演出、脚本、分镜、作画监督、原画师、CV 或访谈线索；若信息不确定，必须写明是公开资料线索或评论区推测，不能编造具体人名。discussionHotspots、resonancePoints、episodeDetails、productionNotes 的每个条目都可以给 quotes 字段，优先给 3 条，最多 4 条，每条 12-60 字；同一条目下的 quotes 应尽量来自不同 weightedComments.id，用来体现不止一个用户表达过相近观点。quotes 必须是对象数组，格式为 { text, sourceCommentId }；text 必须来自 weightedComments.text 或 sampleReplies 的短摘录，不能改写成模型自己的话，不能虚构原文；sourceCommentId 必须填写对应 weightedComments.id，引用楼中楼时填写其所属主评论 id；如果没有可靠代表性原文，返回空数组。sourceCommentIds 必须对应引用或摘要依据的评论 id。外部网页检索只作为辅助线索，必须忽略明显不相关结果；不得把后续剧集、原作后续、未确认推测写成本集事实。讨论热点和共鸣点各 2-4 条。涉及后续剧情、原作、评论中未被本集确认的信息，放入 spoilerNotes。",
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
