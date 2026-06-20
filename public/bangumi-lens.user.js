// ==UserScript==
// @name         Bangumi Lens episode analyzer
// @namespace    https://github.com/local/bangumi-lens
// @version      0.1.0
// @description  Add a Bangumi Lens analyze button to Bangumi episode pages.
// @match        https://bgm.tv/ep/*
// @match        https://bangumi.tv/ep/*
// @match        https://chii.in/ep/*
// @grant        none
// ==/UserScript==

(function () {
  "use strict";

  const APP_URL = "http://localhost:3000/";
  const BUTTON_ID = "bangumi-lens-analyze-button";

  function getEpisodeUrl() {
    const match = window.location.pathname.match(/^\/ep\/(\d+)\/?$/);
    if (!match) return "";
    return `https://bgm.tv/ep/${match[1]}`;
  }

  function buildAnalyzeUrl(episodeUrl) {
    const url = new URL(APP_URL);
    url.searchParams.set("url", episodeUrl);
    return url.toString();
  }

  function createButton(episodeUrl) {
    const button = document.createElement("a");
    button.id = BUTTON_ID;
    button.href = buildAnalyzeUrl(episodeUrl);
    button.target = "_blank";
    button.rel = "noopener noreferrer";
    button.textContent = "Bangumi Lens 分析";
    button.style.cssText = [
      "display:inline-flex",
      "align-items:center",
      "justify-content:center",
      "min-height:28px",
      "margin-left:8px",
      "padding:0 10px",
      "border:1px solid #d9c6bb",
      "border-radius:6px",
      "background:#fff7ef",
      "color:#c94b3f",
      "font-weight:700",
      "font-size:12px",
      "line-height:1",
      "text-decoration:none"
    ].join(";");

    button.addEventListener("mouseenter", () => {
      button.style.background = "#ffe9df";
      button.style.borderColor = "#c94b3f";
    });
    button.addEventListener("mouseleave", () => {
      button.style.background = "#fff7ef";
      button.style.borderColor = "#d9c6bb";
    });

    return button;
  }

  function mountButton() {
    if (document.getElementById(BUTTON_ID)) return;

    const episodeUrl = getEpisodeUrl();
    if (!episodeUrl) return;

    const target =
      document.querySelector("#columnEpB h2, .epDesc h2, h1.nameSingle, h1") ||
      document.querySelector("#headerSubject, .headerSubject");
    if (!target) return;

    target.appendChild(createButton(episodeUrl));
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", mountButton);
  } else {
    mountButton();
  }
})();
