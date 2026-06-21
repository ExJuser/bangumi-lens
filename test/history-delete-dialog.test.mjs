import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

test("history delete confirmation uses the reusable dialog instead of browser confirm", () => {
  const pagePath = join(process.cwd(), "app", "components", "bangumi-lens-app.tsx");
  const dialogPath = join(process.cwd(), "app", "components", "confirm-dialog.tsx");
  const pageSource = readFileSync(pagePath, "utf8");

  assert.equal(existsSync(dialogPath), true, "ConfirmDialog component should exist");
  assert.match(pageSource, /import \{ ConfirmDialog \} from "\.\/confirm-dialog";/);
  assert.doesNotMatch(pageSource, /window\.confirm/);
  assert.match(pageSource, /deleteHistoryPrompt/);
  assert.match(pageSource, /确认删除这条历史/);
});

test("current episode header actions ask for confirmation before mutating history", () => {
  const pagePath = join(process.cwd(), "app", "components", "bangumi-lens-app.tsx");
  const pageSource = readFileSync(pagePath, "utf8");

  assert.match(pageSource, /likeHistoryPrompt/);
  assert.match(pageSource, /confirmLikeHistoryItem/);
  assert.match(pageSource, /确认喜欢本集/);
  assert.match(pageSource, /确认取消喜欢/);
  assert.match(pageSource, /删除本集记录/);
  assert.match(pageSource, /onClick=\{\(\) => setDeleteHistoryPrompt\(currentSavedReport\)\}/);
  assert.doesNotMatch(
    pageSource,
    /onClick=\{\(\) => toggleReportLike\(currentSavedReport, !currentReportLiked\)\}/
  );
});

test("clear all local content is tucked behind a history title icon and confirmation dialog", () => {
  const pagePath = join(process.cwd(), "app", "components", "bangumi-lens-app.tsx");
  const cssPath = join(process.cwd(), "app", "globals.css");
  const pageSource = readFileSync(pagePath, "utf8");
  const cssSource = readFileSync(cssPath, "utf8");

  assert.match(pageSource, /clearHistoryPrompt/);
  assert.match(pageSource, /confirmClearHistory/);
  assert.match(pageSource, /JSON\.stringify\(\{ all: true \}\)/);
  assert.match(pageSource, /className="history-clear"/);
  assert.match(pageSource, /title="确认清空全部报告和缓存？"/);
  assert.match(pageSource, /全部缓存内容/);
  assert.match(cssSource, /\.history-clear\s*\{[\s\S]*?opacity:\s*0;/);
  assert.match(cssSource, /\.history-title:hover\s+\.history-clear/);
});
