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

test("history action buttons stay above non-interactive metadata", () => {
  const css = readFileSync(join(process.cwd(), "app", "globals.css"), "utf8");

  assert.match(
    css,
    /\.history-item-label\s*\{[\s\S]*?pointer-events:\s*none;/,
    "History item labels should not keep a marquee hover layer over action buttons"
  );
  assert.match(
    css,
    /\.history-saved-at,[\s\S]*?\.history-like-indicator\s*\{[\s\S]*?pointer-events:\s*none;/,
    "Hidden timestamp and liked indicator should not intercept pointer hover over action buttons"
  );
  assert.match(
    css,
    /\.history-like,[\s\S]*?\.history-delete\s*\{[\s\S]*?z-index:\s*1;/,
    "Action buttons should be painted above passive metadata in the shared grid cell"
  );
});
