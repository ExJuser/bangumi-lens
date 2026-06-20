export type EpisodeMeta = {
  url: string;
  episodeId: string;
  episodeNumber?: number;
  episodeSort?: number;
  previousEpisodeId?: string | null;
  nextEpisodeId?: string | null;
  currentEpisode?: EpisodeAvailabilitySignals;
  previousEpisode?: EpisodeAvailabilitySignals | null;
  nextEpisode?: EpisodeAvailabilitySignals | null;
  subjectId?: string;
  title: string;
  episodeTitleCn?: string;
  subjectTitle?: string;
  subjectTitleCn?: string;
  episodeTotal?: number;
  rating?: EpisodeRating;
  subjectRating?: EpisodeRating;
  summary?: string;
};

export type EpisodeAvailabilitySignals = {
  id: string;
  sort?: number;
  title?: string;
  titleCn?: string;
  airdate?: string;
  duration?: string;
  commentCount?: number;
};

export type EpisodeRating = {
  average: number;
  voteCount: number;
  modeScore?: number;
  votes: Record<string, number>;
};

export type BangumiComment = {
  id: string;
  floor?: string;
  author?: string;
  authorId?: string;
  text: string;
  createdAt?: string;
  replyCount: number;
  reactionCount: number;
  likeCount: number;
  reactions: BangumiReaction[];
  replies: BangumiReply[];
};

export type BangumiReaction = {
  label: string;
  count: number;
};

export type BangumiReply = {
  id: string;
  author?: string;
  authorId?: string;
  text: string;
  reactionCount: number;
};

export type WeightedComment = BangumiComment & {
  weight: number;
  signals: {
    discussion: number;
    resonance: number;
    information: number;
  };
};

export type ScrapedEpisode = {
  meta: EpisodeMeta;
  comments: BangumiComment[];
};

export type ReportItem = {
  title: string;
  summary: string;
  quotes?: ReportQuote[];
  sourceCommentIds: string[];
};

export type ReportQuote = {
  text: string;
  sourceCommentId?: string;
  reactions?: BangumiReaction[];
};

export type AnalyzeReport = {
  episodeSummary: string;
  opinionSummary: string;
  episodeDetails: ReportItem[];
  productionNotes: ReportItem[];
  discussionHotspots: ReportItem[];
  resonancePoints: ReportItem[];
  spoilerNotes: string[];
  generatedAt: string;
  meta: EpisodeMeta;
  stats: {
    commentCount: number;
    replyCount: number;
    reactionCount: number;
    participantCount: number;
  };
};
