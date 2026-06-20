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

test("buildReportStats counts unique main comment and reply authors as participants", () => {
  const { buildReportStats } = requireTypeScriptModule(join(process.cwd(), "lib", "report-stats.ts"));
  const stats = buildReportStats([
    {
      author: "alice",
      replyCount: 2,
      reactionCount: 3,
      likeCount: 1,
      replies: [
        { author: "bob", text: "reply", reactionCount: 0 },
        { author: "alice", text: "reply again", reactionCount: 0 }
      ]
    },
    {
      author: "carol",
      replyCount: 1,
      reactionCount: 0,
      likeCount: 2,
      replies: [
        { author: "dave", text: "reply", reactionCount: 0 },
        { text: "anonymous reply", reactionCount: 0 }
      ]
    }
  ]);

  assert.deepEqual(stats, {
    commentCount: 2,
    replyCount: 3,
    reactionCount: 6,
    participantCount: 4
  });
});

test("buildReportStats prefers author ids for participant de-duplication", () => {
  const { buildReportStats } = requireTypeScriptModule(join(process.cwd(), "lib", "report-stats.ts"));
  const stats = buildReportStats([
    {
      author: "same-name",
      authorId: "user-a",
      replyCount: 2,
      reactionCount: 0,
      likeCount: 0,
      replies: [
        { author: "same-name", authorId: "user-a", text: "same user reply", reactionCount: 0 },
        { author: "same-name", authorId: "user-b", text: "different user reply", reactionCount: 0 }
      ]
    }
  ]);

  assert.equal(stats.participantCount, 2);
});
