import { readFile, rm } from "node:fs/promises";
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const configDir = path.join(rootDir, "config");
const appConfigPath = path.join(configDir, "app.json");
const localEnvPath = path.join(configDir, ".env.local");
const nextCachePath = path.join(rootDir, ".next");

function displayPath(filePath) {
  return path.relative(rootDir, filePath).replaceAll(path.sep, "/");
}

function parseEnvValue(value) {
  const trimmed = value.trim();
  const quote = trimmed[0];
  if ((quote === "\"" || quote === "'") && trimmed.endsWith(quote)) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

async function loadLocalEnv() {
  let rawEnv;

  try {
    rawEnv = await readFile(localEnvPath, "utf8");
  } catch (error) {
    if (error.code === "ENOENT") return;
    throw new Error(`Cannot read ${displayPath(localEnvPath)}: ${error.message}`);
  }

  for (const line of rawEnv.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex <= 0) continue;

    const key = trimmed.slice(0, separatorIndex).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key) || process.env[key] !== undefined) continue;

    process.env[key] = parseEnvValue(trimmed.slice(separatorIndex + 1));
  }
}

async function loadServerPort() {
  let rawConfig;

  try {
    rawConfig = await readFile(appConfigPath, "utf8");
  } catch (error) {
    throw new Error(`Cannot read ${displayPath(appConfigPath)}: ${error.message}`);
  }

  let config;
  try {
    config = JSON.parse(rawConfig);
  } catch (error) {
    throw new Error(`Invalid JSON in ${displayPath(appConfigPath)}: ${error.message}`);
  }

  const port = config?.server?.port;
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("config/app.json server.port must be an integer from 1 to 65535.");
  }

  return port;
}

function hasPortArg(args) {
  return args.some((arg) => arg === "-p" || arg === "--port" || arg.startsWith("--port="));
}

async function clearDevCache() {
  const resolvedCachePath = path.resolve(nextCachePath);
  if (resolvedCachePath !== path.join(rootDir, ".next")) {
    throw new Error("Refusing to clear an unexpected Next.js cache path.");
  }
  await rm(resolvedCachePath, { force: true, recursive: true });
}

async function main() {
  const command = process.argv[2] || "dev";
  const port = await loadServerPort();

  if (command === "print-port") {
    process.stdout.write(String(port));
    return;
  }

  const nextCommands = new Set(["dev", "build", "start", "lint"]);
  if (!nextCommands.has(command)) {
    throw new Error(`Unknown command: ${command}`);
  }

  await loadLocalEnv();
  if (command === "dev") {
    await clearDevCache();
  }

  const extraArgs = process.argv.slice(3);
  const args = [command, ...extraArgs];
  if ((command === "dev" || command === "start") && !hasPortArg(extraArgs)) {
    args.push("-p", String(port));
  }

  const nextBin = path.join(rootDir, "node_modules", "next", "dist", "bin", "next");
  const child = spawn(process.execPath, [nextBin, ...args], {
    cwd: rootDir,
    stdio: "inherit",
    windowsHide: false
  });

  child.on("exit", (code, signal) => {
    if (signal) {
      process.kill(process.pid, signal);
      return;
    }
    process.exit(code ?? 0);
  });
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
