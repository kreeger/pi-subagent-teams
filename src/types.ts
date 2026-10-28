export const THINKING_LEVELS = [
  "off",
  "minimal",
  "low",
  "medium",
  "high",
  "xhigh",
  "max",
] as const;

export type ThinkingLevel = (typeof THINKING_LEVELS)[number];

export function isThinkingLevel(value: unknown): value is ThinkingLevel {
  return (
    typeof value === "string" &&
    (THINKING_LEVELS as readonly string[]).includes(value)
  );
}

export interface AgentTarget {
  model: string;
  thinking?: ThinkingLevel;
}

export interface TeamDefinition {
  aliases: string[];
  model: string;
  thinking?: string;
  agents?: Record<string, string | AgentTarget>;
}

export interface TeamsFile {
  teams: Record<string, TeamDefinition>;
}

export interface TeamSnapshot {
  name: string;
  aliases: readonly string[];
  model: string;
  thinking?: ThinkingLevel;
  agents: Readonly<Record<string, AgentTarget>>;
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
