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
      target: ts.ScriptTarget.ES2020,
      resolveJsonModule: true
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

test("parseReportOutput keeps defaults and enriches quote reactions", () => {
  const { parseReportOutput } = requireTypeScriptModule(join(process.cwd(), "lib", "report.ts"));
  const meta = {
    url: "https://bgm.tv/ep/1",
    episodeId: "1",
    title: "Episode 1"
  };
  const comments = [
    {
      id: "post-1",
      text: "comment text",
      replyCount: 0,
      reactionCount: 2,
      likeCount: 0,
      reactions: [{ label: "like", count: 2 }],
      replies: [],
      weight: 1,
      signals: { discussion: 0, resonance: 1, information: 0 }
    }
  ];
  const report = parseReportOutput(
    JSON.stringify({
      episodeSummary: "summary",
      opinionSummary: "opinion",
      discussionHotspots: [
        {
          title: "hotspot",
          summary: "discussion",
          quotes: [{ text: "quoted", sourceCommentId: "post-1" }],
          sourceCommentIds: ["post-1"]
        }
      ],
      resonancePoints: [
        {
          title: "resonance",
          summary: "point",
          quotes: ["legacy string quote"],
          sourceCommentIds: []
        }
      ]
    }),
    meta,
    comments
  );

  assert.equal(report.episodeDetails.length, 0);
  assert.equal(report.productionNotes.length, 0);
  assert.deepEqual(report.discussionHotspots[0].quotes?.[0].reactions, [{ label: "like", count: 2 }]);
  assert.deepEqual(report.resonancePoints[0].quotes?.[0], { text: "legacy string quote" });
  assert.deepEqual(report.stats, {
    commentCount: 1,
    replyCount: 0,
    reactionCount: 2,
    participantCount: 0
  });
});
