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
