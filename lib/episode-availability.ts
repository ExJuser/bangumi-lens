import type { EpisodeAvailabilitySignals } from "@/lib/types";

export type EpisodeAvailabilityWarning = {
  certainty: "confirmed" | "possible";
  airdate?: string | null;
  commentCount?: number;
};

function getLocalDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function normalizeAirdate(airdate?: string | null) {
  const normalized = airdate?.trim();
  if (!normalized || normalized === "0000-00-00") return undefined;

  const match = normalized.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return undefined;

  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return undefined;

  return normalized;
}

export function getEpisodeAvailabilityWarning(
  episode: EpisodeAvailabilitySignals | null | undefined,
  now = new Date()
): EpisodeAvailabilityWarning | undefined {
  if (!episode) return undefined;

  const airdate = normalizeAirdate(episode.airdate);
  if (!airdate) return undefined;

  const today = getLocalDateKey(now);
  if (airdate > today) {
    return {
      certainty: "confirmed",
      airdate,
      commentCount: episode.commentCount
    };
  }

  if (airdate === today && episode.commentCount === 0) {
    return {
      certainty: "possible",
      airdate,
      commentCount: episode.commentCount
    };
  }

  return undefined;
}
