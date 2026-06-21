const DEFAULT_USER_AGENT = "local/bangumi-lens/0.1.0 (https://github.com/local/bangumi-lens)";

export function getBangumiUserAgent() {
  return process.env.BANGUMI_USER_AGENT?.trim() || DEFAULT_USER_AGENT;
}

function getBangumiAccessToken() {
  return process.env.BANGUMI_ACCESS_TOKEN?.trim();
}

export function createBangumiApiHeaders(init?: HeadersInit): HeadersInit {
  const token = getBangumiAccessToken();
  return {
    "User-Agent": getBangumiUserAgent(),
    Accept: "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...init
  };
}

export function createBangumiPageHeaders(init?: HeadersInit): HeadersInit {
  return {
    "User-Agent": getBangumiUserAgent(),
    Accept: "text/html,application/xhtml+xml",
    ...init
  };
}
