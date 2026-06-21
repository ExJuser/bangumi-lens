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
const STANCE_DISTRIBUTION_INSTRUCTION =
  "stanceDistribution 必须按固定类别输出评论情绪/立场分布：好评、失望、争议、中立、玩梗、制作讨论、原作对比。每类 percentage 为 0-100 的估算比例，summary 简述该类评论的主要依据，sourceCommentIds 填写支持该判断的评论 id；评论样本不足时仍可输出低比例或 0，并在 summary 说明样本不足。";

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

export function loadReportPrompt(responseJsonSchema: string, presetId?: string): ReportPromptConfig {
  const rawConfig = getRawConfig();
  const preset = resolveReportPromptPreset(presetId);
  return {
    system: rawConfig.system.replaceAll(RESPONSE_SCHEMA_PLACEHOLDER, responseJsonSchema),
    task: `${rawConfig.task}\n\n${STANCE_DISTRIBUTION_INSTRUCTION}\n\n报告风格预设：${preset.name}\n${preset.instruction}`,
    preset
  };
}
