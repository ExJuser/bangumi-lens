import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

test("report page includes a season trend entry and embedded trend panel", () => {
  const source = readFileSync(join(process.cwd(), "app", "components", "bangumi-lens-app.tsx"), "utf8");

  assert.match(source, /season-trend-toggle/);
  assert.match(source, /作品趋势/);
  assert.match(source, /<SeasonTrendPanel/);
  assert.match(source, /new URLSearchParams\(\)/);
  assert.match(source, /\/api\/season-trends\?\$\{params\.toString\(\)\}/);
});

test("season trend empty state reports half-season threshold gap", () => {
  const source = readFileSync(join(process.cwd(), "app", "components", "bangumi-lens-app.tsx"), "utf8");

  assert.match(source, /className="season-trend-empty"/);
  assert.match(source, /trends\.savedReportCount/);
  assert.match(source, /trends\.requiredReportCount/);
  assert.match(source, /trends\.missingReportCount/);
});

test("AI summary button is hidden behind explicit user action", () => {
  const source = readFileSync(join(process.cwd(), "app", "components", "bangumi-lens-app.tsx"), "utf8");

  assert.match(source, /className="season-trend-ai-summary"/);
  assert.match(source, /requestSeasonTrendAiSummary/);
  assert.match(source, /\/api\/season-trends\/summary/);
  const loadSeasonTrendBody = source.slice(
    source.indexOf("async function loadSeasonTrend"),
    source.indexOf("async function requestSeasonTrendAiSummary")
  );
  assert.doesNotMatch(loadSeasonTrendBody, /\/api\/season-trends\/summary/);
});

test("season trend empty state can launch cancellable full-season report generation after confirmation", () => {
  const source = readFileSync(join(process.cwd(), "app", "components", "bangumi-lens-app.tsx"), "utf8");

  assert.match(source, /season-report-generate-button/);
  assert.match(source, /pendingSeasonReportGeneration/);
  assert.match(source, /confirmSeasonReportGeneration/);
  assert.match(source, /cancelSeasonReportGeneration/);
  assert.match(source, /seasonReportGenerationAbortRef\.current\?\.abort\(\)/);
  assert.match(source, /navigate: false/);

  const prepareBody = source.slice(
    source.indexOf("async function prepareSeasonReportGeneration"),
    source.indexOf("async function confirmSeasonReportGeneration")
  );
  assert.doesNotMatch(prepareBody, /analyzeEpisodeReport\(/);
  assert.match(prepareBody, /setPendingSeasonReportGeneration/);
});

test("season report generation progress shows active in-flight progress", () => {
  const source = readFileSync(join(process.cwd(), "app", "components", "bangumi-lens-app.tsx"), "utf8");
  const css = readFileSync(join(process.cwd(), "app", "globals.css"), "utf8");

  assert.match(source, /settledCount \+ 0\.45/);
  assert.match(source, /season-report-progress-track running/);
  assert.match(css, /season-report-progress-shine/);
});
