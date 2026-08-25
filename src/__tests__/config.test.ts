import { describe, expect, it } from "vitest";
import { parseTeamsConfig } from "../config.js";

describe("parseTeamsConfig", () => {
  it("normalizes a valid local-llm team", () => {
    const result = parseTeamsConfig({
      teams: {
        "local-llm": {
          aliases: ["Use my local llm team"],
          model: "localllm-orm/Qwen/Qwen3.6-35B-A3B-FP8",
        },
      },
    });

    expect(result.teams["local-llm"]).toEqual({
      name: "local-llm",
      aliases: ["Use my local llm team"],
      model: "localllm-orm/Qwen/Qwen3.6-35B-A3B-FP8",
      agents: {},
    });
  });
});
