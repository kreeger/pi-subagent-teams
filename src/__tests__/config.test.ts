import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  loadTeamsConfig,
  matchConfiguredAlias,
  normalizeAlias,
  parseTeamsConfig,
  resolveConfiguredTeam,
} from "../config.js";

describe("parseTeamsConfig", () => {
  it("loads the slash-containing local model ID unchanged", () => {
    const result = parseTeamsConfig({
      teams: {
        "local-llm": {
          aliases: ["Use my local llm team"],
          model: "localllm-orm/Qwen/Qwen3.6-35B-A3B-FP8",
        },
      },
    });

    expect(result.teams["local-llm"].model).toBe(
      "localllm-orm/Qwen/Qwen3.6-35B-A3B-FP8",
    );
    expect(result.teams["local-llm"]).toEqual({
      name: "local-llm",
      aliases: ["Use my local llm team"],
      model: "localllm-orm/Qwen/Qwen3.6-35B-A3B-FP8",
      agents: {},
    });
  });

  it("returns no configured teams for a missing file", () => {
    expect(loadTeamsConfig("/path/that/does/not/exist").teams).toEqual({});
  });

  it("rejects malformed top-level data without throwing from the loader", () => {
    const agentDir = mkdtempSync(join(tmpdir(), "teams-fixture-"));
    writeFileSync(join(agentDir, "teams.json"), "{ invalid json");
    expect(loadTeamsConfig(agentDir).issues).toEqual(
      expect.arrayContaining([expect.objectContaining({ severity: "error" })]),
    );
  });

  it("rejects invalid names, empty values, duplicate aliases, and normal", () => {
    const result = parseTeamsConfig({
      teams: {
        normal: { aliases: ["normal"], model: "provider/model" },
        "not valid": { aliases: ["ok"], model: "provider/model" },
        empty: { aliases: ["  "], model: " " },
        first: { aliases: ["Same alias"], model: "provider/model" },
        second: { aliases: [" same   alias "], model: "provider/model" },
      },
    });
    expect(result.teams).toEqual({});
    expect(result.issues.map((entry) => entry.code)).toEqual(
      expect.arrayContaining([
        "reserved-team-name",
        "invalid-team-name",
        "invalid-alias",
        "invalid-model",
        "duplicate-alias",
      ]),
    );
  });

  it("requires role keys and role targets to be valid", () => {
    const result = parseTeamsConfig({
      teams: {
        team: {
          aliases: ["team"],
          model: "provider/model",
          agents: { "bad role": "provider/model", worker: " " },
        },
      },
    });
    expect(result.teams).toEqual({});
    expect(result.issues.map((entry) => entry.code)).toEqual(
      expect.arrayContaining(["invalid-role-key", "invalid-role-model"]),
    );
  });

  it("parses shorthand and object agent targets with thinking", () => {
    const result = parseTeamsConfig({
      teams: {
        team: {
          aliases: ["team"],
          model: "provider/model",
          thinking: "low",
          agents: {
            planner: "anthropic/claude-sonnet-4:high",
            worker: { model: "provider/model", thinking: "off" },
            reviewer: "openai/gpt-4o",
          },
        },
      },
    });
    expect(result.issues).toEqual([]);
    expect(result.teams.team?.thinking).toBe("low");
    expect(result.teams.team?.agents).toEqual({
      planner: { model: "anthropic/claude-sonnet-4", thinking: "high" },
      worker: { model: "provider/model", thinking: "off" },
      reviewer: { model: "openai/gpt-4o" },
    });
  });

  it("keeps a non-thinking suffix as part of the model target", () => {
    const result = parseTeamsConfig({
      teams: {
        team: {
          aliases: ["team"],
          model: "localllm-orm/llama3:8b",
          agents: { worker: "localllm-orm/qwen2.5-coder:32b" },
        },
      },
    });
    expect(result.issues).toEqual([]);
    expect(result.teams.team?.model).toBe("localllm-orm/llama3:8b");
    expect(result.teams.team?.agents.worker).toEqual({
      model: "localllm-orm/qwen2.5-coder:32b",
    });
  });

  it("rejects invalid thinking levels on teams and agent objects", () => {
    const result = parseTeamsConfig({
      teams: {
        "bad-team": {
          aliases: ["bt"],
          model: "provider/model",
          thinking: "ultra",
        },
        "bad-agent": {
          aliases: ["ba"],
          model: "provider/model",
          agents: { worker: { model: "provider/model", thinking: 3 } },
        },
        "missing-agent-model": {
          aliases: ["mam"],
          model: "provider/model",
          agents: { worker: { thinking: "high" } },
        },
      },
    });
    expect(result.teams).toEqual({});
    expect(result.issues.map((entry) => entry.code)).toEqual(
      expect.arrayContaining([
        "invalid-thinking",
        "invalid-thinking",
        "invalid-role-model",
      ]),
    );
  });

  it("normalizes and matches exact names and aliases only", () => {
    const config = parseTeamsConfig({
      teams: {
        team: { aliases: ["Use   This Team"], model: "provider/model" },
      },
    });
    expect(normalizeAlias("  USE  this team ")).toBe("use this team");
    expect(resolveConfiguredTeam(config, " TEAM ")?.name).toBe("team");
    expect(matchConfiguredAlias(config, "use this team")?.name).toBe("team");
    expect(matchConfiguredAlias(config, "use this team: task")).toBeUndefined();
  });

  it("does not resolve prototype keys as configured teams", () => {
    const config = parseTeamsConfig({
      teams: { team: { aliases: ["team"], model: "provider/model" } },
    });
    for (const input of [
      "constructor",
      "toString",
      "__proto__",
      "hasOwnProperty",
    ]) {
      expect(resolveConfiguredTeam(config, input)).toBeUndefined();
    }
  });

  it("does not let an invalid team poison a valid sibling alias", () => {
    const config = parseTeamsConfig({
      teams: {
        broken: { aliases: ["shared alias"], model: " " },
        good: { aliases: ["shared alias"], model: "provider/model" },
      },
    });
    expect(config.teams.broken).toBeUndefined();
    expect(config.teams.good?.model).toBe("provider/model");
  });

  it("copies snapshots from the input definition", () => {
    const aliases = ["team"];
    const raw = { teams: { team: { aliases, model: "provider/model" } } };
    const config = parseTeamsConfig(raw);
    aliases[0] = "changed";
    expect(config.teams.team.aliases).toEqual(["team"]);
  });
});
