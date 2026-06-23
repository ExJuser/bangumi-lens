import promptConfig from "@/config/report-prompt.json";

type ReportPromptConfig = {
  system: string;
  task: string;
  preset: ReportPromptPreset;
};

export type ReportPromptPreset = {
  id: string;
  name: string;
  instruction: string;
};

type RawReportPromptConfig = {
  system: string;
  task: string;
  presets?: ReportPromptPreset[];
};

const RESPONSE_SCHEMA_PLACEHOLDER = "{{responseJsonSchema}}";
const DEFAULT_PRESET_ID = "default";
const CUSTOM_PROMPT_MAX_LENGTH = 4000;
const STANCE_DISTRIBUTION_INSTRUCTION =
  [
    "stanceDistribution 必须按固定类别输出评论情绪/立场分布：好评、失望、争议、中立、玩梗、制作讨论、原作对比。",
    "分类边界：好评=明确认可、期待、觉得有趣/不错/可爱/有用；失望=明确负向评价、弃番、无聊、糟糕；中立=信息陈述、观望、轻微保留但总体未否定；玩梗=主要在开玩笑或复读梗；制作讨论=主要讨论 OP/ED、演出、作画、声优、分镜等制作面；原作对比=主要比较漫画/小说/游戏等原作。",
    "争议只用于同一问题上出现清晰对立或强烈分歧的评论，或单条评论同时包含明确正反冲突；不能因为出现“一般般”“中等”“普通”“不过”“但是”这类保留语就判为争议。若评论总体是正向期待或认可，即使夹带小缺点，也应归入好评或制作讨论。",
    "每类 percentage 为 0-100 的估算比例，summary 简述该类评论的主要依据，sourceCommentIds 只能填写能直接支撑该类别的评论 id；不确定时不要把正向、玩梗或中立评论作为争议依据。评论样本不足时仍可输出低比例或 0，并在 summary 说明样本不足。"
  ].join("");

function getRawConfig() {
  const config = promptConfig as RawReportPromptConfig | { default?: RawReportPromptConfig };
  return ("default" in config && config.default ? config.default : config) as RawReportPromptConfig;
}

export function getReportPromptPresets() {
  const presets = getRawConfig().presets || [];
  return presets.length > 0
    ? presets
    : [{ id: DEFAULT_PRESET_ID, name: "标准复盘", instruction: "保持默认结构、长度和克制分析口吻。" }];
}

export function resolveReportPromptPreset(presetId?: string): ReportPromptPreset {
  const presets = getReportPromptPresets();
  return (
    presets.find((preset: ReportPromptPreset) => preset.id === presetId) ||
    presets.find((preset: ReportPromptPreset) => preset.id === DEFAULT_PRESET_ID) ||
    presets[0]
  );
}

export function normalizeCustomReportPrompt(customPrompt?: string) {
  return typeof customPrompt === "string" ? customPrompt.trim().slice(0, CUSTOM_PROMPT_MAX_LENGTH) : "";
}

export function loadReportPrompt(responseJsonSchema: string, presetId?: string, customPrompt?: string): ReportPromptConfig {
  const rawConfig = getRawConfig();
  const preset = resolveReportPromptPreset(presetId);
  const normalizedCustomPrompt = normalizeCustomReportPrompt(customPrompt);
  const customPromptInstruction = normalizedCustomPrompt
    ? `\n\n用户自定义提示词：\n${normalizedCustomPrompt}`
    : "";

  return {
    system: rawConfig.system.replaceAll(RESPONSE_SCHEMA_PLACEHOLDER, responseJsonSchema),
    task: `${rawConfig.task}\n\n${STANCE_DISTRIBUTION_INSTRUCTION}\n\n报告风格预设：${preset.name}\n${preset.instruction}${customPromptInstruction}`,
    preset
  };
}
