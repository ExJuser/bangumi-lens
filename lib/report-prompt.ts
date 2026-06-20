import promptConfig from "@/config/report-prompt.json";

type ReportPromptConfig = {
  system: string;
  task: string;
};

const RESPONSE_SCHEMA_PLACEHOLDER = "{{responseJsonSchema}}";

export function loadReportPrompt(responseJsonSchema: string): ReportPromptConfig {
  return {
    system: promptConfig.system.replaceAll(RESPONSE_SCHEMA_PLACEHOLDER, responseJsonSchema),
    task: promptConfig.task
  };
}
