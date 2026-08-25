import { describe, expect, it } from "vitest";
import { buildDelegationGuidance, buildTeamSystemNote } from "../prompt.js";
import type {
  TeamSnapshot,
  ThinkingAdjustment,
  ValidationIssue,
} from "../types.js";

const snapshot: TeamSnapshot = {
  name: "local-llm",
  aliases: ["Use my local llm team"],
  model: "localllm-orm/Qwen/Qwen3.6-35B-A3B-FP8",
  agents: { worker: "anthropic/claude-sonnet-4" },
};

const adjustment: ThinkingAdjustment = {
  from: "high",
  to: "off",
  reason: "Model does not support reasoning.",
};

const warning: ValidationIssue = {
  severity: "warning",
  code: "external-runner",
  message: "external-cli/worker is unchanged.",
};

describe("buildTeamSystemNote", () => {
  it("does not generate guidance for an inactive team", () => {
    expect(buildTeamSystemNote(undefined)).toBe("");
  });

  it("includes deterministic active-team routing guidance", () => {
    const note = buildTeamSystemNote(snapshot, [adjustment], [warning]);
    expect(note).toContain("active team: local-llm");
    expect(note).toContain(
      "default model: localllm-orm/Qwen/Qwen3.6-35B-A3B-FP8",
    );
    expect(note).toContain("worker: anthropic/claude-sonnet-4");
    expect(note).toContain('subagent({ action: "list" })');
    expect(note).toContain("model only");
    expect(note).toContain("preserve role settings");
    expect(note).toContain("thinking to off");
    expect(note).toContain("external-cli/worker is unchanged");
    expect(note).toContain("direct or nested launches can bypass");
    expect(note).not.toContain("enforce");
  });
});

describe("buildDelegationGuidance", () => {
  it("describes the same supported delegation contract", () => {
    const guidance = buildDelegationGuidance();
    expect(guidance).toContain('subagent({ action: "list" })');
    expect(guidance).toContain("exact default model");
    expect(guidance).toContain("role exception");
    expect(guidance).toContain("preserve role settings");
    expect(guidance).toContain("thinking");
    expect(guidance).toContain("external-cli and external-job");
    expect(guidance).toContain("direct or nested launches can bypass");
  });
});
