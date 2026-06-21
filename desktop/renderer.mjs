const controller = window.bangumiLensController;

const statusLabels = {
  loading: ["读取状态中", "正在检查本地端口"],
  running: ["服务运行中", "Bangumi Lens 已可访问"],
  stopped: ["服务已停止", "点击启动服务开始使用"],
  starting: ["正在启动", "Next.js 开发服务正在准备"],
  stopping: ["正在停止", "正在关闭本项目监听进程"],
  "port-conflict": ["端口被占用", "监听端口属于其他进程"],
  "missing-dependencies": ["缺少依赖", "请先运行 npm install"],
  error: ["状态异常", "检查端口或配置时失败"]
};

const elements = {
  statusCard: document.querySelector(".status-card"),
  statusLabel: document.querySelector("#statusLabel"),
  statusDetail: document.querySelector("#statusDetail"),
  portValue: document.querySelector("#portValue"),
  pidValue: document.querySelector("#pidValue"),
  uptimeValue: document.querySelector("#uptimeValue"),
  urlButton: document.querySelector("#urlButton"),
  startButton: document.querySelector("#startButton"),
  restartButton: document.querySelector("#restartButton"),
  stopButton: document.querySelector("#stopButton"),
  openButton: document.querySelector("#openButton"),
  refreshButton: document.querySelector("#refreshButton"),
  dependencyValue: document.querySelector("#dependencyValue"),
  externalPidValue: document.querySelector("#externalPidValue"),
  errorValue: document.querySelector("#errorValue"),
  reloadLogsButton: document.querySelector("#reloadLogsButton"),
  openLogsButton: document.querySelector("#openLogsButton"),
  stdoutLog: document.querySelector("#stdoutLog"),
  stderrLog: document.querySelector("#stderrLog")
};

let latestStatus = null;

function formatUptime(ms) {
  if (!ms) return "-";
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}

function setBusy(isBusy) {
  for (const button of document.querySelectorAll("button")) {
    button.disabled = isBusy;
  }
}

function renderStatus(status) {
  latestStatus = status;
  const [label, fallbackDetail] = statusLabels[status.status] || statusLabels.error;
  elements.statusCard.dataset.state = status.status;
  elements.statusLabel.textContent = label;
  elements.statusDetail.textContent = status.lastError && status.status === "error" ? status.lastError : fallbackDetail;
  elements.portValue.textContent = status.port || "-";
  elements.pidValue.textContent = status.pids?.length ? status.pids.join(", ") : "-";
  elements.uptimeValue.textContent = formatUptime(status.uptimeMs);
  elements.urlButton.textContent = status.url || "-";
  elements.urlButton.disabled = !status.url;
  elements.dependencyValue.textContent = status.hasNodeModules ? "已安装" : "缺少 node_modules";
  elements.externalPidValue.textContent = status.externalPids?.length ? status.externalPids.join(", ") : "-";
  elements.errorValue.textContent = status.lastError || "-";

  const isTransitioning = status.status === "starting" || status.status === "stopping";
  elements.startButton.disabled = isTransitioning || status.status === "running" || status.status === "port-conflict";
  elements.restartButton.disabled = isTransitioning || status.status === "missing-dependencies" || status.status === "port-conflict";
  elements.stopButton.disabled = isTransitioning || (status.status !== "running" && status.status !== "starting");
  elements.openButton.disabled = status.status !== "running";
}

async function refreshStatus() {
  const status = await controller.getStatus();
  renderStatus(status);
}

async function refreshLogs() {
  const logs = await controller.readLogs();
  elements.stdoutLog.textContent = logs.stdout || "暂无日志";
  elements.stderrLog.textContent = logs.stderr || "暂无错误日志";
  elements.stdoutLog.scrollTop = elements.stdoutLog.scrollHeight;
  elements.stderrLog.scrollTop = elements.stderrLog.scrollHeight;
}

async function runAction(action) {
  setBusy(true);
  try {
    const status = await action();
    renderStatus(status);
    await refreshLogs();
  } finally {
    setBusy(false);
    await refreshStatus();
  }
}

elements.startButton.addEventListener("click", () => runAction(() => controller.startServer()));
elements.stopButton.addEventListener("click", () => runAction(() => controller.stopServer()));
elements.restartButton.addEventListener("click", () => runAction(() => controller.restartServer()));
elements.openButton.addEventListener("click", () => runAction(() => controller.openApp()));
elements.urlButton.addEventListener("click", () => {
  if (latestStatus?.url) void runAction(() => controller.openApp());
});
elements.refreshButton.addEventListener("click", () => {
  void refreshStatus();
});
elements.reloadLogsButton.addEventListener("click", () => {
  void refreshLogs();
});
elements.openLogsButton.addEventListener("click", () => {
  void controller.openLogsFolder();
});

await refreshStatus();
await refreshLogs();
setInterval(refreshStatus, 2500);
setInterval(refreshLogs, 6000);
