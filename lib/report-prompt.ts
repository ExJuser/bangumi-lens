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
    task: `${rawConfig.task}\n\n报告风格预设：${preset.name}\n${preset.instruction}`,
    preset
  };
}
