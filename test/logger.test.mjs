import assert from "node:assert/strict";
import { mkdtemp, readFile, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";
import { existsSync, readFileSync } from "node:fs";
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
  Function("require", "module", "exports", outputText)(require, module, module.exports);
  return module.exports;
}

test("appendAppLog writes timestamped structured log lines", async () => {
  const { appendAppLog } = requireTypeScriptModule(join(process.cwd(), "lib", "logger.ts"));
  const dir = await mkdtemp(join(tmpdir(), "bangumi-lens-log-"));
  const filePath = join(dir, "app.log");

  await appendAppLog("info", "history.read", { count: 2 }, { filePath });

  const raw = await readFile(filePath, "utf8");
  const record = JSON.parse(raw.trim());
  assert.equal(record.level, "info");
  assert.equal(record.message, "history.read");
  assert.equal(record.count, 2);
  assert.match(record.time, /^\d{4}-\d{2}-\d{2}T/);
});

test("APP_LOG_FILE keeps application logs in the logs directory", () => {
  const { APP_LOG_FILE } = requireTypeScriptModule(join(process.cwd(), "lib", "logger.ts"));

  assert.equal(APP_LOG_FILE, join(process.cwd(), "logs", "app.log"));
});

test("appendAppLog trims old content when the log exceeds the configured size", async () => {
  const { appendAppLog } = requireTypeScriptModule(join(process.cwd(), "lib", "logger.ts"));
  const dir = await mkdtemp(join(tmpdir(), "bangumi-lens-log-"));
  const filePath = join(dir, "app.log");

  for (let index = 0; index < 10; index += 1) {
    await appendAppLog("info", "oversized.entry", { index, payload: "x".repeat(80) }, {
      filePath,
      maxBytes: 450,
      retainBytes: 180
    });
  }

  const raw = await readFile(filePath, "utf8");
  const fileStats = await stat(filePath);
  assert.ok(fileStats.size <= 450);
  assert.ok(raw.includes("log truncated"));
  assert.ok(raw.includes("oversized.entry"));
  assert.ok(raw.includes('"index":9'));
});
