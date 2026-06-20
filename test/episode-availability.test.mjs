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

test("future official airdate marks an adjacent episode as not yet aired", () => {
  const { getEpisodeAvailabilityWarning } = requireTypeScriptModule(
    join(process.cwd(), "lib", "episode-availability.ts")
  );

  assert.deepEqual(
    getEpisodeAvailabilityWarning(
      {
        id: "12",
        airdate: "2026-06-21",
        commentCount: 0
      },
      new Date(2026, 5, 20, 12)
    ),
    {
      certainty: "confirmed",
      airdate: "2026-06-21",
      commentCount: 0
    }
  );
});

test("zero comments alone does not mark an old episode as not yet aired", () => {
  const { getEpisodeAvailabilityWarning } = requireTypeScriptModule(
    join(process.cwd(), "lib", "episode-availability.ts")
  );

  assert.equal(
    getEpisodeAvailabilityWarning(
      {
        id: "3",
        airdate: "2024-01-01",
        commentCount: 0
      },
      new Date(2026, 5, 20, 12)
    ),
    undefined
  );

  assert.equal(
    getEpisodeAvailabilityWarning(
      {
        id: "3",
        commentCount: 0
      },
      new Date(2026, 5, 20, 12)
    ),
    undefined
  );
});

test("same-day official airdate plus zero comments is treated as a possible pre-broadcast episode", () => {
  const { getEpisodeAvailabilityWarning } = requireTypeScriptModule(
    join(process.cwd(), "lib", "episode-availability.ts")
  );

  assert.deepEqual(
    getEpisodeAvailabilityWarning(
      {
        id: "12",
        airdate: "2026-06-20",
        commentCount: 0
      },
      new Date(2026, 5, 20, 12)
    ),
    {
      certainty: "possible",
      airdate: "2026-06-20",
      commentCount: 0
    }
  );
});
