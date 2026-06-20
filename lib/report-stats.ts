import type { WeightedComment } from "@/lib/types";

function addAuthor(participants: Set<string>, author?: string) {
  const normalizedAuthor = author?.trim();
  if (normalizedAuthor) {
    participants.add(normalizedAuthor);
  }
}

export function buildReportStats(comments: Pick<WeightedComment, "author" | "replyCount" | "reactionCount" | "likeCount" | "replies">[]) {
  const participants = new Set<string>();

  comments.forEach((comment) => {
    addAuthor(participants, comment.author);
    comment.replies.forEach((reply) => addAuthor(participants, reply.author));
  });

  return {
    commentCount: comments.length,
    replyCount: comments.reduce((sum, comment) => sum + comment.replyCount, 0),
    reactionCount: comments.reduce((sum, comment) => sum + comment.reactionCount + comment.likeCount, 0),
    participantCount: participants.size
  };
}
