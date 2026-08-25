export interface TeamDefinition {
  aliases: string[];
  model: string;
  agents?: Record<string, string>;
}

export interface TeamsFile {
  teams: Record<string, TeamDefinition>;
}

export interface TeamSnapshot {
  name: string;
  aliases: readonly string[];
  model: string;
  agents: Readonly<Record<string, string>>;
}

export interface ValidationIssue {
  severity: "error" | "warning";
  code: string;
  message: string;
}

export interface LoadedTeamsConfig {
  teams: Readonly<Record<string, TeamSnapshot>>;
  issues: readonly ValidationIssue[];
}

export interface RegisteredModel {
  provider: string;
  id: string;
  reasoning?: boolean;
}

export interface ThinkingAdjustment {
  from: string | false | undefined;
  to: "off";
  reason: string;
}

export interface ValidationResult {
  ok: boolean;
  issues: readonly ValidationIssue[];
  adjustments: readonly ThinkingAdjustment[];
}

export interface TeamStateEntry {
  active: boolean;
  snapshot?: TeamSnapshot;
}

export interface SessionEntry {
  type?: string;
  customType?: string;
  data?: unknown;
}

export interface TeamInputMatch {
  kind: "none" | "standalone" | "prefix";
  alias?: string;
  remainder?: string;
}

export interface TeamExtensionOptions {
  agentDir?: string;
  probeLocalProvider?: (provider: string, modelId: string) => Promise<void>;
}
