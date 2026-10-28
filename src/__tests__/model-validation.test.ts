import { describe, expect, it, vi } from "vitest";
import {
  normalizeUnsupportedThinking,
  resolveTeamModel,
  validateTeamModels,
  type ModelValidationContext,
} from "../model-validation.js";
import type { TeamSnapshot } from "../types.js";

const snapshot: TeamSnapshot = {
  name: "local-llm",
  aliases: ["local"],
  model: "localllm-orm/Qwen/Qwen3.6-35B-A3B-FP8",
  agents: {
    worker: { model: "localllm-orm/Qwen/Qwen3.6-35B-A3B-FP8" },
    reviewer: { model: "openai/gpt-4o", thinking: "high" },
  },
};

function context(
  models: ModelValidationContext["models"],
): ModelValidationContext {
  return { models, probeLocalProvider: vi.fn().mockResolvedValue(undefined) };
}

describe("validateTeamModels", () => {
  it("requires the exact fully qualified local model ID", async () => {
    const result = await validateTeamModels(
      {
        ...snapshot,
        agents: { worker: { model: "localllm-orm/Qwen/Qwen3.6-35B-A3B-FP8" } },
      },
      {
        models: [
          {
            provider: "localllm-orm",
            id: "Qwen/Qwen3.6-35B-A3B-FP8",
            reasoning: false,
          },
        ],
        probeLocalProvider: vi.fn().mockResolvedValue(undefined),
      },
    );

    expect(result.ok).toBe(true);
  });

  it("rejects a missing provider/model", async () => {
    const result = await validateTeamModels(snapshot, context([]));

    expect(result.ok).toBe(false);
    expect(result.issues[0]).toMatchObject({ code: "model-not-found" });
    expect(result.issues[0]?.message).toContain(snapshot.model);
  });

  it("reports local probe failures without exposing secrets", async () => {
    const probeLocalProvider = vi
      .fn()
      .mockRejectedValue(new Error("API key sk-secret must not be shown"));
    const result = await validateTeamModels(snapshot, {
      models: [{ provider: "localllm-orm", id: "Qwen/Qwen3.6-35B-A3B-FP8" }],
      probeLocalProvider,
    });

    expect(result.ok).toBe(false);
    expect(result.issues[0]).toMatchObject({ code: "local-probe-failed" });
    expect(result.issues[0]?.message).not.toContain("sk-secret");
    expect(result.issues[0]?.message).not.toContain("API key");
  });

  it("does not probe non-local providers and deduplicates targets", async () => {
    const probeLocalProvider = vi.fn().mockResolvedValue(undefined);
    const result = await validateTeamModels(
      {
        ...snapshot,
        model: "openai/gpt-4o",
        agents: {
          worker: { model: "openai/gpt-4o" },
          reviewer: { model: "openai/gpt-4o", thinking: "high" },
        },
      },
      {
        models: [{ provider: "openai", id: "gpt-4o" }],
        probeLocalProvider,
      },
    );

    expect(result.ok).toBe(true);
    expect(probeLocalProvider).not.toHaveBeenCalled();
  });

  it("normalizes configured thinking for models without reasoning", async () => {
    const result = await validateTeamModels(
      {
        ...snapshot,
        agents: { worker: { model: "openai/gpt-4o", thinking: "high" } },
      },
      context([
        { provider: "openai", id: "gpt-4o", reasoning: false },
        { provider: "localllm-orm", id: "Qwen/Qwen3.6-35B-A3B-FP8" },
      ]),
    );

    expect(result.ok).toBe(true);
    expect(result.adjustments).toEqual([
      {
        from: "high",
        to: "off",
        reason: "Model 'openai/gpt-4o' does not support reasoning.",
      },
    ]);
  });

  it("applies the team default thinking to agents without their own", async () => {
    const result = await validateTeamModels(
      {
        ...snapshot,
        thinking: "high",
        agents: {
          worker: { model: "openai/gpt-4o" },
          reviewer: { model: "openai/gpt-4o", thinking: "low" },
        },
      },
      context([
        { provider: "openai", id: "gpt-4o", reasoning: false },
        { provider: "localllm-orm", id: "Qwen/Qwen3.6-35B-A3B-FP8" },
      ]),
    );

    expect(result.ok).toBe(true);
    expect(result.adjustments).toEqual([
      {
        from: "high",
        to: "off",
        reason: "Model 'openai/gpt-4o' does not support reasoning.",
      },
      {
        from: "low",
        to: "off",
        reason: "Model 'openai/gpt-4o' does not support reasoning.",
      },
    ]);
  });

  it("keeps configured thinking for reasoning-capable models", async () => {
    const result = await validateTeamModels(
      {
        ...snapshot,
        agents: { worker: { model: "openai/gpt-4o", thinking: "high" } },
      },
      context([
        { provider: "openai", id: "gpt-4o", reasoning: true },
        { provider: "localllm-orm", id: "Qwen/Qwen3.6-35B-A3B-FP8" },
      ]),
    );

    expect(result.adjustments).toEqual([]);
  });
});

describe("resolveTeamModel", () => {
  it("uses a role exception and falls back to the default", () => {
    expect(resolveTeamModel(snapshot, "worker")).toEqual(
      snapshot.agents.worker,
    );
    expect(resolveTeamModel(snapshot, "reviewer")).toEqual(
      snapshot.agents.reviewer,
    );
    expect(resolveTeamModel(snapshot, "planner")).toEqual({
      model: snapshot.model,
    });
    expect(resolveTeamModel(snapshot, "constructor")).toEqual({
      model: snapshot.model,
    });
    expect(resolveTeamModel(snapshot, "toString")).toEqual({
      model: snapshot.model,
    });
  });
});

describe("normalizeUnsupportedThinking", () => {
  it("turns configured thinking off for models without reasoning", () => {
    expect(
      normalizeUnsupportedThinking(
        { provider: "openai", id: "gpt", reasoning: false },
        "high",
      ),
    ).toEqual({ from: "high", to: "off", reason: expect.any(String) });
    expect(
      normalizeUnsupportedThinking(
        { provider: "openai", id: "gpt", reasoning: false },
        "off",
      ),
    ).toBeUndefined();
  });
});
