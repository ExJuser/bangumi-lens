import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, rm, mkdir, writeFile } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
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

function loadHistoryStore() {
  return requireTypeScriptModule(join(repoRoot, "lib", "history-store.ts"));
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

test("history storage toggles liked episodes and carries the mark across regeneration", async () => {
  await withTempCwd(async () => {
    const { saveHistoryReport, readHistoryIndex, updateHistoryReportLike } = loadHistoryStore();
    const report = makeReport(7);

    let history = await saveHistoryReport(report, report.meta.url);
    assert.equal(history[0].likedAt, undefined);

    history = await updateHistoryReportLike(history[0].id, true);
    assert.equal(typeof history[0].likedAt, "string");

    history = await saveHistoryReport({ ...report, episodeSummary: "regenerated" }, report.meta.url);
    assert.equal(typeof history[0].likedAt, "string");

    history = await updateHistoryReportLike(history[0].id, false);
    assert.equal(history[0].likedAt, undefined);

    const index = await readHistoryIndex();
    assert.equal(index[0].likedAt, undefined);
  });
});

test("history storage can clear every report and legacy history file", async () => {
  await withTempCwd(async (dir) => {
    const { clearHistoryReports, readHistory, saveHistoryReport } = loadHistoryStore();

    const firstReport = makeReport(21);
    const secondReport = makeReport(22);
    await saveHistoryReport(firstReport, firstReport.meta.url);
    await saveHistoryReport(secondReport, secondReport.meta.url);
    await mkdir(join(dir, "data"), { recursive: true });
    await writeFile(join(dir, "data", "reports.json"), JSON.stringify([{ id: "legacy" }]), "utf8");

    const history = await clearHistoryReports();

    assert.deepEqual(history, []);
    assert.equal((await readHistory()).length, 0);
    assert.equal(existsSync(join(dir, "data", "reports.json")), false);
    assert.deepEqual(await readdir(join(dir, "data", "reports", "items")), []);
    const indexJson = JSON.parse(await readFile(join(dir, "data", "reports", "index.json"), "utf8"));
    assert.deepEqual(indexJson, []);
  });
});

test("history status reads lightweight index state by normalized episode URL", async () => {
  await withTempCwd(async () => {
    const { readHistoryReportStatus, saveHistoryReport, updateHistoryReportLike } = loadHistoryStore();
    const missingStatus = await readHistoryReportStatus("https://bgm.tv/ep/8");
    assert.deepEqual(missingStatus, { exists: false });

    const report = makeReport(8);
    const history = await saveHistoryReport(report, "https://bangumi.tv/ep/8?from=test");
    await updateHistoryReportLike(history[0].id, true);

    const status = await readHistoryReportStatus("https://chii.in/ep/8");
    assert.equal(status.exists, true);
    assert.equal(status.id, history[0].id);
    assert.equal(status.savedAt, history[0].savedAt);
    assert.equal(status.liked, true);
    assert.equal(status.stale, false);
    assert.equal(status.reportUrl, `/reports/${encodeURIComponent(history[0].id)}`);
  });
});

test("history status marks reports older than fifteen days as stale", async () => {
  await withTempCwd(async (dir) => {
    const reportsDir = join(dir, "data", "reports");
    const staleSavedAt = new Date(Date.now() - 16 * 24 * 60 * 60 * 1000).toISOString();
    await mkdir(reportsDir, { recursive: true });
    await writeFile(
      join(reportsDir, "index.json"),
      JSON.stringify([
        {
          id: "stale-episode",
          url: "https://bgm.tv/ep/12",
          savedAt: staleSavedAt,
          reportPath: "items/stale-episode.json",
          meta: makeReport(12).meta,
          stats: makeReport(12).stats
        }
      ]),
      "utf8"
    );

    const { readHistoryReportStatus } = loadHistoryStore();
    const status = await readHistoryReportStatus("https://bangumi.tv/ep/12");
    assert.equal(status.exists, true);
    assert.equal(status.stale, true);
  });
});

test("history status skips invalid stored urls while finding normalized matches", async () => {
  await withTempCwd(async (dir) => {
    const reportsDir = join(dir, "data", "reports");
    await mkdir(reportsDir, { recursive: true });
    await writeFile(
      join(reportsDir, "index.json"),
      JSON.stringify([
        {
          id: "bad-url",
          url: "not-a-url",
          savedAt: "2026-06-20T00:00:00.000Z",
          reportPath: "items/bad-url.json",
          meta: { ...makeReport(99).meta, url: "https://example.test/ep/99" },
          stats: makeReport(99).stats
        },
        {
          id: "good-url",
          url: "https://bangumi.tv/ep/13?from=history",
          savedAt: "2026-06-20T00:00:00.000Z",
          reportPath: "items/good-url.json",
          meta: makeReport(13).meta,
          stats: makeReport(13).stats
        }
      ]),
      "utf8"
    );

    const { readHistoryReportStatus } = loadHistoryStore();
    const status = await readHistoryReportStatus("https://chii.in/ep/13");

    assert.equal(status.exists, true);
    assert.equal(status.id, "good-url");
  });
});

test("history storage rejects index report paths outside the items directory", async () => {
  await withTempCwd(async (dir) => {
    const reportsDir = join(dir, "data", "reports");
    await mkdir(reportsDir, { recursive: true });
    await writeFile(join(reportsDir, "outside.json"), JSON.stringify(makeReport(9)), "utf8");
    await writeFile(
      join(reportsDir, "index.json"),
      JSON.stringify([
        {
          id: "bad-path",
          url: "https://bgm.tv/ep/9",
          savedAt: "2026-06-20T00:00:00.000Z",
          reportPath: "../outside.json",
          meta: makeReport(9).meta,
          stats: makeReport(9).stats
        }
      ]),
      "utf8"
    );

    const { readHistoryReport } = loadHistoryStore();
    await assert.rejects(() => readHistoryReport("bad-path"), /Invalid report path/);
  });
});
