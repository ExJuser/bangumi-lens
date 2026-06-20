import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import Module from "node:module";
import test from "node:test";
import ts from "typescript";

const repoRoot = process.cwd();

function loadHistoryStore() {
  const filename = join(repoRoot, "lib", "history-store.ts");
  const source = readFileSync(filename, "utf8");
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true
    },
    fileName: filename
  }).outputText;
  const module = new Module(filename);
  module.filename = filename;
  module.paths = Module._nodeModulePaths(repoRoot);
  module._compile(compiled, filename);
  return module.exports;
}

function makeReport(index) {
  return {
    episodeSummary: `episode ${index}`,
    opinionSummary: `opinion ${index}`,
    episodeDetails: [],
    productionNotes: [],
    discussionHotspots: [],
    resonancePoints: [],
    spoilerNotes: [],
    meta: {
      url: `https://bgm.tv/ep/${index}`,
      episodeId: String(index),
      episodeNumber: index,
      subjectId: "subject-1",
      title: `Episode ${index}`,
      subjectTitle: "Subject"
    },
    stats: {
      commentCount: index,
      replyCount: 0,
      reactionCount: 0,
      participantCount: index
    }
  };
}

async function withTempCwd(run) {
  const originalCwd = process.cwd();
  const dir = await mkdtemp(join(tmpdir(), "bangumi-lens-history-"));
  process.chdir(dir);
  try {
    await run(dir);
  } finally {
    process.chdir(originalCwd);
    await rm(dir, { recursive: true, force: true });
  }
}

test("history storage keeps every report and writes lightweight index plus report files", async () => {
  await withTempCwd(async (dir) => {
    const { saveHistoryReport, readHistory } = loadHistoryStore();

    for (let index = 1; index <= 65; index += 1) {
      const report = makeReport(index);
      await saveHistoryReport(report, report.meta.url);
    }

    const history = await readHistory();
    assert.equal(history.length, 65);
    assert.equal(history[0].report.meta.episodeId, "65");
    assert.equal(history[64].report.meta.episodeId, "1");

    const indexPath = join(dir, "data", "reports", "index.json");
    const indexJson = JSON.parse(await readFile(indexPath, "utf8"));
    assert.equal(indexJson.length, 65);
    assert.equal(indexJson[0].report, undefined);
    assert.equal(indexJson[0].reportPath.startsWith("items/"), true);

    const firstReportPath = join(dir, "data", "reports", indexJson[0].reportPath);
    assert.equal(existsSync(firstReportPath), true);
    const firstReport = JSON.parse(await readFile(firstReportPath, "utf8"));
    assert.equal(firstReport.meta.episodeId, "65");
  });
});

test("history storage migrates legacy data/reports.json without losing entries", async () => {
  await withTempCwd(async (dir) => {
    const dataDir = join(dir, "data");
    await import("node:fs/promises").then(({ mkdir, writeFile }) =>
      mkdir(dataDir, { recursive: true }).then(() =>
        writeFile(
          join(dataDir, "reports.json"),
          JSON.stringify(
            [1, 2, 3].map((index) => ({
              id: `legacy-${index}`,
              url: `https://bgm.tv/ep/${index}`,
              savedAt: `2026-06-20T00:00:0${index}.000Z`,
              report: makeReport(index)
            })),
            null,
            2
          )
        )
      )
    );

    const { readHistory } = loadHistoryStore();
    const history = await readHistory();

    assert.equal(history.length, 3);
    assert.equal(history[0].id, "legacy-1");
    assert.equal(existsSync(join(dir, "data", "reports", "index.json")), true);
    assert.equal(existsSync(join(dir, "data", "reports", "items", "legacy-1.json")), true);
  });
});
