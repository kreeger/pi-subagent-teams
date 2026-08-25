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
  agents: { worker: "localllm-orm/Qwen/Qwen3.6-35B-A3B-FP8" },
};

function context(
  models: ModelValidationContext["models"],
): ModelValidationContext {
  return { models, probeLocalProvider: vi.fn().mockResolvedValue(undefined) };
}

describe("validateTeamModels", () => {
  it("requires the exact fully qualified local model ID", async () => {
    const result = await validateTeamModels(snapshot, {
      models: [
        {
          provider: "localllm-orm",
          id: "Qwen/Qwen3.6-35B-A3B-FP8",
          reasoning: false,
        },
      ],
      probeLocalProvider: vi.fn().mockResolvedValue(undefined),
    });

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
        agents: { worker: "openai/gpt-4o" },
      },
      {
        models: [{ provider: "openai", id: "gpt-4o" }],
        probeLocalProvider,
      },
    );

    expect(result.ok).toBe(true);
    expect(probeLocalProvider).not.toHaveBeenCalled();
  });
});

describe("resolveTeamModel", () => {
  it("uses a role exception and falls back to the default", () => {
    expect(resolveTeamModel(snapshot, "worker")).toBe(snapshot.agents.worker);
    expect(resolveTeamModel(snapshot, "reviewer")).toBe(snapshot.model);
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
