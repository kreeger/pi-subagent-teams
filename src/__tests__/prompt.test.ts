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
  agents: {
    worker: { model: "anthropic/claude-sonnet-4" },
    reviewer: { model: "openai/gpt-4o", thinking: "high" },
  },
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
    expect(note).toContain("reviewer: openai/gpt-4o:high");
    expect(note).toContain('subagent({ action: "list" })');
    expect(note).toContain(
      "This guidance changes model and thinking level only and preserves role settings",
    );
    expect(note).toContain("thinking to off");
    expect(note).toContain("external-cli/worker is unchanged");
    expect(note).toContain("direct or nested launches can bypass");
    expect(note).not.toContain("enforce");
  });

  it("emits the team default thinking suffix", () => {
    const note = buildTeamSystemNote({ ...snapshot, thinking: "medium" });
    expect(note).toContain(
      "default model: localllm-orm/Qwen/Qwen3.6-35B-A3B-FP8:medium",
    );
    expect(note).toContain("worker: anthropic/claude-sonnet-4:medium");
    expect(note).toContain("reviewer: openai/gpt-4o:high");
  });
});

describe("buildDelegationGuidance", () => {
  it("describes the same supported delegation contract", () => {
    const guidance = buildDelegationGuidance();
    expect(guidance).toContain('subagent({ action: "list" })');
    expect(guidance).toContain("exact default model");
    expect(guidance).toContain("role exception");
    expect(guidance).toContain(
      "This guidance changes model and thinking level only and preserves role settings",
    );
    expect(guidance).toContain("thinking");
    expect(guidance).toContain("external-cli and external-job");
    expect(guidance).toContain("direct or nested launches can bypass");
  });
});
