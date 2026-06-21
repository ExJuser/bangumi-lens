import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Module from "node:module";
import test from "node:test";
import ts from "typescript";
import { readFileSync } from "node:fs";

const repoRoot = process.cwd();

function loadServerCache() {
  const filename = join(repoRoot, "lib", "server-cache.ts");
  const source = readFileSync(filename, "utf8");
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true
    },
    fileName: filename
  }).outputText;

  const mod = new Module(filename);
  mod.filename = filename;
  mod.paths = Module._nodeModulePaths(repoRoot);
  mod._compile(compiled, filename);
  return mod.exports;
}

async function withTempCwd(run) {
  const dir = await mkdtemp(join(tmpdir(), "bangumi-lens-cache-"));
  const originalCwd = process.cwd();
  process.chdir(dir);

  try {
    await run();
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
