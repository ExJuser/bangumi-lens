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

test("clear local reports and cache are exposed from the health cards", () => {
  const pagePath = join(process.cwd(), "app", "components", "bangumi-lens-app.tsx");
  const cssPath = join(process.cwd(), "app", "globals.css");
  const pageSource = readFileSync(pagePath, "utf8");
  const cssSource = readFileSync(cssPath, "utf8");

  assert.match(pageSource, /clearLocalDataPrompt/);
  assert.match(pageSource, /confirmClearLocalData/);
  assert.match(pageSource, /JSON\.stringify\(\{ scope \}\)/);
  assert.match(pageSource, /onClearReports=\{\(\) => setClearLocalDataPrompt\("reports"\)\}/);
  assert.match(pageSource, /onClearCache=\{\(\) => setClearLocalDataPrompt\("cache"\)\}/);
  assert.doesNotMatch(pageSource, /onClearReports=\{confirmClearLocalData\}/);
  assert.doesNotMatch(pageSource, /onClearCache=\{confirmClearLocalData\}/);
  assert.match(pageSource, /确认清空全部本地报告？/);
  assert.match(pageSource, /确认清空全部缓存？/);
  assert.match(pageSource, /className="health-danger-action"/);
  assert.doesNotMatch(pageSource, /className="history-clear"/);
  assert.doesNotMatch(cssSource, /\.history-clear\s*\{/);
  assert.match(cssSource, /\.health-danger-action\s*\{/);
  assert.match(cssSource, /\.health-danger-action:hover,[\s\S]*?border-color:/);
  assert.match(cssSource, /\.health-danger-action:hover,[\s\S]*?transform:\s*translateY\(-1px\)/);
});

test("clear local content reports success or failure after the request finishes", () => {
  const pagePath = join(process.cwd(), "app", "components", "bangumi-lens-app.tsx");
  const cssPath = join(process.cwd(), "app", "globals.css");
  const pageSource = readFileSync(pagePath, "utf8");
  const cssSource = readFileSync(cssPath, "utf8");

  assert.match(pageSource, /const \[notice, setNotice\] = useState\(""\)/);
  assert.match(pageSource, /setNotice\(scope === "reports" \? "已清空全部报告。" : "已清空全部缓存。"\)/);
  assert.match(pageSource, /setError\("清空失败，请稍后重试。"\)/);
  assert.match(pageSource, /className="notice success toast-notice"/);
  assert.match(cssSource, /\.success\s*\{[\s\S]*?border-color:/);
});
