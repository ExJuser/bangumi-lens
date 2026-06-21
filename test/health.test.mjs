import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";
import ts from "typescript";

const require = createRequire(import.meta.url);
const moduleCache = new Map();
const repoRoot = process.cwd();

function requireTypeScriptModule(path) {
  const resolvedPath = path.endsWith(".ts") ? path : `${path}.ts`;
  assert.equal(existsSync(resolvedPath), true, `${resolvedPath} should exist`);
  if (moduleCache.has(resolvedPath)) return moduleCache.get(resolvedPath).exports;

  const source = readFileSync(resolvedPath, "utf8");
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: {
      esModuleInterop: true,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      resolveJsonModule: true
    }
  });
  const module = { exports: {} };
  moduleCache.set(resolvedPath, module);

  const localRequire = (specifier) => {
    if (specifier.startsWith("@/")) {
      return requireTypeScriptModule(join(repoRoot, specifier.slice(2)));
    }
    return require(specifier);
  };

  Function("require", "module", "exports", outputText)(localRequire, module, module.exports);
  return module.exports;
}

function makeIndexItem(index) {
  return {
    id: `report-${index}`,
    url: `https://bgm.tv/ep/${index}`,
    savedAt: "2026-06-20T00:00:00.000Z",
    reportPath: `items/report-${index}.json`,
    meta: {
      url: `https://bgm.tv/ep/${index}`,
      episodeId: String(index),
      title: `Episode ${index}`
    },
    stats: {
      commentCount: 1,
      replyCount: 0,
      reactionCount: 0,
      participantCount: 1
    }
  };
}

async function withTempCwd(run) {
  const originalCwd = process.cwd();
  const dir = await mkdtemp(join(tmpdir(), "bangumi-lens-health-"));
  process.chdir(dir);
  try {
    await run(dir);
  } finally {
    process.chdir(originalCwd);
    await rm(dir, { recursive: true, force: true });
  }
}

test("health status summarizes reports, cache, errors, and config without secrets", async () => {
  await withTempCwd(async (dir) => {
    process.env.DEEPSEEK_API_KEY = "secret-key";
    process.env.BANGUMI_ACCESS_TOKEN = "secret-token";
    process.env.BANGUMI_LENS_PROXY = "http://127.0.0.1:7897";
    process.env.DEEPSEEK_MODEL = "test-model";
    process.env.DEEPSEEK_BASE_URL = "https://api.example.test";

    await mkdir(join(dir, "data", "reports"), { recursive: true });
    await mkdir(join(dir, "data", "cache", "search"), { recursive: true });
    await mkdir(join(dir, "logs"), { recursive: true });
    await writeFile(join(dir, "data", "reports", "index.json"), JSON.stringify([makeIndexItem(1), makeIndexItem(2)]));
    await writeFile(join(dir, "data", "cache", "search", "a.json"), "12345");
    await writeFile(
      join(dir, "logs", "app.log"),
      [
        JSON.stringify({ time: "2026-06-20T00:00:00.000Z", level: "info", message: "ok" }),
        JSON.stringify({ time: "2026-06-20T00:01:00.000Z", level: "error", message: "failed", errorMessage: "boom" })
      ].join("\n")
    );

    const { getHealthStatus } = requireTypeScriptModule(join(repoRoot, "lib", "health.ts"));
    const health = await getHealthStatus();

    assert.equal(health.reports.count, 2);
    assert.equal(health.cache.fileCount, 1);
    assert.equal(health.cache.totalBytes, 5);
    assert.equal(health.logs.recentErrors.length, 1);
    assert.equal(health.logs.recentErrors[0].message, "failed");
    assert.equal(health.config.modelApiKeyConfigured, true);
    assert.equal(health.config.bangumiAccessTokenConfigured, true);
    assert.equal(health.config.proxyConfigured, true);
    assert.equal(health.config.model, "test-model");
    assert.equal(health.config.baseUrl, "https://api.example.test");
    assert.equal(JSON.stringify(health).includes("secret-key"), false);
    assert.equal(JSON.stringify(health).includes("secret-token"), false);
  });
});

test("health status tolerates empty local data directories", async () => {
  await withTempCwd(async () => {
    delete process.env.DEEPSEEK_API_KEY;
    delete process.env.OPENAI_API_KEY;
    delete process.env.BANGUMI_ACCESS_TOKEN;
    delete process.env.BANGUMI_LENS_PROXY;
    delete process.env.DEEPSEEK_MODEL;
    delete process.env.DEEPSEEK_BASE_URL;

    const { getHealthStatus } = requireTypeScriptModule(join(repoRoot, "lib", "health.ts"));
    const health = await getHealthStatus();

    assert.equal(health.reports.count, 0);
    assert.equal(health.cache.fileCount, 0);
    assert.equal(health.cache.totalBytes, 0);
    assert.deepEqual(health.logs.recentErrors, []);
    assert.equal(health.config.modelApiKeyConfigured, false);
    assert.equal(health.config.bangumiAccessTokenConfigured, false);
    assert.equal(health.config.proxyConfigured, false);
  });
});
