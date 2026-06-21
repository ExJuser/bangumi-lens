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
  const cacheSource = readFileSync(join(process.cwd(), "lib", "subject-info-cache.ts"), "utf8");

  assert.match(cacheSource, /function hasSubjectInfoEpisodeListField/);
  assert.match(cacheSource, /Array\.isArray\(subjectInfo\?\.episodes\)/);
  assert.doesNotMatch(cacheSource, /subjectInfo\.episodes\.length > 0/);
  assert.match(cacheSource, /SUBJECT_INFO_CACHE_SCHEMA_VERSION = 2/);
  assert.match(source, /hasCurrentSubjectInfoCacheSchema\(cached\)/);
  assert.match(source, /cacheSchemaVersion: SUBJECT_INFO_CACHE_SCHEMA_VERSION/);
});

test("search API attaches cached empty subject episode lists to results", () => {
  const source = readFileSync(join(process.cwd(), "app", "api", "search", "route.ts"), "utf8");

  assert.match(source, /subjectInfo\?: SubjectInfoPayload/);
  assert.match(source, /async function attachCachedSubjectInfo/);
  assert.match(source, /readServerCache<CachedSubjectInfoPayload>\(\s*SUBJECT_INFO_CACHE_NAMESPACE/);
  assert.match(source, /hasSubjectInfoEpisodeListField\(cached\)/);
  assert.match(source, /subjectInfo: cached/);
  assert.match(source, /await attachCachedSubjectInfo\(cached\.results\)/);
  assert.match(source, /await attachCachedSubjectInfo\(diskCached\)/);
});
