import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";
import test from "node:test";
import ts from "typescript";

const require = createRequire(import.meta.url);
const repoRoot = process.cwd();

function requireTypeScriptModule(path, moduleCache = new Map()) {
  const filename = path.endsWith(".ts") ? path : `${path}.ts`;
  assert.equal(existsSync(filename), true, `${filename} should exist`);
  if (moduleCache.has(filename)) return moduleCache.get(filename).exports;

  const source = readFileSync(filename, "utf8");
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true
    },
    fileName: filename
  }).outputText;

  const module = { exports: {} };
  moduleCache.set(filename, module);
  const localRequire = (specifier) => {
    if (specifier.startsWith("@/")) {
      return requireTypeScriptModule(join(repoRoot, specifier.slice(2)), moduleCache);
    }
    return require(specifier);
  };

  Function("require", "module", "exports", compiled)(localRequire, module, module.exports);
  return module.exports;
}

function loadServerCache() {
  return requireTypeScriptModule(join(repoRoot, "lib", "server-cache.ts"));
}

async function withTempCwd(run) {
  const dir = await mkdtemp(join(tmpdir(), "bangumi-lens-cache-"));
  const originalCwd = process.cwd();
  process.chdir(dir);

  try {
    await run(dir);
  } finally {
    process.chdir(originalCwd);
    await rm(dir, { recursive: true, force: true });
  }
}

test("server cache can be cleared after writing entries", async () => {
  await withTempCwd(async () => {
    const { clearServerCache, readServerCache, writeServerCache } = loadServerCache();

    await writeServerCache("search", "test", [{ name: "cached" }]);
    assert.deepEqual(await readServerCache("search", "test", 60_000), [{ name: "cached" }]);

    await clearServerCache();
    assert.equal(await readServerCache("search", "test", 60_000), undefined);
  });
});

test("server cache can delete one namespace key without touching others", async () => {
  await withTempCwd(async () => {
    const { deleteServerCache, readServerCache, writeServerCache } = loadServerCache();

    await writeServerCache("bangumi-search-v2", "oni::page=1::size=8", { kind: "subject-search" });
    await writeServerCache("bangumi-search-v2", "oni::page=2::size=8", { kind: "other-search-page" });
    await writeServerCache("bangumi-subject-info", "12345", { kind: "episode-list" });

    await deleteServerCache("bangumi-search-v2", "oni::page=1::size=8");

    assert.equal(await readServerCache("bangumi-search-v2", "oni::page=1::size=8", 60_000), undefined);
    assert.deepEqual(await readServerCache("bangumi-search-v2", "oni::page=2::size=8", 60_000), {
      kind: "other-search-page"
    });
    assert.deepEqual(await readServerCache("bangumi-subject-info", "12345", 60_000), {
      kind: "episode-list"
    });
  });
});

test("server cache can delete search pages by keyword prefix without touching subject info", async () => {
  await withTempCwd(async () => {
    const { deleteServerCacheByKeyPrefix, readServerCache, writeServerCache } = loadServerCache();

    await writeServerCache("bangumi-search-v2", "oni::page=1::size=8", { page: 1 });
    await writeServerCache("bangumi-search-v2", "oni::page=2::size=8", { page: 2 });
    await writeServerCache("bangumi-search-v2", "onii::page=1::size=8", { page: 1 });
    await writeServerCache("bangumi-subject-info", "oni", { kind: "episode-list" });

    await deleteServerCacheByKeyPrefix("bangumi-search-v2", "oni::page=");

    assert.equal(await readServerCache("bangumi-search-v2", "oni::page=1::size=8", 60_000), undefined);
    assert.equal(await readServerCache("bangumi-search-v2", "oni::page=2::size=8", 60_000), undefined);
    assert.deepEqual(await readServerCache("bangumi-search-v2", "onii::page=1::size=8", 60_000), { page: 1 });
    assert.deepEqual(await readServerCache("bangumi-subject-info", "oni", 60_000), { kind: "episode-list" });
  });
});

test("server cache prefix deletion skips malformed encoded file names", async () => {
  await withTempCwd(async (dir) => {
    const { deleteServerCacheByKeyPrefix, readServerCache, writeServerCache } = loadServerCache();
    const namespaceDir = join(dir, "data", "cache", "bangumi-search-v2");

    await writeServerCache("bangumi-search-v2", "oni::page=1::size=8", { page: 1 });
    await mkdir(namespaceDir, { recursive: true });
    await writeFile(join(namespaceDir, "%E0%A4%A.json"), "not-json", "utf8");

    await deleteServerCacheByKeyPrefix("bangumi-search-v2", "oni::page=");

    assert.equal(await readServerCache("bangumi-search-v2", "oni::page=1::size=8", 60_000), undefined);
    assert.equal(existsSync(join(namespaceDir, "%E0%A4%A.json")), true);
  });
});
