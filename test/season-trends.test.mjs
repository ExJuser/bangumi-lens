import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import test from "node:test";
import ts from "typescript";

const require = createRequire(import.meta.url);

function requireTypeScriptModule(path) {
  assert.equal(existsSync(path), true, `${path} should exist`);
  const source = readFileSync(path, "utf8");
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: {
      esModuleInterop: true,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020
    }
  });
  const module = { exports: {} };
  const localRequire = (specifier) => {
    if (specifier.startsWith("@/")) {
      return require(join(process.cwd(), specifier.slice(2)));
    }
    return require(specifier);
  };

  Function("require", "module", "exports", outputText)(localRequire, module, module.exports);
  return module.exports;
}

function makeReport(index, overrides = {}) {
  const episodeTotal = overrides.episodeTotal;
  return {
    id: `report-${index}`,
    report: {
      episodeSummary: `episode ${index}`,
      opinionSummary: `opinion ${index}`,
      episodeDetails: [],
      productionNotes: [],
      discussionHotspots: [
        {
          title: index % 2 === 0 ? "演出争议" : "节奏讨论",
          summary: index % 2 === 0 ? "部分观众对节奏有分歧和质疑。" : "普通讨论点。",
          sourceCommentIds: [`hot-${index}`],
          quotes: []
        }
      ],
      resonancePoints: [
        {
          title: `共鸣 ${index}`,
          summary: `观众喜欢第 ${index} 集的情绪表达。`,
          sourceCommentIds: [`res-${index}`],
          quotes: []
        }
      ],
      spoilerNotes: [],
      generatedAt: `2026-06-20T00:00:${String(index).padStart(2, "0")}.000Z`,
      meta: {
        url: `https://bgm.tv/ep/${index}`,
        episodeId: String(index),
        episodeNumber: index,
        episodeSort: index,
        subjectId: Object.hasOwn(overrides, "subjectId") ? overrides.subjectId : "subject-1",
        title: `Episode ${index}`,
        subjectTitle: overrides.subjectTitle || "Subject",
        episodeTotal,
        rating: overrides.rating === false ? undefined : { average: 7 + index / 10, voteCount: 100 + index, votes: {} }
      },
      stats: {
        commentCount: 10 * index,
        replyCount: index,
        reactionCount: index * 2,
        participantCount: 8 * index
      }
    }
  };
}

test("buildSeasonTrendPayload sorts same-subject reports and excludes other subjects", () => {
  const { buildSeasonTrendPayload } = requireTypeScriptModule(join(process.cwd(), "lib", "season-trends.ts"));
  const payload = buildSeasonTrendPayload(
    [makeReport(3, { episodeTotal: 4 }), makeReport(1, { episodeTotal: 4 }), makeReport(2, { subjectId: "other" })],
    "subject-1"
  );

  assert.deepEqual(payload.episodes.map((episode) => episode.id), ["1", "3"]);
  assert.equal(payload.savedReportCount, 2);
  assert.equal(payload.available, true);
});

test("buildSeasonTrendPayload can fall back to subject title when subject id is missing", () => {
  const { buildSeasonTrendPayload } = requireTypeScriptModule(join(process.cwd(), "lib", "season-trends.ts"));
  const payload = buildSeasonTrendPayload(
    [
      makeReport(1, { subjectId: undefined, subjectTitle: "Fallback Subject" }),
      makeReport(2, { subjectId: undefined, subjectTitle: "Fallback Subject" }),
      makeReport(3, { subjectId: "other", subjectTitle: "Other Subject" })
    ],
    undefined,
    "Fallback Subject"
  );

  assert.deepEqual(payload.episodes.map((episode) => episode.id), ["1", "2"]);
  assert.equal(payload.available, true);
});

test("season trend threshold is half of known episode total", () => {
  const { buildSeasonTrendPayload } = requireTypeScriptModule(join(process.cwd(), "lib", "season-trends.ts"));
  const fiveReports = Array.from({ length: 5 }, (_, index) => makeReport(index + 1, { episodeTotal: 12 }));
  const sixReports = Array.from({ length: 6 }, (_, index) => makeReport(index + 1, { episodeTotal: 12 }));

  assert.equal(buildSeasonTrendPayload(fiveReports, "subject-1").available, false);
  assert.equal(buildSeasonTrendPayload(fiveReports, "subject-1").requiredReportCount, 6);
  assert.equal(buildSeasonTrendPayload(sixReports, "subject-1").available, true);
});

test("odd episode totals round the threshold up", () => {
  const { buildSeasonTrendPayload } = requireTypeScriptModule(join(process.cwd(), "lib", "season-trends.ts"));
  const sixReports = Array.from({ length: 6 }, (_, index) => makeReport(index + 1, { episodeTotal: 13 }));
  const sevenReports = Array.from({ length: 7 }, (_, index) => makeReport(index + 1, { episodeTotal: 13 }));

  assert.equal(buildSeasonTrendPayload(sixReports, "subject-1").available, false);
  assert.equal(buildSeasonTrendPayload(sevenReports, "subject-1").requiredReportCount, 7);
  assert.equal(buildSeasonTrendPayload(sevenReports, "subject-1").available, true);
});

test("unknown episode totals fall back to two reports and missing metrics do not crash", () => {
  const { buildSeasonTrendPayload } = requireTypeScriptModule(join(process.cwd(), "lib", "season-trends.ts"));
  const payload = buildSeasonTrendPayload([makeReport(1, { rating: false }), makeReport(2, { rating: false })], "subject-1");

  assert.equal(payload.requiredReportCount, 2);
  assert.equal(payload.available, true);
  assert.equal(payload.metrics.rating.direction, "unknown");
  assert.equal(payload.metrics.heat.direction, "rising");
});

test("season trends aggregate resonance and controversy points", () => {
  const { buildSeasonTrendPayload } = requireTypeScriptModule(join(process.cwd(), "lib", "season-trends.ts"));
  const reports = Array.from({ length: 6 }, (_, index) => makeReport(index + 1, { episodeTotal: 12 }));
  const payload = buildSeasonTrendPayload(reports, "subject-1");

  assert.equal(payload.resonancePoints.length > 0, true);
  assert.equal(payload.controversyPoints.length > 0, true);
  assert.match(payload.localSummary, /截至第 6 话/);
});
