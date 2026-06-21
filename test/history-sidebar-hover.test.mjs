import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

test("history item hover does not start title marquee over action buttons", () => {
  const css = readFileSync(join(process.cwd(), "app", "globals.css"), "utf8");

  assert.doesNotMatch(
    css,
    /\.history-item:hover\s+\.hover-scroll-text\.is-overflowing\s+\.hover-scroll-text-inner/,
    "Row hover should reveal actions without starting the title marquee over them"
  );
  assert.doesNotMatch(
    css,
    /\.history-item:focus-visible\s+\.hover-scroll-text\.is-overflowing\s+\.hover-scroll-text-inner/,
    "Row focus should reveal actions without starting the title marquee over them"
  );
});

test("desktop history sidebar does not shift when page scrolling begins", () => {
  const css = readFileSync(join(process.cwd(), "app", "globals.css"), "utf8");

  assert.match(
    css,
    /\.app-shell\s*\{[\s\S]*?padding:\s*34px 0 64px;/,
    "Desktop shell top padding is the sidebar's natural top offset"
  );
  assert.match(
    css,
    /\.history-sidebar\s*\{[\s\S]*?top:\s*34px;[\s\S]*?max-height:\s*calc\(100vh - 68px\);/,
    "Sticky sidebar top offset should match the desktop shell top padding to avoid an initial scroll jump"
  );
});

test("history sidebar uses a quiet custom scrollbar", () => {
  const css = readFileSync(join(process.cwd(), "app", "globals.css"), "utf8");

  assert.match(
    css,
    /\.history-sidebar\s*\{[\s\S]*?scrollbar-width:\s*thin;/,
    "History sidebar should use a thin Firefox scrollbar instead of the wide default"
  );
  assert.match(
    css,
    /\.history-sidebar::-webkit-scrollbar\s*\{[\s\S]*?width:\s*8px;/,
    "History sidebar should use a narrow WebKit scrollbar"
  );
  assert.match(
    css,
    /\.history-sidebar::-webkit-scrollbar-button\s*\{[\s\S]*?display:\s*none;/,
    "History sidebar should hide default WebKit scrollbar arrow buttons"
  );
  assert.doesNotMatch(
    css,
    /\.history-groups::-webkit-scrollbar/,
    "Mobile horizontal history groups should keep their own native scrollbar behavior"
  );
});

test("search selection keeps subject candidates unscrolled and episode list scrollable", () => {
  const css = readFileSync(join(process.cwd(), "app", "globals.css"), "utf8");
  const searchResultsRule = css.match(/\.search-results\s*\{[^}]*\}/)?.[0] || "";

  assert.match(
    searchResultsRule,
    /overflow:\s*hidden;/,
    "Search result candidates should fit the page without showing an inner scrollbar"
  );
  assert.doesNotMatch(
    searchResultsRule,
    /scrollbar-width:/,
    "Search result candidates should not opt into custom scrollbar styling"
  );
  assert.match(
    css,
    /\.episode-choice-list\s*\{[\s\S]*?scrollbar-width:\s*thin;/,
    "Episode choices should use a thin Firefox scrollbar instead of the wide default"
  );
  assert.match(
    css,
    /\.episode-choice-list::-webkit-scrollbar\s*\{[\s\S]*?width:\s*8px;/,
    "Episode choices should use a narrow WebKit scrollbar"
  );
  assert.match(
    css,
    /\.episode-choice-list::-webkit-scrollbar-button\s*\{[\s\S]*?display:\s*none;/,
    "Episode choices should hide default WebKit scrollbar arrow buttons"
  );
});

test("search selection lists keep sparse results at content height", () => {
  const css = readFileSync(join(process.cwd(), "app", "globals.css"), "utf8");

  assert.match(
    css,
    /\.search-results\s*\{[\s\S]*?align-content:\s*start;/,
    "A single subject result should not stretch to fill the whole results pane"
  );
  assert.match(
    css,
    /\.episode-choice-list\s*\{[\s\S]*?align-content:\s*start;/,
    "A single episode result should not stretch to fill the whole episode pane"
  );
});

test("search selection header actions expose hover feedback", () => {
  const css = readFileSync(join(process.cwd(), "app", "globals.css"), "utf8");
  const polishedCss = readFileSync(join(process.cwd(), "app", "polished-ui.css"), "utf8");

  assert.match(
    css,
    /\.search-selection-actions button:hover:not\(:disabled\),[\s\S]*?\.search-selection-actions button:focus-visible:not\(:disabled\)\s*\{[\s\S]*?background:\s*var\(--selected\);/,
    "Search selection header buttons should have visible hover and keyboard focus feedback"
  );
  assert.match(
    polishedCss,
    /:root\[data-ui="polished"\] \.search-selection-actions button:hover:not\(:disabled\),[\s\S]*?:root\[data-ui="polished"\] \.search-selection-actions button:focus-visible:not\(:disabled\)\s*\{[\s\S]*?background:\s*var\(--selected\);/,
    "Polished mode should preserve search selection header action hover feedback"
  );
});

test("search result covers use the larger six-result layout", () => {
  const css = readFileSync(join(process.cwd(), "app", "globals.css"), "utf8");

  assert.match(
    css,
    /\.search-results:has\(> button:nth-child\(6\)\)\s*\{[\s\S]*?grid-template-rows:\s*repeat\(6,\s*minmax\(83px,\s*1fr\)\);/,
    "Search results should reserve space for six subject rows without requiring a scrollbar"
  );
  assert.match(
    css,
    /\.search-results button\s*\{[\s\S]*?grid-template-columns:\s*58px minmax\(0,\s*1fr\) auto;/,
    "Search result rows should allocate a wider cover column"
  );
  assert.match(
    css,
    /\.search-result-cover\s*\{[\s\S]*?width:\s*58px;[\s\S]*?height:\s*66px;/,
    "Search result covers should be large enough to identify subjects"
  );
});

test("search result cover preview floats outside the scroll list", () => {
  const css = readFileSync(join(process.cwd(), "app", "globals.css"), "utf8");

  assert.match(
    css,
    /\.search-cover-preview\s*\{[\s\S]*?position:\s*fixed;[\s\S]*?z-index:\s*52;/,
    "Large cover preview should float above the modal instead of being clipped by the scroll list"
  );
  assert.match(
    css,
    /\.search-cover-preview\s*\{[\s\S]*?width:\s*220px;[\s\S]*?height:\s*320px;/,
    "Large cover preview should use a readable poster size"
  );
  assert.match(
    css,
    /@media \(max-width: 560px\)[\s\S]*?\.search-cover-preview\s*\{[\s\S]*?display:\s*none;/,
    "Large cover preview should not cover the mobile picker"
  );
});

test("history action buttons stay above non-interactive metadata", () => {
  const css = readFileSync(join(process.cwd(), "app", "globals.css"), "utf8");
  const historyItemLabelRule = css.match(/\.history-item-label\s*\{[^}]*\}/)?.[0] || "";

  assert.doesNotMatch(historyItemLabelRule, /pointer-events:\s*none;/);
  assert.match(
    css,
    /\.history-item-label\.hover-scroll-text\.is-overflowing:hover\s+\.hover-scroll-text-inner/,
    "History item labels should receive hover so overflowing titles can scroll"
  );
  assert.match(
    css,
    /\.history-saved-at,[\s\S]*?\.history-like-indicator\s*\{[\s\S]*?pointer-events:\s*none;/,
    "Hidden timestamp and liked indicator should not intercept pointer hover over action buttons"
  );
  assert.match(
    css,
    /\.history-delete\s*\{[\s\S]*?z-index:\s*1;/,
    "Delete action should be painted above passive metadata in the shared grid cell"
  );
  assert.doesNotMatch(
    css,
    /\.history-like(?!-indicator)\b/,
    "The sidebar should not expose a like action; liking is handled from the report page"
  );
});

test("liked history marker does not overlap the saved timestamp", () => {
  const css = readFileSync(join(process.cwd(), "app", "globals.css"), "utf8");

  assert.match(
    css,
    /\.history-item-meta\s*\{[\s\S]*?grid-template-columns:\s*18px minmax\(0,\s*1fr\) 32px;/,
    "Liked marker, timestamp, and delete action should have separate grid tracks"
  );
  assert.match(
    css,
    /\.history-saved-at\s*\{[\s\S]*?grid-column:\s*2 \/ 4;/,
    "Saved timestamp should start after the liked marker track and reach the right edge"
  );
  assert.match(
    css,
    /\.history-like-indicator\s*\{[\s\S]*?grid-column:\s*1;/,
    "Liked marker should stay in its own leading track"
  );
});
