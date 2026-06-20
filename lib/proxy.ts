import { HttpsProxyAgent } from "https-proxy-agent";
import { ProxyAgent, setGlobalDispatcher } from "undici";

let configuredProxy: string | undefined;

export function getProxyUrl() {
  return (
    process.env.BANGUMI_LENS_PROXY ||
    process.env.HTTPS_PROXY ||
    process.env.HTTP_PROXY ||
    process.env.https_proxy ||
    process.env.http_proxy
  );
}

function normalizeProxyUrl(proxyUrl: string) {
  return proxyUrl.includes("://") ? proxyUrl : `http://${proxyUrl}`;
}

export function configureServerProxy() {
  const proxyUrl = getProxyUrl();

  if (!proxyUrl || configuredProxy === proxyUrl) {
    return;
  }

  setGlobalDispatcher(new ProxyAgent(normalizeProxyUrl(proxyUrl)));
  configuredProxy = proxyUrl;
}

export function createHttpsProxyAgent() {
  const proxyUrl = getProxyUrl();
  return proxyUrl ? new HttpsProxyAgent(normalizeProxyUrl(proxyUrl)) : undefined;
}
