import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

test("home is served from /home and root redirects there", () => {
  const componentSource = readFileSync(join(process.cwd(), "app", "components", "bangumi-lens-app.tsx"), "utf8");
  const nextConfigSource = readFileSync(join(process.cwd(), "next.config.mjs"), "utf8");
  const userscriptSource = readFileSync(join(process.cwd(), "public", "bangumi-lens.user.js"), "utf8");

  assert.ok(existsSync(join(process.cwd(), "app", "home", "page.tsx")), "Expected an explicit /home route");
  assert.match(nextConfigSource, /source:\s*"\/"[\s\S]*destination:\s*"\/home"/);
  assert.match(componentSource, /const HOME_ROUTE = "\/home";/);
  assert.match(componentSource, /router\.push\(HOME_ROUTE\);/);
  assert.match(componentSource, /function isHomePath\(pathname: string\)/);
  assert.match(userscriptSource, /const APP_URL = "http:\/\/localhost:3000\/home";/);
});
