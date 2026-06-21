import { NextResponse } from "next/server";
import { fetchBangumiEpisode } from "@/lib/bangumi";
import { appendAppLog, errorFields } from "@/lib/logger";
import { createReportStream, parseReportOutput } from "@/lib/report";
import { buildReportStats } from "@/lib/report-stats";
import { parseBangumiEpisodeUrl } from "@/lib/url";
import { searchEpisodeWebContext } from "@/lib/web-search";
import { weightComments } from "@/lib/weights";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const startedAt = Date.now();
  await appendAppLog("info", "analyze.request.start");

  try {
    const body = (await request.json()) as { url?: unknown; promptPresetId?: unknown; customPrompt?: unknown };
    if (typeof body.url !== "string") {
      await appendAppLog("warn", "analyze.request.invalid", { reason: "missing_url" });
      return NextResponse.json({ error: "请提供 Bangumi 章节链接。" }, { status: 400 });
    }

    const parsedUrl = parseBangumiEpisodeUrl(body.url);
    const promptPresetId = typeof body.promptPresetId === "string" ? body.promptPresetId : undefined;
    const customPrompt = typeof body.customPrompt === "string" ? body.customPrompt : undefined;
    await appendAppLog("info", "analyze.request.accepted", {
      episodeId: parsedUrl.episodeId,
      promptPresetId,
      hasCustomPrompt: Boolean(customPrompt?.trim())
    });

    const episode = await fetchBangumiEpisode(body.url);
    const weightedComments = weightComments(episode.comments);
    const webContext = await searchEpisodeWebContext(episode.meta);
    const stream = await createReportStream(episode.meta, weightedComments, webContext, promptPresetId, customPrompt);

    const encoder = new TextEncoder();
    let outputText = "";

    const responseStream = new ReadableStream({
      async start(controller) {
        function send(event: string, data: unknown) {
          controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
        }

        try {
          send("start", {
            meta: episode.meta,
            stats: buildReportStats(weightedComments),
            webContextCount: webContext.length
          });

          for await (const chunk of stream) {
            const delta = chunk.choices[0]?.delta?.content || "";
            if (!delta) continue;
            outputText += delta;
            send("delta", { text: delta });
          }

          const report = parseReportOutput(outputText, episode.meta, weightedComments, promptPresetId);
          send("final", report);
          await appendAppLog("info", "analyze.request.complete", {
            subjectId: episode.meta.subjectId,
            episodeId: episode.meta.episodeId,
            promptPresetId: report.promptPreset?.id,
            commentCount: weightedComments.length,
            webContextCount: webContext.length,
            durationMs: Date.now() - startedAt
          });
          controller.close();
        } catch (error) {
          const rawMessage = error instanceof Error ? error.message : "分析失败，请稍后重试。";
          send("error", { error: formatAnalyzeError(rawMessage) });
          await appendAppLog("error", "analyze.stream.failed", {
            ...errorFields(error),
            durationMs: Date.now() - startedAt
          });
          controller.close();
        }
      }
    });

    return new Response(responseStream, {
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no"
      }
    });
  } catch (error) {
    const rawMessage = error instanceof Error ? error.message : "分析失败，请稍后重试。";
    const message = formatAnalyzeError(rawMessage);
    const isInputError =
      message.includes("请输入") ||
      message.includes("仅支持") ||
      message.includes("不是 Bangumi") ||
      message.includes("请提供");

    await appendAppLog(isInputError ? "warn" : "error", "analyze.request.failed", {
      ...errorFields(error),
      status: isInputError ? 400 : 500,
      durationMs: Date.now() - startedAt
    });

    return NextResponse.json({ error: message }, { status: isInputError ? 400 : 500 });
  }
}

function formatAnalyzeError(message: string) {
  const lowerMessage = message.toLowerCase();

  if (message.includes("429") || lowerMessage.includes("quota") || lowerMessage.includes("billing")) {
    return "模型 API 返回额度、限速或计费限制错误。请检查当前 API Key 的余额、额度和账单设置后重试。";
  }

  if (lowerMessage.includes("connection error") || lowerMessage.includes("fetch failed")) {
    return "服务端外部请求失败。请确认代理地址 BANGUMI_LENS_PROXY 可用，且 Bangumi 与模型 API 都能通过该代理访问。";
  }

  return message;
}
