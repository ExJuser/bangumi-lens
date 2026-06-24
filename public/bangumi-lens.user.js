// ==UserScript==
// @name         Bangumi Lens episode analyzer
// @namespace    https://github.com/local/bangumi-lens
// @version      0.3.0
// @description  Add Bangumi Lens report status and analyze actions to Bangumi episode pages.
// @match        https://bgm.tv/ep/*
// @match        https://www.bgm.tv/ep/*
// @match        https://bangumi.tv/ep/*
// @match        https://www.bangumi.tv/ep/*
// @match        https://chii.in/ep/*
// @match        https://www.chii.in/ep/*
// @grant        none
// @run-at       document-end
// ==/UserScript==

(function () {
  "use strict";

  const APP_URL = "http://localhost:3000/home";
  var BUTTON_ID = "bangumi-lens-analyze-button";
  var STATUS_ID = "bangumi-lens-status";
  var HOST_ID = "bangumi-lens-button-host";
  var MAX_MOUNT_ATTEMPTS = 20;

  function getEpisodeUrl() {
    var match = window.location.pathname.match(/^\/ep\/(\d+)\/?$/);
    if (!match) return "";
    return "https://bgm.tv/ep/" + match[1];
  }

  function buildAnalyzeUrl(episodeUrl) {
    var url = new URL(APP_URL);
    url.searchParams.set("url", episodeUrl);
    return url.toString();
  }

  function getAppOrigin() {
    return new URL(APP_URL).origin;
  }

  function buildReportUrl(reportId) {
    return getAppOrigin() + "/reports/" + encodeURIComponent(reportId);
  }

  function resolveReportUrl(status) {
    if (status.reportUrl) {
      return new URL(status.reportUrl, getAppOrigin()).toString();
    }
    return status.id ? buildReportUrl(status.id) : "";
  }

  function buildStatusUrl(episodeUrl) {
    var url = new URL(getAppOrigin() + "/api/history/status");
    url.searchParams.set("url", episodeUrl);
    return url.toString();
  }

  function styleHost(host) {
    host.style.display = "inline-flex";
    host.style.alignItems = "center";
    host.style.gap = "6px";
    host.style.flexWrap = "wrap";
    host.style.verticalAlign = "middle";
    host.style.marginLeft = "8px";
  }

  function styleFallbackHost(host) {
    host.style.position = "fixed";
    host.style.right = "18px";
    host.style.bottom = "18px";
    host.style.zIndex = "2147483647";
    host.style.padding = "8px";
    host.style.border = "1px solid rgba(201,75,63,0.22)";
    host.style.borderRadius = "10px";
    host.style.background = "rgba(255,255,255,0.96)";
    host.style.boxShadow = "0 8px 24px rgba(0,0,0,0.16)";
  }

  function styleButton(button) {
    button.style.display = "inline-flex";
    button.style.alignItems = "center";
    button.style.justifyContent = "center";
    button.style.minHeight = "28px";
    button.style.marginLeft = "0";
    button.style.padding = "0 10px";
    button.style.border = "1px solid #d9c6bb";
    button.style.borderRadius = "6px";
    button.style.background = "#fff7ef";
    button.style.color = "#c94b3f";
    button.style.fontWeight = "700";
    button.style.fontSize = "12px";
    button.style.lineHeight = "1";
    button.style.textDecoration = "none";
    button.style.boxSizing = "border-box";
    button.style.cursor = "pointer";
  }

  function styleSecondaryLink(link) {
    link.style.display = "inline-flex";
    link.style.alignItems = "center";
    link.style.justifyContent = "center";
    link.style.minHeight = "24px";
    link.style.padding = "0 8px";
    link.style.border = "1px solid rgba(73,105,143,0.34)";
    link.style.borderRadius = "6px";
    link.style.background = "#f7fbff";
    link.style.color = "#315f9f";
    link.style.fontWeight = "700";
    link.style.fontSize = "11px";
    link.style.lineHeight = "1";
    link.style.textDecoration = "none";
    link.style.boxSizing = "border-box";
  }

  function addPrimaryHover(link) {
    link.addEventListener("mouseenter", function () {
      link.style.background = "#ffe9df";
      link.style.borderColor = "#c94b3f";
    });
    link.addEventListener("mouseleave", function () {
      link.style.background = "#fff7ef";
      link.style.borderColor = "#d9c6bb";
    });
  }

  function addSecondaryHover(link) {
    link.addEventListener("mouseenter", function () {
      link.style.background = "#eaf3ff";
      link.style.borderColor = "#315f9f";
      link.style.color = "#244d84";
    });
    link.addEventListener("mouseleave", function () {
      link.style.background = "#f7fbff";
      link.style.borderColor = "rgba(73,105,143,0.34)";
      link.style.color = "#315f9f";
    });
  }

  function styleBadge(badge, background, border, color) {
    badge.style.display = "inline-flex";
    badge.style.alignItems = "center";
    badge.style.minHeight = "20px";
    badge.style.marginLeft = "6px";
    badge.style.padding = "0 7px";
    badge.style.border = "1px solid " + border;
    badge.style.borderRadius = "999px";
    badge.style.background = background;
    badge.style.color = color;
    badge.style.fontWeight = "700";
    badge.style.fontSize = "11px";
    badge.style.lineHeight = "1";
    badge.style.verticalAlign = "middle";
  }

  function createButton(episodeUrl) {
    var button = document.createElement("a");
    button.id = BUTTON_ID;
    button.href = buildAnalyzeUrl(episodeUrl);
    button.target = "_blank";
    button.rel = "noopener noreferrer";
    button.textContent = "Bangumi Lens \u5206\u6790";
    styleButton(button);
    addPrimaryHover(button);

    return button;
  }

  function createStatusBadge(text, variant) {
    var badge = document.createElement("span");
    badge.textContent = text;

    if (variant === "liked") {
      styleBadge(badge, "#fff1f2", "#fb7185", "#be123c");
    } else if (variant === "stale") {
      styleBadge(badge, "#fff7ed", "#f97316", "#c2410c");
    } else {
      styleBadge(badge, "#ecfdf5", "#10b981", "#047857");
    }

    return badge;
  }

  function formatSavedAt(savedAt) {
    if (!savedAt) return "";
    var date = new Date(savedAt);
    if (!Number.isFinite(date.getTime())) return "";
    return date.toLocaleString("zh-CN", {
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit"
    });
  }

  function createActionLink(text, href, primary) {
    var link = document.createElement("a");
    link.href = href;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.textContent = text;
    if (primary) {
      styleButton(link);
      link.style.minHeight = "24px";
      link.style.padding = "0 8px";
      link.style.fontSize = "11px";
      addPrimaryHover(link);
    } else {
      styleSecondaryLink(link);
      addSecondaryHover(link);
    }
    return link;
  }

  function findOtherEpisodesTarget() {
    var headings = document.querySelectorAll("h2, h3, .subtitle, .sidePanel h2, .sidePanel h3, #columnEpB h2, #columnEpB h3");
    var index;
    var heading;
    var text;

    for (index = 0; index < headings.length; index += 1) {
      heading = headings[index];
      text = (heading.textContent || "").replace(/\s+/g, "");
      if (text.indexOf("\u8fd9\u4e2a\u6761\u76ee\u7684\u5176\u4ed6\u7ae0\u8282") !== -1) {
        return heading;
      }
    }

    return null;
  }

  function findLegacyTitleTarget() {
    return (
      document.querySelector("#columnEpB h2") ||
      document.querySelector(".epDesc h2") ||
      document.querySelector("h1.nameSingle") ||
      document.querySelector("#headerSubject") ||
      document.querySelector(".headerSubject") ||
      document.querySelector("#columnEpA .nameSingle") ||
      document.querySelector("#columnEpB .nameSingle")
    );
  }

  function findMountTarget() {
    return findOtherEpisodesTarget() || findLegacyTitleTarget();
  }

  function createHost(useFallback) {
    var host = document.getElementById(HOST_ID);
    if (host) return host;
    if (!document.body) return null;

    host = document.createElement("span");
    host.id = HOST_ID;
    styleHost(host);

    if (useFallback) {
      styleFallbackHost(host);
      document.body.appendChild(host);
    }

    return host;
  }

  function mountHost(host, target) {
    if (!host || !target || host.parentNode === target) return;
    host.style.position = "";
    host.style.right = "";
    host.style.bottom = "";
    host.style.zIndex = "";
    host.style.padding = "";
    host.style.border = "";
    host.style.borderRadius = "";
    host.style.background = "";
    host.style.boxShadow = "";
    styleHost(host);
    target.appendChild(host);
  }

  function updateStatus(button, status) {
    var container;
    var reportUrl;
    var savedAtLabel;
    if (!status || !status.exists || !status.id) return;

    reportUrl = resolveReportUrl(status);
    savedAtLabel = formatSavedAt(status.savedAt);
    button.style.display = "none";
    button.setAttribute("aria-hidden", "true");

    container = document.getElementById(STATUS_ID);
    if (!container) {
      container = document.createElement("span");
      container.id = STATUS_ID;
      container.style.display = "inline-flex";
      container.style.alignItems = "center";
      container.style.gap = "6px";
      container.style.flexWrap = "wrap";
      container.style.verticalAlign = "middle";
      button.insertAdjacentElement("afterend", container);
    }

    container.textContent = "";
    container.appendChild(createStatusBadge("\u5df2\u4fdd\u5b58", "saved"));
    if (status.liked) container.appendChild(createStatusBadge("\u5df2\u559c\u6b22", "liked"));
    if (status.stale) container.appendChild(createStatusBadge("\u9700\u5237\u65b0", "stale"));
    if (savedAtLabel) container.appendChild(createStatusBadge(savedAtLabel, status.stale ? "stale" : "saved"));
    if (reportUrl) container.appendChild(createActionLink("\u6253\u5f00\u62a5\u544a", reportUrl, true));
    container.appendChild(createActionLink("\u91cd\u65b0\u751f\u6210", buildAnalyzeUrl(getEpisodeUrl()), false));
  }

  function refreshStatus(button, episodeUrl) {
    if (!window.fetch) return;

    window
      .fetch(buildStatusUrl(episodeUrl), { cache: "no-store" })
      .then(function (response) {
        if (!response.ok) return null;
        return response.json();
      })
      .then(function (status) {
        if (status) updateStatus(button, status);
      })
      .catch(function () {
        // The local app may be closed. Keep the normal analyze button usable.
      });
  }

  function ensureButton(allowFallback) {
    var episodeUrl = getEpisodeUrl();
    var target = findMountTarget();
    var host;
    var button;

    if (!episodeUrl) return true;
    if (!target && !allowFallback) return false;

    host = createHost(!target);
    if (!host) return false;

    if (target) mountHost(host, target);

    button = document.getElementById(BUTTON_ID);
    if (!button) {
      button = createButton(episodeUrl);
      host.appendChild(button);
      refreshStatus(button, episodeUrl);
    }

    return true;
  }

  function boot() {
    var attempts = 0;
    if (ensureButton(false)) return;

    var timer = window.setInterval(function () {
      attempts += 1;
      if (ensureButton(false) || attempts >= MAX_MOUNT_ATTEMPTS) {
        window.clearInterval(timer);
        ensureButton(true);
      }
    }, 250);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
