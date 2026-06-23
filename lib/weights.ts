import type { BangumiComment, WeightedComment } from "@/lib/types";

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function informationScore(text: string) {
  const cleanText = text.replace(/\s+/g, "");
  const lengthScore = clamp(cleanText.length / 120, 0, 1);
  const hasReasoning = /因为|所以|但是|不过|感觉|暗示|伏笔|冲突|角色|演出|镜头|节奏|剧情/.test(text) ? 0.35 : 0;
  return clamp(lengthScore + hasReasoning, 0, 1);
}

export function weightComments(comments: BangumiComment[]): WeightedComment[] {
  return comments
    .map((comment) => {
      const discussion = Math.log1p(comment.replyCount) * 2.2;
      const resonance = Math.log1p(comment.reactionCount) * 1.8;
      const information = informationScore(comment.text) * 1.6;
      const weight = discussion + resonance + information;

      return {
        ...comment,
        weight,
        signals: {
          discussion,
          resonance,
          information
        }
      };
    })
    .sort((a, b) => b.weight - a.weight);
}

export function buildCommentDigest(comments: WeightedComment[]) {
  const topOverall = comments.slice(0, 40);
  const discussionHeavy = [...comments]
    .filter((comment) => comment.replyCount > 0)
    .sort((a, b) => b.signals.discussion - a.signals.discussion)
    .slice(0, 18);
  const resonanceHeavy = [...comments]
    .filter((comment) => comment.reactionCount > 0)
    .sort((a, b) => b.signals.resonance - a.signals.resonance)
    .slice(0, 18);

  const byId = new Map<string, WeightedComment>();
  [...topOverall, ...discussionHeavy, ...resonanceHeavy].forEach((comment) => byId.set(comment.id, comment));

  return [...byId.values()].map((comment) => ({
    id: comment.id,
    floor: comment.floor,
    author: comment.author,
    text: comment.text.slice(0, 420),
    sampleReplies: comment.replies.slice(0, 6).map((reply) => reply.text.slice(0, 180)),
    signals: comment.signals,
    weight: Number(comment.weight.toFixed(2))
  }));
}
