import type { WeightedComment } from "@/lib/types";

function addParticipant(participants: Set<string>, author?: string, authorId?: string) {
  const normalizedAuthorId = authorId?.trim();
  const normalizedAuthor = author?.trim();
  const participantKey = normalizedAuthorId ? `id:${normalizedAuthorId}` : normalizedAuthor ? `name:${normalizedAuthor}` : "";

  if (participantKey) {
    participants.add(participantKey);
  }
}

export function buildReportStats(
  comments: Pick<WeightedComment, "author" | "authorId" | "replyCount" | "reactionCount" | "replies">[]
) {
  const participants = new Set<string>();

  comments.forEach((comment) => {
    addParticipant(participants, comment.author, comment.authorId);
    comment.replies.forEach((reply) => addParticipant(participants, reply.author, reply.authorId));
  });

  return {
    commentCount: comments.length,
    replyCount: comments.reduce((sum, comment) => sum + comment.replyCount, 0),
    reactionCount: comments.reduce((sum, comment) => sum + comment.reactionCount, 0),
    participantCount: participants.size
  };
}
