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
  const weightedComments: WeightedComment[] = [];

  for (const comment of comments) {
    const discussion = Math.log1p(comment.replyCount) * 2.2;
    const resonance = Math.log1p(comment.reactionCount) * 1.8;
    const information = informationScore(comment.text) * 1.6;
    const weight = discussion + resonance + information;

    weightedComments.push({
      ...comment,
      weight,
      signals: {
        discussion,
        resonance,
        information
      }
    });
  }

  return weightedComments.sort((a, b) => b.weight - a.weight);
}

export function buildCommentDigest(comments: WeightedComment[]) {
  const topOverall = comments.slice(0, 40);
  const discussionHeavy = selectTopBySignal(
    comments,
    (comment) => comment.replyCount > 0,
    (comment) => comment.signals.discussion,
    18
  );
  const resonanceHeavy = selectTopBySignal(
    comments,
    (comment) => comment.reactionCount > 0,
    (comment) => comment.signals.resonance,
    18
  );

  const byId = new Map<string, WeightedComment>();
  addCommentsById(byId, topOverall);
  addCommentsById(byId, discussionHeavy);
  addCommentsById(byId, resonanceHeavy);

  const digest = [];
  for (const comment of byId.values()) {
    const sampleReplies: string[] = [];
    for (const reply of comment.replies) {
      sampleReplies.push(reply.text.slice(0, 180));
      if (sampleReplies.length >= 6) break;
    }

    digest.push({
      id: comment.id,
      floor: comment.floor,
      author: comment.author,
      text: comment.text.slice(0, 420),
      sampleReplies,
      signals: comment.signals,
      weight: Number(comment.weight.toFixed(2))
    });
  }

  return digest;
}

function addCommentsById(byId: Map<string, WeightedComment>, comments: WeightedComment[]) {
  for (const comment of comments) {
    byId.set(comment.id, comment);
  }
}

function selectTopBySignal(
  comments: WeightedComment[],
  include: (comment: WeightedComment) => boolean,
  readScore: (comment: WeightedComment) => number,
  limit: number
) {
  const selected: WeightedComment[] = [];

  for (const comment of comments) {
    if (!include(comment)) continue;

    const score = readScore(comment);
    let insertAt = selected.length;
    while (insertAt > 0 && readScore(selected[insertAt - 1]) < score) {
      insertAt -= 1;
    }

    if (insertAt >= limit) continue;
    selected.splice(insertAt, 0, comment);
    if (selected.length > limit) selected.pop();
  }

  return selected;
}
