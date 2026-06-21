import { NextResponse } from "next/server";
import { fetchBangumiEpisodeTitleCn } from "@/lib/bangumi";
import { appendAppLog, errorFields } from "@/lib/logger";
import { translateEpisodeTitle } from "@/lib/report";
import { readServerCache, writeServerCache } from "@/lib/server-cache";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type TranslationSource = "official" | "ai";
type CachedTranslation = {
  translation: string;
  source: TranslationSource;
};

const AI_TRANSLATION_CACHE_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

type TranslationRequest = {
  episodeId?: unknown;
  title?: unknown;
  subjectTitle?: unknown;
  subjectTitleCn?: unknown;
  episodeNumber?: unknown;
  allowAi?: unknown;
};

export async function POST(request: Request) {
  const startedAt = Date.now();
  const body = (await request.json()) as TranslationRequest;
  const episodeId = typeof body.episodeId === "string" ? body.episodeId.trim() : "";
  const title = typeof body.title === "string" ? body.title.trim() : "";
  const allowAi = body.allowAi === true;

  if (!episodeId || !title) {
    return NextResponse.json({ error: "缺少章节 ID 或标题。" }, { status: 400 });
  }

  try {
    const officialTitle = await fetchBangumiEpisodeTitleCn(episodeId);
    if (officialTitle) {
      await logTranslationComplete("official", episodeId, startedAt);
      return NextResponse.json({ translation: officialTitle, source: "official" satisfies TranslationSource });
    }

    const cached = await readServerCache<CachedTranslation>(
      "episode-translation",
      episodeId,
      AI_TRANSLATION_CACHE_MAX_AGE_MS
    );
    if (cached?.translation) {
      await logTranslationComplete(cached.source, episodeId, startedAt, true);
      return NextResponse.json({ translation: cached.translation, source: cached.source });
    }

    if (!allowAi) {
      await appendAppLog("info", "episode_translation.official.empty", {
        episodeId,
        durationMs: Date.now() - startedAt
      });
      return NextResponse.json({ needsAiConfirmation: true });
    }

    const translation = await translateEpisodeTitle({
      title,
      subjectTitle: typeof body.subjectTitle === "string" ? body.subjectTitle : undefined,
      subjectTitleCn: typeof body.subjectTitleCn === "string" ? body.subjectTitleCn : undefined,
      episodeNumber: typeof body.episodeNumber === "number" ? body.episodeNumber : undefined
    });
    await writeServerCache<CachedTranslation>("episode-translation", episodeId, {
      translation,
      source: "ai"
    });

    await logTranslationComplete("ai", episodeId, startedAt);
    return NextResponse.json({ translation, source: "ai" satisfies TranslationSource });
  } catch (error) {
    await appendAppLog("error", "episode_translation.failed", {
      episodeId,
      ...errorFields(error),
      durationMs: Date.now() - startedAt
    });

    const message = error instanceof Error ? error.message : "标题翻译失败，请稍后重试。";
    return NextResponse.json({ error: formatTranslationError(message) }, { status: 500 });
  }
}

async function logTranslationComplete(source: TranslationSource, episodeId: string, startedAt: number, cached = false) {
  await appendAppLog("info", "episode_translation.complete", {
    episodeId,
    source,
    cached,
    durationMs: Date.now() - startedAt
  });
}

function formatTranslationError(message: string) {
  const lowerMessage = message.toLowerCase();

  if (message.includes("429") || lowerMessage.includes("quota") || lowerMessage.includes("billing")) {
    return "模型 API 返回额度、限速或计费限制错误。请检查当前 API Key 的余额、额度和账单设置后重试。";
  }

  if (lowerMessage.includes("connection error") || lowerMessage.includes("fetch failed")) {
    return "服务端外部请求失败。请确认代理地址 BANGUMI_LENS_PROXY 可用，且 Bangumi 与模型 API 都能通过该代理访问。";
  }

  return message;
}
