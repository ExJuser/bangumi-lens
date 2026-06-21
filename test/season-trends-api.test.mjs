import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

test("season trends API exposes threshold payload and validates subject id", () => {
  const routePath = join(process.cwd(), "app", "api", "season-trends", "route.ts");
  const source = readFileSync(routePath, "utf8");

  assert.equal(existsSync(routePath), true);
  assert.match(source, /searchParams\.get\("subjectId"\)/);
  assert.match(source, /searchParams\.get\("subjectName"\)/);
  assert.match(source, /return NextResponse\.json\(\{ error: "缺少作品 ID 或作品名。"\s*\}, \{ status: 400 \}\)/);
  assert.match(source, /fetchBangumiSubjectInfo\(subjectId\)/);
  assert.match(source, /buildSeasonTrendPayload\(history,\s*subjectId,\s*subjectName,\s*\{/);
  assert.match(source, /episodeTotal: subjectInfo\.episodeTotal/);
  assert.match(source, /return NextResponse\.json\(\{ trends \}\)/);
});

test("season trend AI summary is only exposed through explicit POST route", () => {
  const summaryRoutePath = join(process.cwd(), "app", "api", "season-trends", "summary", "route.ts");
  const componentSource = readFileSync(join(process.cwd(), "app", "components", "bangumi-lens-app.tsx"), "utf8");
  const summarySource = readFileSync(summaryRoutePath, "utf8");

  assert.equal(existsSync(summaryRoutePath), true);
  assert.match(summarySource, /export async function POST/);
  assert.match(summarySource, /refineSeasonTrendSummary\(trends\)/);
  assert.match(componentSource, /className="season-trend-ai-summary"/);
  assert.match(componentSource, /onClick=\{onRequestAiSummary\}/);
  const loadSeasonTrendBody = componentSource.slice(
    componentSource.indexOf("async function loadSeasonTrend"),
    componentSource.indexOf("async function requestSeasonTrendAiSummary")
  );
  assert.doesNotMatch(loadSeasonTrendBody, /\/api\/season-trends\/summary/);
});

test("subject info API refreshes old cache entries without episode lists but reuses empty lists", () => {
  const routePath = join(process.cwd(), "app", "api", "subject-info", "route.ts");
  const source = readFileSync(routePath, "utf8");

  assert.match(source, /function hasEpisodeListField/);
  assert.match(source, /Array\.isArray\(subjectInfo\?\.episodes\)/);
  assert.doesNotMatch(source, /subjectInfo\.episodes\.length > 0/);
  assert.match(source, /SUBJECT_INFO_CACHE_SCHEMA_VERSION = 2/);
  assert.match(source, /hasCurrentCacheSchema\(cached\)/);
  assert.match(source, /cacheSchemaVersion: SUBJECT_INFO_CACHE_SCHEMA_VERSION/);
});
