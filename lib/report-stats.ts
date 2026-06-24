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
  let replyCount = 0;
  let reactionCount = 0;

  for (const comment of comments) {
    addParticipant(participants, comment.author, comment.authorId);
    replyCount += comment.replyCount;
    reactionCount += comment.reactionCount;
    for (const reply of comment.replies) {
      addParticipant(participants, reply.author, reply.authorId);
    }
  }

  return {
    commentCount: comments.length,
    replyCount,
    reactionCount,
    participantCount: participants.size
  };
}
