import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { extname, join } from "node:path";
import test from "node:test";
import ts from "typescript";

const require = createRequire(import.meta.url);
const moduleCache = new Map();

function requireTypeScriptModule(path) {
  const resolvedPath = extname(path) ? path : `${path}.ts`;
  assert.equal(existsSync(resolvedPath), true, `${resolvedPath} should exist`);
  if (moduleCache.has(resolvedPath)) return moduleCache.get(resolvedPath).exports;

  const source = readFileSync(resolvedPath, "utf8");
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: {
      esModuleInterop: true,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020
    }
  });
  const module = { exports: {} };
  moduleCache.set(resolvedPath, module);

  const localRequire = (specifier) => {
    if (specifier.startsWith("@/")) {
      return requireTypeScriptModule(join(process.cwd(), specifier.slice(2)));
    }
    return require(specifier);
  };

  Function("require", "module", "exports", outputText)(localRequire, module, module.exports);
  return module.exports;
}

test("fetchBangumiSubjectInfo maps official subject rating into subjectRating", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () =>
    new Response(
      JSON.stringify({
        name_cn: "落语朱音",
        total_episodes: 12,
        rating: {
          score: 7.82,
          total: 1234,
          count: {
            10: 11,
            9: 100,
            8: 700,
            7: 300,
            6: 90,
            5: 20,
            4: 10,
            3: 2,
            2: 1,
            1: 0
          }
        }
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );

  try {
    const { fetchBangumiSubjectInfo } = requireTypeScriptModule(join(process.cwd(), "lib", "bangumi.ts"));
    const subjectInfo = await fetchBangumiSubjectInfo("576121");

    assert.deepEqual(subjectInfo, {
      titleCn: "落语朱音",
      episodeTotal: 12,
      subjectRating: {
        average: 7.82,
        voteCount: 1234,
        modeScore: 8,
        votes: {
          "10": 11,
          "9": 100,
          "8": 700,
          "7": 300,
          "6": 90,
          "5": 20,
          "4": 10,
          "3": 2,
          "2": 1
        }
      }
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("fetchBangumiSubjectInfo excludes normal-list extras past the official episode total", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    const href = String(url);
    if (href.includes("/v0/subjects/")) {
      return new Response(
        JSON.stringify({
          name_cn: "只有我不存在的城市",
          eps: 12,
          total_episodes: 14,
          rating: { score: 8, total: 1, count: { 8: 1 } }
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({
        total: 14,
        data: Array.from({ length: 14 }, (_, index) => ({
          id: 1000 + index,
          sort: index + 1,
          name_cn: `Episode ${index + 1}`,
          type: 0
        }))
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  };

  try {
    const { fetchBangumiSubjectInfo } = requireTypeScriptModule(join(process.cwd(), "lib", "bangumi.ts"));
    const subjectInfo = await fetchBangumiSubjectInfo("123", { includeEpisodes: true });

    assert.equal(subjectInfo.episodeTotal, 12);
    assert.equal(subjectInfo.episodes.length, 12);
    assert.deepEqual(
      subjectInfo.episodes.map((episode) => episode.sort),
      [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});
