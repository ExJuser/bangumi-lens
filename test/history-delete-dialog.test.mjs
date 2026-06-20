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
