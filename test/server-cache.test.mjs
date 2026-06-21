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
