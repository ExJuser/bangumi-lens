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

test("parseEpisode extracts authors after empty avatar links", () => {
  const { bangumiInternals } = requireTypeScriptModule(join(process.cwd(), "lib", "bangumi.ts"));
  const { buildReportStats } = requireTypeScriptModule(join(process.cwd(), "lib", "report-stats.ts"));
  const html = `
    <html>
      <head><title>ep. 10 Test Episode / Test Subject</title></head>
      <body>
        <h1 class="nameSingle"><a href="/subject/1">Test Subject</a></h1>
        <div id="comment_list">
          <div id="post_100" class="row_reply">
            <a class="avatarNeue" href="/user/alice"></a>
            <strong><a href="/user/alice">alice</a></strong>
            <span class="message">main comment</span>
            <div class="topic_sub_reply">
              <a class="avatarNeue" href="/user/bob"></a>
              <a href="/user/bob">bob</a>
              <span class="message">reply comment</span>
            </div>
          </div>
        </div>
      </body>
    </html>
  `;

  const episode = bangumiInternals.parseEpisode(html, "https://bgm.tv/ep/1", "1");
  assert.equal(episode.comments[0].author, "alice");
  assert.equal(episode.comments[0].authorId, "alice");
  assert.equal(episode.comments[0].replies[0].author, "bob");
  assert.equal(episode.comments[0].replies[0].authorId, "bob");
  assert.equal(buildReportStats(episode.comments).participantCount, 2);
});

test("parseEpisode expands nested reply rows and does not count floor ids as reactions", () => {
  const { bangumiInternals } = requireTypeScriptModule(join(process.cwd(), "lib", "bangumi.ts"));
  const html = `
    <html>
      <head><title>ep. 10 Test Episode / Test Subject</title></head>
      <body>
        <h1 class="nameSingle"><a href="/subject/1">Test Subject</a></h1>
        <div id="comment_list">
          <div id="post_3263" class="row_reply">
            <span class="floor">3263</span>
            <a href="/user/alice">alice</a>
            <span class="message">main comment</span>
            <div class="topic_sub_reply">
              <div id="post_3264" class="row_reply">
                <a href="/user/bob">bob</a>
                <span class="message">first reply</span>
              </div>
              <div id="post_3265" class="row_reply">
                <a href="/user/carol">carol</a>
                <span class="message">second reply</span>
                <span class="reactions"><span class="item" title="+1">+1 1</span></span>
              </div>
            </div>
          </div>
        </div>
      </body>
    </html>
  `;

  const episode = bangumiInternals.parseEpisode(html, "https://bgm.tv/ep/1", "1");
  assert.equal(episode.comments.length, 1);
  assert.equal(episode.comments[0].replyCount, 2);
  assert.equal(episode.comments[0].replies.length, 2);
  assert.equal(episode.comments[0].reactionCount, 0);
  assert.deepEqual(episode.comments[0].reactions, []);
  assert.equal(episode.comments[0].replies[1].reactionCount, 1);
});
