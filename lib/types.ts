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
  airdate?: string | null;
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
  sourceEvidence?: ReportSourceEvidence[];
};

export type ReportQuote = {
  text: string;
  sourceCommentId?: string;
  reactions?: BangumiReaction[];
  source?: ReportSourceEvidence;
};

export type ReportSourceEvidence = {
  id: string;
  floor?: string;
  author?: string;
  text: string;
  replyCount: number;
  reactionCount: number;
  reactions: BangumiReaction[];
  commentUrl?: string;
};

export type AnalyzeReport = {
  episodeSummary: string;
  opinionSummary: string;
  episodeDetails: ReportItem[];
  productionNotes: ReportItem[];
  discussionHotspots: ReportItem[];
  resonancePoints: ReportItem[];
  stanceDistribution?: StanceDistributionItem[];
  spoilerNotes: string[];
  generatedAt: string;
  promptPreset?: {
    id: string;
    name: string;
  };
  meta: EpisodeMeta;
  stats: {
    commentCount: number;
    replyCount: number;
    reactionCount: number;
    participantCount: number;
  };
};

export type StanceDistributionItem = {
  label: "好评" | "失望" | "争议" | "中立" | "玩梗" | "制作讨论" | "原作对比";
  percentage: number;
  summary: string;
  sourceCommentIds: string[];
  sourceEvidence?: ReportSourceEvidence[];
};
