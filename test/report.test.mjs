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
  if (extname(resolvedPath) === ".json") {
    return JSON.parse(readFileSync(resolvedPath, "utf8"));
  }
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

test("parseReportOutput keeps defaults and enriches source evidence without engagement stats", () => {
  const { parseReportOutput } = requireTypeScriptModule(join(process.cwd(), "lib", "report.ts"));
  const meta = {
    url: "https://bgm.tv/ep/1",
    episodeId: "1",
    title: "Episode 1"
  };
  const comments = [
    {
      id: "post-1",
      floor: "12",
      author: "alice",
      text: "comment text",
      replyCount: 3,
      reactionCount: 2,
      likeCount: 5,
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
  assert.equal(Number.isFinite(new Date(report.generatedAt).getTime()), true);
  assert.equal("reactions" in report.discussionHotspots[0].quotes?.[0], false);
  assert.deepEqual(report.discussionHotspots[0].quotes?.[0].source, {
    id: "post-1",
    floor: "12",
    author: "alice",
    text: "comment text",
    commentUrl: "https://bgm.tv/ep/1#post_post-1"
  });
  assert.deepEqual(report.discussionHotspots[0].sourceEvidence, [
    {
      id: "post-1",
      floor: "12",
      author: "alice",
      text: "comment text",
      commentUrl: "https://bgm.tv/ep/1#post_post-1"
    }
  ]);
  assert.equal("replyCount" in report.discussionHotspots[0].quotes?.[0].source, false);
  assert.equal("reactionCount" in report.discussionHotspots[0].quotes?.[0].source, false);
  assert.equal("reactions" in report.discussionHotspots[0].quotes?.[0].source, false);
  assert.equal("replyCount" in report.discussionHotspots[0].sourceEvidence?.[0], false);
  assert.equal("reactionCount" in report.discussionHotspots[0].sourceEvidence?.[0], false);
  assert.equal("reactions" in report.discussionHotspots[0].sourceEvidence?.[0], false);
  assert.deepEqual(report.resonancePoints[0].quotes?.[0], { text: "legacy string quote" });
  assert.deepEqual(report.stanceDistribution, []);
  assert.deepEqual(report.stats, {
    commentCount: 1,
    replyCount: 3,
    reactionCount: 2,
    participantCount: 1
  });
});

test("parseReportOutput validates stance distribution and enriches evidence", () => {
  const { parseReportOutput } = requireTypeScriptModule(join(process.cwd(), "lib", "report.ts"));
  const report = parseReportOutput(
    JSON.stringify({
      episodeSummary: "summary",
      opinionSummary: "opinion",
      discussionHotspots: [],
      resonancePoints: [],
      stanceDistribution: [
        {
          label: "好评",
          percentage: "42",
          summary: "观众认可本集演出。",
          sourceCommentIds: ["post-stance"]
        }
      ]
    }),
    {
      url: "https://bgm.tv/ep/3",
      episodeId: "3",
      title: "Episode 3"
    },
    [
      {
        id: "post-stance",
        floor: "8",
        author: "bob",
        text: "演出很好",
        replyCount: 1,
        reactionCount: 3,
        likeCount: 2,
        reactions: [{ label: "+1", count: 3 }],
        replies: [],
        weight: 1,
        signals: { discussion: 1, resonance: 1, information: 0 }
      }
    ]
  );

  assert.equal(report.stanceDistribution?.[0].percentage, 42);
  assert.deepEqual(report.stanceDistribution?.[0].sourceEvidence, [
    {
      id: "post-stance",
      floor: "8",
      author: "bob",
      text: "演出很好",
      commentUrl: "https://bgm.tv/ep/3#post_post-stance"
    }
  ]);
});

test("parseReportOutput removes clearly positive comments from controversy evidence", () => {
  const { parseReportOutput } = requireTypeScriptModule(join(process.cwd(), "lib", "report.ts"));
  const report = parseReportOutput(
    JSON.stringify({
      episodeSummary: "summary",
      opinionSummary: "opinion",
      discussionHotspots: [],
      resonancePoints: [],
      stanceDistribution: [
        {
          label: "争议",
          percentage: 10,
          summary: "对笑点质量看法两极分化，部分观众认为一般般或中等。",
          sourceCommentIds: ["post-positive", "post-controversy"]
        },
        {
          label: "好评",
          percentage: 40,
          summary: "不少观众认可本集。",
          sourceCommentIds: []
        }
      ]
    }),
    {
      url: "https://bgm.tv/ep/4",
      episodeId: "4",
      title: "Episode 4"
    },
    [
      {
        id: "post-positive",
        floor: "15",
        author: "SomeBottle",
        text: "梦回齐木 笑死，吐槽味太正了，几个魔法还真都有些用，可惜都有副作用，OP 真不错，第一集看下来感觉会是非常有趣的作品，期待后续！",
        replyCount: 0,
        reactionCount: 0,
        likeCount: 0,
        reactions: [],
        replies: [],
        weight: 1,
        signals: { discussion: 0, resonance: 1, information: 0 }
      },
      {
        id: "post-controversy",
        floor: "16",
        author: "critic",
        text: "这集笑点争议很大，有人觉得好笑，有人觉得无聊。",
        replyCount: 0,
        reactionCount: 0,
        likeCount: 0,
        reactions: [],
        replies: [],
        weight: 1,
        signals: { discussion: 1, resonance: 0, information: 0 }
      }
    ]
  );

  const controversy = report.stanceDistribution?.find((item) => item.label === "争议");
  const positive = report.stanceDistribution?.find((item) => item.label === "好评");

  assert.deepEqual(
    controversy?.sourceEvidence?.map((item) => item.id),
    ["post-controversy"]
  );
  assert.deepEqual(
    positive?.sourceEvidence?.map((item) => item.id),
    ["post-positive"]
  );
});

test("report prompt presets inject style instructions and fall back to default", () => {
  const { loadReportPrompt, resolveReportPromptPreset } = requireTypeScriptModule(
    join(process.cwd(), "lib", "report-prompt.ts")
  );

  const productionPrompt = loadReportPrompt("{}", "production_focus");
  assert.equal(productionPrompt.preset.id, "production_focus");
  assert.match(productionPrompt.task, /制作向/);
  assert.match(productionPrompt.task, /productionNotes/);

  const fallbackPreset = resolveReportPromptPreset("unknown");
  assert.equal(fallbackPreset.id, "default");
});

test("report prompt appends trimmed custom prompt without changing blank defaults", () => {
  const { loadReportPrompt } = requireTypeScriptModule(join(process.cwd(), "lib", "report-prompt.ts"));

  const defaultPrompt = loadReportPrompt("{}", "default");
  const blankPrompt = loadReportPrompt("{}", "default", "   ");
  const customPrompt = loadReportPrompt("{}", "default", "  更关注演出节奏，少写玩梗。  ");

  assert.equal(blankPrompt.task, defaultPrompt.task);
  assert.match(customPrompt.task, /用户自定义提示词/);
  assert.match(customPrompt.task, /更关注演出节奏，少写玩梗。/);
});

test("parseReportOutput records the selected prompt preset", () => {
  const { parseReportOutput } = requireTypeScriptModule(join(process.cwd(), "lib", "report.ts"));
  const report = parseReportOutput(
    JSON.stringify({
      episodeSummary: "summary",
      opinionSummary: "opinion",
      discussionHotspots: [],
      resonancePoints: []
    }),
    {
      url: "https://bgm.tv/ep/2",
      episodeId: "2",
      title: "Episode 2"
    },
    [],
    "brief"
  );

  assert.deepEqual(report.promptPreset, {
    id: "brief",
    name: "短摘要"
  });
});
