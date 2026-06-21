import { app, BrowserWindow, ipcMain, shell } from "electron";
import { spawn } from "node:child_process";
import { createWriteStream } from "node:fs";
import { mkdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const configPath = path.join(rootDir, "config", "app.json");
const logsDir = path.join(rootDir, "logs");
const stdoutLogPath = path.join(logsDir, "dev-server.log");
const stderrLogPath = path.join(logsDir, "dev-server.err.log");
const homePath = "/home";

let mainWindow;
let childProcess = null;
let childStartedAt = null;
let currentAction = "idle";
let lastError = "";

app.commandLine.appendSwitch("disable-gpu");
app.commandLine.appendSwitch("disable-gpu-compositing");
app.commandLine.appendSwitch("disable-gpu-sandbox");
app.commandLine.appendSwitch("disable-features", "UseSkiaRenderer,VizDisplayCompositor");
app.commandLine.appendSwitch("in-process-gpu");
app.disableHardwareAcceleration();

function appUrl(port) {
  return `http://localhost:${port}${homePath}`;
}

function escapePowerShellString(value) {
  return String(value).replaceAll("'", "''");
}

function normalizeCommandLine(value) {
  return String(value || "").toLowerCase().replaceAll("/", "\\");
}

function isProjectProcess(commandLine) {
  const normalizedCommand = normalizeCommandLine(commandLine);
  const normalizedRoot = normalizeCommandLine(rootDir);
  return normalizedCommand.includes(normalizedRoot) || normalizedCommand.includes("scripts\\dev-server.mjs");
}

async function fileExists(filePath) {
  try {
    await stat(filePath);
    return true;
  } catch (error) {
    if (error.code === "ENOENT") return false;
    throw error;
  }
}

async function loadPort() {
  const rawConfig = await readFile(configPath, "utf8");
  const config = JSON.parse(rawConfig);
  const port = config?.server?.port;
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("config/app.json server.port must be an integer from 1 to 65535.");
  }
  return port;
}

function runPowerShell(command, timeoutMs = 5000) {
  return new Promise((resolve) => {
    const child = spawn("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", command], {
      cwd: rootDir,
      windowsHide: true
    });

    let stdout = "";
    let stderr = "";
    const timeout = setTimeout(() => {
      child.kill();
      resolve({ ok: false, stdout, stderr: stderr || "PowerShell command timed out." });
    }, timeoutMs);

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", (error) => {
      clearTimeout(timeout);
      resolve({ ok: false, stdout, stderr: error.message });
    });
    child.on("exit", (code) => {
      clearTimeout(timeout);
      resolve({ ok: code === 0, stdout, stderr });
    });
  });
}

async function queryPortProcesses(port) {
  const command = `
$ErrorActionPreference = 'Stop'
$connections = @(Get-NetTCPConnection -LocalPort ${port} -State Listen -ErrorAction SilentlyContinue)
$items = @()
foreach ($connection in $connections) {
  $processId = $connection.OwningProcess
  $process = $null
  try {
    $process = Get-CimInstance Win32_Process -Filter "ProcessId=$processId"
  } catch {}
  $items += [PSCustomObject]@{
    pid = $processId
    name = if ($process) { $process.Name } else { "" }
    commandLine = if ($process) { $process.CommandLine } else { "" }
  }
}
$items | ConvertTo-Json -Depth 3 -Compress
`;
  const result = await runPowerShell(command);
  if (!result.ok) {
    throw new Error((result.stderr || "Failed to query listening processes.").trim());
  }
  const output = result.stdout.trim();
  if (!output) return [];
  const parsed = JSON.parse(output);
  const items = Array.isArray(parsed) ? parsed : [parsed];
  return items.map((item) => ({
    pid: Number(item.pid),
    name: item.name || "",
    commandLine: item.commandLine || "",
    isProject: isProjectProcess(item.commandLine)
  }));
}

async function checkHttp(port) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 1800);
  try {
    const response = await fetch(appUrl(port), { signal: controller.signal });
    return response.status >= 200 && response.status < 500;
  } catch {
    return false;
  } finally {
    clearTimeout(timeout);
  }
}

function classifyBaseStatus({ hasNodeModules, processes, httpReady }) {
  if (!hasNodeModules) return "missing-dependencies";
  const projectProcesses = processes.filter((processInfo) => processInfo.isProject);
  if (projectProcesses.length > 0 && httpReady) return "running";
  if (projectProcesses.length > 0) return "starting";
  if (processes.length > 0) return "port-conflict";
  return "stopped";
}

async function getStatus() {
  let port;
  try {
    port = await loadPort();
  } catch (error) {
    return {
      status: "error",
      port: null,
      url: "",
      pids: [],
      externalPids: [],
      uptimeMs: childStartedAt ? Date.now() - childStartedAt : 0,
      hasNodeModules: false,
      lastError: error.message
    };
  }

  const hasNodeModules = await fileExists(path.join(rootDir, "node_modules"));
  let processes = [];
  let queryError = "";
  try {
    processes = await queryPortProcesses(port);
  } catch (error) {
    queryError = error.message;
  }

  const projectProcesses = processes.filter((processInfo) => processInfo.isProject);
  const externalProcesses = processes.filter((processInfo) => !processInfo.isProject);
  const httpReady = projectProcesses.length > 0 ? await checkHttp(port) : false;
  const baseStatus = queryError ? "error" : classifyBaseStatus({ hasNodeModules, processes, httpReady });

  if (currentAction === "starting" && baseStatus === "running") currentAction = "idle";
  if (currentAction === "stopping" && baseStatus === "stopped") currentAction = "idle";
  const status = currentAction === "starting" || currentAction === "stopping" ? currentAction : baseStatus;

  return {
    status,
    port,
    url: appUrl(port),
    pids: projectProcesses.map((processInfo) => processInfo.pid).filter(Boolean),
    externalPids: externalProcesses.map((processInfo) => processInfo.pid).filter(Boolean),
    uptimeMs: childStartedAt ? Date.now() - childStartedAt : 0,
    hasNodeModules,
    lastError: queryError || lastError
  };
}

async function ensureLogs() {
  await mkdir(logsDir, { recursive: true });
}

async function startServer() {
  const status = await getStatus();
  if (!status.hasNodeModules) {
    lastError = "node_modules is missing. Run npm install before starting the desktop controller.";
    return getStatus();
  }
  if (status.status === "running" || status.status === "starting") return status;
  if (status.status === "port-conflict") {
    lastError = `Port ${status.port} is already used by another process.`;
    return getStatus();
  }

  await ensureLogs();
  currentAction = "starting";
  lastError = "";

  const stdoutLog = createWriteStream(stdoutLogPath, { flags: "a" });
  const stderrLog = createWriteStream(stderrLogPath, { flags: "a" });
  childStartedAt = Date.now();
  childProcess = spawn("npm.cmd", ["run", "dev"], {
    cwd: rootDir,
    windowsHide: true,
    env: process.env
  });

  childProcess.stdout.pipe(stdoutLog);
  childProcess.stderr.pipe(stderrLog);
  childProcess.on("error", (error) => {
    lastError = error.message;
    currentAction = "idle";
  });
  childProcess.on("exit", (code, signal) => {
    if (code && code !== 0) lastError = `Server process exited with code ${code}.`;
    if (signal) lastError = `Server process exited by signal ${signal}.`;
    currentAction = "idle";
    childProcess = null;
    childStartedAt = null;
  });

  return getStatus();
}

async function stopServer() {
  const status = await getStatus();
  if (!status.port) return status;
  currentAction = "stopping";
  lastError = "";

  const processes = await queryPortProcesses(status.port);
  const projectPids = processes.filter((processInfo) => processInfo.isProject).map((processInfo) => processInfo.pid).filter(Boolean);
  if (projectPids.length > 0) {
    const ids = projectPids.join(",");
    const result = await runPowerShell(`Stop-Process -Id ${ids} -Force -ErrorAction Stop`, 5000);
    if (!result.ok) {
      lastError = (result.stderr || "Failed to stop server process.").trim();
      currentAction = "idle";
      return getStatus();
    }
  }

  if (childProcess) {
    childProcess.kill();
    childProcess = null;
  }
  childStartedAt = null;
  currentAction = "idle";
  return getStatus();
}

async function restartServer() {
  await stopServer();
  return startServer();
}

async function readLogTail(filePath, maxBytes = 16000) {
  try {
    const fileStat = await stat(filePath);
    const start = Math.max(0, fileStat.size - maxBytes);
    const buffer = await readFile(filePath);
    return buffer.subarray(start).toString("utf8");
  } catch (error) {
    if (error.code === "ENOENT") return "";
    return `Cannot read ${path.basename(filePath)}: ${error.message}`;
  }
}

async function readLogs() {
  const [stdout, stderr] = await Promise.all([readLogTail(stdoutLogPath), readLogTail(stderrLogPath)]);
  return { stdout, stderr };
}

async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1080,
    height: 720,
    minWidth: 880,
    minHeight: 600,
    title: "Bangumi Lens Controller",
    backgroundColor: "#f6f3ee",
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  const indexPath = path.join(__dirname, "index.html");
  try {
    await mainWindow.loadURL(pathToFileURL(indexPath).toString());
  } catch (error) {
    lastError = `File URL failed, using injected desktop UI: ${error.message}`;
    const [html, css, renderer] = await Promise.all([
      readFile(indexPath, "utf8"),
      readFile(path.join(__dirname, "styles.css"), "utf8"),
      readFile(path.join(__dirname, "renderer.mjs"), "utf8")
    ]);
    const inlineHtml = html
      .replace('<link rel="stylesheet" href="./styles.css" />', "")
      .replace('<script type="module" src="./renderer.mjs"></script>', "");
    await mainWindow.loadURL("about:blank");
    await mainWindow.webContents.insertCSS(css);
    await mainWindow.webContents.executeJavaScript(
      `document.open(); document.write(${JSON.stringify(inlineHtml)}); document.close();`
    );
    await mainWindow.webContents.executeJavaScript(`(async () => {\n${renderer}\n})().catch(console.error);`);
  }
}

ipcMain.handle("controller:getStatus", () => getStatus());
ipcMain.handle("controller:startServer", () => startServer());
ipcMain.handle("controller:stopServer", () => stopServer());
ipcMain.handle("controller:restartServer", () => restartServer());
ipcMain.handle("controller:readLogs", () => readLogs());
ipcMain.handle("controller:openApp", async () => {
  const port = await loadPort();
  await shell.openExternal(appUrl(port));
  return getStatus();
});
ipcMain.handle("controller:openLogsFolder", async () => {
  await ensureLogs();
  await shell.openPath(logsDir);
  return true;
});

app.whenReady().then(createWindow).catch((error) => {
  lastError = error.message;
  console.error(error);
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) void createWindow();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
