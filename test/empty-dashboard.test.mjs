import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

test("home page includes an empty dashboard for the no-report state", () => {
  const source = readFileSync(join(process.cwd(), "app", "components", "bangumi-lens-app.tsx"), "utf8");

  assert.match(source, /className="empty-dashboard"/);
  assert.match(source, /className="preview-grid"/);
  assert.match(source, /className="recent-shortcuts"/);
  assert.match(source, /history\.slice\(0,\s*3\)/);
});
