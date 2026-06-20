import { NextResponse } from "next/server";
import { fetchBangumiSubjectTitleCn } from "@/lib/bangumi";
import { appendAppLog, errorFields } from "@/lib/logger";
import { translateSubjectTitle } from "@/lib/report";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type TranslationSource = "official" | "ai";

type TranslationRequest = {
  subjectId?: unknown;
  title?: unknown;
  allowAi?: unknown;
};

export async function POST(request: Request) {
  const startedAt = Date.now();
  const body = (await request.json()) as TranslationRequest;
  const subjectId = typeof body.subjectId === "string" ? body.subjectId.trim() : "";
  const title = typeof body.title === "string" ? body.title.trim() : "";
  const allowAi = body.allowAi === true;

  if (!subjectId || !title) {
    return NextResponse.json({ error: "缺少作品 ID 或标题。" }, { status: 400 });
  }

  try {
    const officialTitle = await fetchBangumiSubjectTitleCn(subjectId);
    if (officialTitle) {
      await logTranslationComplete("official", subjectId, startedAt);
      return NextResponse.json({ translation: officialTitle, source: "official" satisfies TranslationSource });
    }

    if (!allowAi) {
      await appendAppLog("info", "subject_translation.official.empty", {
        subjectId,
        durationMs: Date.now() - startedAt
      });
      return NextResponse.json({ needsAiConfirmation: true });
    }

    const translation = await translateSubjectTitle({ title });

    await logTranslationComplete("ai", subjectId, startedAt);
    return NextResponse.json({ translation, source: "ai" satisfies TranslationSource });
  } catch (error) {
    await appendAppLog("error", "subject_translation.failed", {
      subjectId,
      ...errorFields(error),
      durationMs: Date.now() - startedAt
    });

    const message = error instanceof Error ? error.message : "标题翻译失败，请稍后重试。";
    return NextResponse.json({ error: formatTranslationError(message) }, { status: 500 });
  }
}

async function logTranslationComplete(source: TranslationSource, subjectId: string, startedAt: number) {
  await appendAppLog("info", "subject_translation.complete", {
    subjectId,
    source,
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
