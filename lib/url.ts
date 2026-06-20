const EPISODE_PATH = /^\/ep\/(\d+)\/?$/;
const ALLOWED_HOSTS = new Set([
  "bgm.tv",
  "bangumi.tv",
  "chii.in",
  "www.bgm.tv",
  "www.bangumi.tv",
  "www.chii.in"
]);

export function parseBangumiEpisodeUrl(input: string): { normalizedUrl: string; episodeId: string } {
  let url: URL;

  try {
    url = new URL(input.trim());
  } catch {
    throw new Error("请输入完整的 Bangumi 章节链接，例如 https://bgm.tv/ep/123456");
  }

  if (!["http:", "https:"].includes(url.protocol)) {
    throw new Error("仅支持 http 或 https 链接");
  }

  if (!ALLOWED_HOSTS.has(url.hostname)) {
    throw new Error("请输入 bgm.tv、bangumi.tv 或 chii.in 的章节链接");
  }

  const match = url.pathname.match(EPISODE_PATH);
  if (!match) {
    throw new Error("链接看起来不是 Bangumi 章节页，请使用 /ep/数字 格式的链接");
  }

  return {
    normalizedUrl: `https://bgm.tv/ep/${match[1]}`,
    episodeId: match[1]
  };
}
