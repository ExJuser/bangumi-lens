import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

test("report page links season trends to a dedicated summary route", () => {
  const source = readFileSync(join(process.cwd(), "app", "components", "bangumi-lens-app.tsx"), "utf8");

  assert.match(source, /season-trend-toggle/);
  assert.match(source, /SUMMARY_ROUTE_PREFIX = "\/summary\/"/);
  assert.match(source, /getSummaryRoute\(getSummaryRouteIdFromMeta\(getSavedReportMeta\(currentSavedReport\)\)\)/);
  assert.match(source, /router\.push\(getReportRoute\(currentSavedReport\.id\)\)/);
  assert.match(source, /findSummaryRouteReport\(history, routeReportId\)/);
  assert.match(source, /isSameSummaryRouteSubject\(report\.meta, routeReportId\)/);
  assert.match(source, /summaryRoute \|\| showSeasonTrend/);
  assert.match(source, /!summaryRoute \?/);
  assert.match(source, /作品趋势/);
  assert.match(source, /<SeasonTrendPanel/);
  assert.match(source, /new URLSearchParams\(\)/);
  assert.match(source, /\/api\/season-trends\?\$\{params\.toString\(\)\}/);
  assert.equal(existsSync(join(process.cwd(), "app", "summary", "[id]", "page.tsx")), true);
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

test("episode navigation treats official episode total as the final main episode boundary", () => {
  const source = readFileSync(join(process.cwd(), "app", "components", "bangumi-lens-app.tsx"), "utf8");
  const boundaryBody = source.slice(
    source.indexOf("function isEpisodeBoundary"),
    source.indexOf("function getReportRoute")
  );

  assert.match(boundaryBody, /const episodeTotal = report\.meta\.episodeTotal \|\| knownEpisodeTotal/);
  assert.match(boundaryBody, /direction === "next"/);
  assert.match(boundaryBody, /episodeSort >= episodeTotal/);
});

test("season generation filters cached episode lists by official episode total", () => {
  const source = readFileSync(join(process.cwd(), "app", "components", "bangumi-lens-app.tsx"), "utf8");

  assert.match(source, /function isWithinMainEpisodeTotal/);
  assert.match(source, /isWithinMainEpisodeTotal\(episode, episodeTotal\)/);
  assert.match(source, /isWithinMainEpisodeTotal\(episode, subjectInfo\?\.episodeTotal \?\? result\.episodeTotal\)/);
});

test("season report generation progress shows active in-flight progress", () => {
  const source = readFileSync(join(process.cwd(), "app", "components", "bangumi-lens-app.tsx"), "utf8");
  const css = readFileSync(join(process.cwd(), "app", "globals.css"), "utf8");

  assert.match(source, /settledCount \+ 0\.45/);
  assert.match(source, /season-report-progress-track running/);
  assert.match(source, /season-report-progress-percent/);
  assert.match(source, /role="progressbar"/);
  assert.match(css, /season-report-progress-shine/);
});

test("season report generation progress is scoped to the current subject", () => {
  const source = readFileSync(join(process.cwd(), "app", "components", "bangumi-lens-app.tsx"), "utf8");

  assert.match(source, /subjectKey: string;/);
  assert.match(source, /function getSubjectKeyFromMeta/);
  assert.match(source, /visibleSeasonReportGeneration/);
  assert.match(source, /visiblePendingSeasonReportGeneration/);
  assert.match(source, /setSeasonReportGeneration\(\(current\) => \(current && current\.subjectKey !== currentSubjectKey \? null : current\)\)/);
  assert.match(source, /generation=\{visibleSeasonReportGeneration\}/);
});
