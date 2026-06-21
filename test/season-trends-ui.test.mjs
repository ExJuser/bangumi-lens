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

  assert.match(boundaryBody, /const episodeTotal = knownEpisodeTotal \?\? report\.meta\.episodeTotal/);
  assert.match(boundaryBody, /direction === "next"/);
  assert.match(boundaryBody, /episodeSort >= episodeTotal/);
});

test("season generation filters cached episode lists by official episode total", () => {
  const source = readFileSync(join(process.cwd(), "app", "components", "bangumi-lens-app.tsx"), "utf8");

  assert.match(source, /function isWithinMainEpisodeTotal/);
  assert.match(source, /isWithinMainEpisodeTotal\(episode, episodeTotal\)/);
  assert.match(source, /isWithinMainEpisodeTotal\(episode, subjectInfo\?\.episodeTotal \?\? result\.episodeTotal\)/);
});

test("episode picker ignores stale subject info responses", () => {
  const source = readFileSync(join(process.cwd(), "app", "components", "bangumi-lens-app.tsx"), "utf8");
  const selectionBody = source.slice(
    source.indexOf("async function selectSearchResult"),
    source.indexOf("function selectSearchEpisode")
  );

  assert.match(source, /const searchEpisodeRequestSeqRef = useRef\(0\)/);
  assert.match(selectionBody, /searchEpisodeRequestSeqRef\.current = requestSeq/);
  assert.match(selectionBody, /const isCurrentRequest = \(\) => searchEpisodeRequestSeqRef\.current === requestSeq/);
  assert.match(selectionBody, /if \(isCurrentRequest\(\)\) \{\s*setSearchEpisodes\(episodes\);/);
  assert.match(selectionBody, /if \(isCurrentRequest\(\)\) \{\s*setSearchSelectionError\(/);
  assert.match(selectionBody, /if \(isCurrentRequest\(\)\) \{\s*setLoadingSearchEpisodes\(false\);/);
});

test("episode picker reuses cached empty subject episode lists without loading", () => {
  const source = readFileSync(join(process.cwd(), "app", "components", "bangumi-lens-app.tsx"), "utf8");
  const selectionBody = source.slice(
    source.indexOf("async function selectSearchResult"),
    source.indexOf("function selectSearchEpisode")
  );
  const fetchCondition = selectionBody.slice(
    selectionBody.indexOf("if (!Array.isArray(subjectInfo?.episodes))"),
    selectionBody.indexOf("const response = await fetch")
  );

  assert.match(selectionBody, /setLoadingSearchEpisodes\(false\);/);
  assert.match(selectionBody, /if \(!Array\.isArray\(subjectInfo\?\.episodes\)\)/);
  assert.match(fetchCondition, /setLoadingSearchEpisodes\(true\);/);
  assert.doesNotMatch(selectionBody, /if \(!subjectInfo\?\.episodes\)/);
});

test("title search stores subject info returned with search results", () => {
  const source = readFileSync(join(process.cwd(), "app", "components", "bangumi-lens-app.tsx"), "utf8");
  const searchBody = source.slice(
    source.indexOf("async function searchByTitle"),
    source.indexOf("useEffect", source.indexOf("async function searchByTitle"))
  );
  const selectionBody = source.slice(
    source.indexOf("async function selectSearchResult"),
    source.indexOf("function selectSearchEpisode")
  );

  assert.match(source, /subjectInfo\?: SubjectInfo/);
  assert.match(searchBody, /const subjectInfoEntries = results/);
  assert.match(searchBody, /result is SearchResult & \{ subjectInfo: SubjectInfo \}/);
  assert.match(searchBody, /setSubjectInfoById\(\(current\) => \(\{ \.\.\.current, \.\.\.Object\.fromEntries\(subjectInfoEntries\) \}\)\)/);
  assert.match(selectionBody, /const cachedInfo = refresh \? undefined : result\.subjectInfo \|\| subjectInfoById\[result\.subjectId\]/);
});

test("title search keeps dialog mounted while changing result pages", () => {
  const source = readFileSync(join(process.cwd(), "app", "components", "bangumi-lens-app.tsx"), "utf8");
  const searchBody = source.slice(
    source.indexOf("async function searchByTitle"),
    source.indexOf("useEffect", source.indexOf("async function searchByTitle"))
  );

  assert.match(searchBody, /const isPagingCurrentSearch =/);
  assert.match(searchBody, /if \(!isPagingCurrentSearch && !keepSelectionOpen\) \{\s*setSearchResults\(\[\]\);\s*setSearchPagination\(null\);/);
  assert.match(source, /function goToSearchPage\(page: number\)/);
});

test("title search keeps dialog mounted while resubmitting a keyword inside the dialog", () => {
  const source = readFileSync(join(process.cwd(), "app", "components", "bangumi-lens-app.tsx"), "utf8");
  const searchBody = source.slice(
    source.indexOf("async function searchByTitle"),
    source.indexOf("useEffect", source.indexOf("async function searchByTitle"))
  );
  const submitBody = source.slice(
    source.indexOf("function submitSearchKeyword"),
    source.indexOf("function selectSearchEpisode")
  );

  assert.match(searchBody, /keepSelectionOpen\?: boolean/);
  assert.match(searchBody, /const keepSelectionOpen = Boolean\(options\.keepSelectionOpen\)/);
  assert.match(searchBody, /if \(!isPagingCurrentSearch && !keepSelectionOpen\) \{\s*setSearchResults\(\[\]\);\s*setSearchPagination\(null\);/);
  assert.match(submitBody, /searchByTitle\(nextKeyword, 1, \{ keepSelectionOpen: true \}\)/);
});

test("search result covers show a large hover preview", () => {
  const source = readFileSync(join(process.cwd(), "app", "components", "bangumi-lens-app.tsx"), "utf8");
  const selectionBody = source.slice(
    source.indexOf("{searchResults.map((result) => ("),
    source.indexOf("{searchPagination ? (", source.indexOf("{searchResults.map((result) => ("))
  );

  assert.match(source, /type SearchCoverPreview =/);
  assert.match(source, /coverPreviewUrl\?: string/);
  assert.match(source, /const SEARCH_COVER_PREVIEW_DELAY_MS = 500/);
  assert.match(source, /const \[searchCoverPreview, setSearchCoverPreview\] = useState<SearchCoverPreview \| null>\(null\)/);
  assert.match(source, /const searchCoverPreviewTimeoutRef = useRef<number \| null>\(null\)/);
  assert.match(source, /function positionSearchCoverPreview\(result: SearchResult, target: HTMLElement\)/);
  assert.match(source, /function scheduleSearchCoverPreview\(result: SearchResult, event: ReactMouseEvent<HTMLElement>\)/);
  assert.match(source, /window\.setTimeout\(\(\) => \{[\s\S]*?positionSearchCoverPreview\(result, target\);[\s\S]*?\}, SEARCH_COVER_PREVIEW_DELAY_MS\)/);
  assert.match(selectionBody, /onMouseEnter=\{\(event\) => scheduleSearchCoverPreview\(result, event\)\}/);
  assert.match(selectionBody, /onFocus=\{\(event\) => showSearchCoverPreview\(result, event\)\}/);
  assert.match(selectionBody, /onMouseLeave=\{hideSearchCoverPreview\}/);
  assert.match(source, /className="search-cover-preview"/);
  assert.match(source, /src=\{searchCoverPreview\.result\.coverPreviewUrl \?\? searchCoverPreview\.result\.coverUrl \?\? ""\}/);
  assert.match(source, /getSearchResultTitle\(searchCoverPreview\.result\)/);
});

test("empty episode picker state offers a manual refresh", () => {
  const source = readFileSync(join(process.cwd(), "app", "components", "bangumi-lens-app.tsx"), "utf8");
  const css = readFileSync(join(process.cwd(), "app", "globals.css"), "utf8");
  const selectionBody = source.slice(
    source.indexOf("async function selectSearchResult"),
    source.indexOf("function selectSearchEpisode")
  );
  const refreshBody = source.slice(
    source.indexOf("function refreshSelectedSearchResult"),
    source.indexOf("function selectSearchEpisode")
  );

  assert.match(source, /const NO_SEARCH_EPISODES_MESSAGE = "这个条目暂时没有可选择的正片章节。"/);
  assert.match(selectionBody, /options: \{ refresh\?: boolean \} = \{\}/);
  assert.match(selectionBody, /const cachedInfo = refresh \? undefined : result\.subjectInfo \|\| subjectInfoById\[result\.subjectId\]/);
  assert.match(selectionBody, /if \(refresh\) params\.set\("refresh", "1"\)/);
  assert.match(selectionBody, /throw new Error\(NO_SEARCH_EPISODES_MESSAGE\)/);
  assert.match(refreshBody, /selectSearchResult\(selectedSearchResult, \{ refresh: true \}\)/);
  assert.match(source, /searchSelectionError === NO_SEARCH_EPISODES_MESSAGE/);
  assert.match(source, /className="episode-choice-panel-refresh"/);
  assert.match(source, /className="episode-choice-error-message"/);
  assert.match(source, /手动刷新/);
  assert.match(source, /RefreshCw size=\{14\}/);
  assert.match(css, /\.episode-choice-panel \{\s*position: relative;/);
  assert.match(css, /\.episode-choice-panel-refresh \{\s*position: absolute;[\s\S]*?top: 12px;[\s\S]*?right: 12px;/);
});

test("episode picker search only matches titles and exact arabic episode numbers", () => {
  const source = readFileSync(join(process.cwd(), "app", "components", "bangumi-lens-app.tsx"), "utf8");
  const matcherBody = source.slice(
    source.indexOf("export function matchesSearchEpisodeQuery"),
    source.indexOf("export function filterSearchEpisodes")
  );

  assert.match(source, /placeholder="搜索话数或标题"/);
  assert.match(matcherBody, /\^\\d\+\$/);
  assert.match(matcherBody, /String\(episode\.sort\) === normalizedQuery/);
  assert.match(matcherBody, /\[episode\.title, episode\.titleCn\]/);
  assert.doesNotMatch(matcherBody, /episode\.airdate/);
  assert.doesNotMatch(matcherBody, /episode\.id/);
  assert.doesNotMatch(matcherBody, /getEpisodeChoiceLabel/);
});

test("search selection dialog shows and resubmits the current keyword", () => {
  const source = readFileSync(join(process.cwd(), "app", "components", "bangumi-lens-app.tsx"), "utf8");
  const css = readFileSync(join(process.cwd(), "app", "globals.css"), "utf8");
  const submitBody = source.slice(
    source.indexOf("function submitSearchKeyword"),
    source.indexOf("function selectSearchEpisode")
  );

  assert.match(source, /const \[searchKeywordDraft, setSearchKeywordDraft\] = useState\(""\)/);
  assert.match(source, /setSearchKeywordDraft\(query\)/);
  assert.match(source, /className="search-keyword-editor"/);
  assert.match(source, /id="search-keyword-input"/);
  assert.match(source, /aria-label="搜索关键词"/);
  assert.match(source, /\{searching \? "搜索中" : "搜索"\}/);
  assert.match(source, /disabled=\{searching \|\| !searchKeywordDraft\.trim\(\)\}/);
  assert.match(submitBody, /searchKeywordDraft\.trim\(\)/);
  assert.match(submitBody, /searchByTitle\(nextKeyword, 1, \{ keepSelectionOpen: true \}\)/);
  assert.doesNotMatch(submitBody, /resetResults/);
  assert.match(source, /className="secondary-action search-selection-refresh"[\s\S]*?disabled=\{searching\}/);
  assert.match(source, /onClick=\{\(\) => goToSearchPage\(searchPagination\.page - 1\)\}[\s\S]*?disabled=\{!canGoPreviousSearchPage\}/);
  assert.match(source, /onClick=\{\(\) => goToSearchPage\(searchPagination\.page \+ 1\)\}[\s\S]*?disabled=\{!canGoNextSearchPage\}/);
  assert.match(source, /disabled=\{searching\}[\s\S]*?onBlur=\{submitSearchPageInput\}/);
  assert.match(source, /key=\{`\$\{result\.subjectId\}-\$\{result\.firstEpisodeId\}`\}[\s\S]*?disabled=\{searching\}/);
  assert.match(css, /\.search-selection-head\s*\{[\s\S]*?grid-template-columns:\s*minmax\(220px,\s*1fr\) minmax\(320px,\s*452px\) minmax\(180px,\s*1fr\);/);
  assert.match(css, /\.search-keyword-control\s*\{/);
  assert.match(css, /\.search-keyword-control input\s*\{[\s\S]*?font-size:\s*16px;/);
  assert.match(css, /\.search-keyword-control button\s*\{[\s\S]*?font-size:\s*15px;/);
});

test("search selection dialog links back to the selected Bangumi subject", () => {
  const source = readFileSync(join(process.cwd(), "app", "components", "bangumi-lens-app.tsx"), "utf8");
  const css = readFileSync(join(process.cwd(), "app", "globals.css"), "utf8");

  assert.match(source, /function buildBangumiSubjectUrl\(subjectId: string\) \{\s*return `https:\/\/bgm\.tv\/subject\/\$\{subjectId\}`;/);
  assert.match(source, /className="bangumi-subject-link"/);
  assert.match(source, /href=\{buildBangumiSubjectUrl\(selectedSearchResult\.subjectId\)\}/);
  assert.match(source, /target="_blank"/);
  assert.match(source, /rel="noreferrer"/);
  assert.match(source, /<ExternalLink size=\{13\} \/>/);
  assert.match(source, />\s*Bangumi\s*</);
  assert.match(css, /\.search-selection-column-status\s*\{/);
  assert.match(css, /\.bangumi-subject-link\s*\{[\s\S]*?text-decoration:\s*none;/);
});

test("episode picker links each episode back to Bangumi", () => {
  const source = readFileSync(join(process.cwd(), "app", "components", "bangumi-lens-app.tsx"), "utf8");
  const css = readFileSync(join(process.cwd(), "app", "globals.css"), "utf8");

  assert.match(source, /className="episode-choice-bangumi-link"/);
  assert.match(source, /href=\{episode\.url\}/);
  assert.match(source, /title="打开 Bangumi 章节页"/);
  assert.match(source, /aria-label=\{`打开 Bangumi 章节页：\$\{getEpisodeChoiceLabel\(episode\)\}`\}/);
  assert.match(source, /target="_blank"/);
  assert.match(source, /rel="noreferrer"/);
  assert.match(css, /\.episode-choice-row\s*\{[\s\S]*?grid-template-columns:\s*16px minmax\(0, 1fr\) auto 82px;/);
  assert.match(css, /\.episode-choice-bangumi-link\s*\{[\s\S]*?text-decoration:\s*none;/);
});

test("episode picker paginates large episode lists and selects only the current page", () => {
  const source = readFileSync(join(process.cwd(), "app", "components", "bangumi-lens-app.tsx"), "utf8");
  const css = readFileSync(join(process.cwd(), "app", "globals.css"), "utf8");
  const selectVisibleBody = source.slice(
    source.indexOf("function selectVisibleSearchEpisodes"),
    source.indexOf("function clearSearchEpisodeSelection")
  );

  assert.match(source, /const SEARCH_EPISODE_PAGE_SIZE = 8/);
  assert.match(source, /const pagedSearchEpisodes = filteredSearchEpisodes\.slice/);
  assert.match(selectVisibleBody, /pagedSearchEpisodes\.forEach/);
  assert.match(source, /function goToSearchEpisodePage\(page: number\)/);
  assert.match(source, /className="episode-pagination"/);
  assert.match(source, /pagedSearchEpisodes\.map/);
  assert.match(css, /\.episode-choice-panel\s*\{[\s\S]*?grid-template-rows:\s*auto minmax\(0, 1fr\) auto auto;/);
  assert.match(css, /\.episode-pagination\s*\{[\s\S]*?border-top:\s*1px solid var\(--line\);/);
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

test("search-selected report generation hides season trend threshold copy", () => {
  const source = readFileSync(join(process.cwd(), "app", "components", "bangumi-lens-app.tsx"), "utf8");
  const progressBody = source.slice(
    source.indexOf("function SeasonReportGenerationProgress"),
    source.indexOf("function SeasonTrendPanel")
  );
  const searchGenerationBody = source.slice(
    source.indexOf("async function confirmSelectedSearchEpisodes"),
    source.indexOf("function closeSearchSelectionDialog")
  );

  assert.match(source, /source: "season-gap-fill" \| "search-selection";/);
  assert.match(progressBody, /const showSeasonTrendThreshold = generation\.source === "season-gap-fill"/);
  assert.match(progressBody, /showSeasonTrendThreshold \? \(/);
  assert.match(progressBody, /整季趋势/);
  assert.match(searchGenerationBody, /source: "search-selection"/);
});

test("season trend charts use compact stats for one or two saved reports", () => {
  const source = readFileSync(join(process.cwd(), "app", "components", "bangumi-lens-app.tsx"), "utf8");
  const css = readFileSync(join(process.cwd(), "app", "globals.css"), "utf8");

  assert.match(source, /const useCompactPoints = episodes\.length <= 2/);
  assert.match(source, /season-trend-chart-compact/);
  assert.match(source, /season-trend-point-stat/);
  assert.match(css, /\.season-trend-chart-compact/);
  assert.match(css, /\.season-trend-point-stat/);
});
