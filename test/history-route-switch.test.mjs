import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

test("history route effect does not reopen the stale route during a pending client switch", () => {
  const source = readFileSync(join(process.cwd(), "app", "components", "bangumi-lens-app.tsx"), "utf8");

  assert.match(
    source,
    /const pendingRouteReportIdRef = useRef<string \| null>\(null\);/,
    "Client-initiated report navigation should track the target route until Next updates pathname"
  );
  assert.match(
    source,
    /pendingRouteReportIdRef\.current = item\.id;[\s\S]*?router\.(?:replace|push)\(route\);/,
    "Opening a saved report should mark the route switch before pushing a new route"
  );
  assert.match(
    source,
    /if \(pendingRouteReportIdRef\.current && pendingRouteReportIdRef\.current !== routeReportId\) return;/,
    "Route synchronization should not reopen a stale pathname while a newer client switch is pending"
  );
  assert.match(
    source,
    /if \(pendingRouteReportIdRef\.current === routeReportId\) \{\s*pendingRouteReportIdRef\.current = null;/,
    "The pending route switch should clear once pathname catches up"
  );
});
