import { describe, expect, it, vi } from "vitest";
import {
  TEAM_STATE_ENTRY,
  appendTeamState,
  encodeTeamState,
  readActiveTeam,
} from "../session-state.js";
import type { TeamSnapshot } from "../types.js";

const snapshot: TeamSnapshot = {
  name: "local-llm",
  aliases: ["Use my local llm team"],
  model: "localllm-orm/Qwen/Qwen3.6-35B-A3B-FP8",
  agents: {
    worker: { model: "localllm-orm/Qwen/Qwen3.6-35B-A3B-FP8" },
    reviewer: { model: "openai/gpt-4o", thinking: "high" },
  },
};

const entry = (data: unknown) => ({
  type: "custom",
  customType: TEAM_STATE_ENTRY,
  data,
});

describe("readActiveTeam", () => {
  it("restores the latest active snapshot and ignores earlier selections", () => {
    const firstState = { active: true, snapshot };
    const secondState = {
      active: true,
      snapshot: { ...snapshot, name: "other-team" },
    };

    const entries = [entry(firstState), entry(secondState)];

    expect(readActiveTeam(entries)).toEqual(secondState.snapshot);
  });

  it("returns undefined for a normal reset", () => {
    expect(
      readActiveTeam([
        entry({ active: true, snapshot }),
        entry({ active: false }),
      ]),
    ).toBeUndefined();
  });

  it("filters credential-like fields from restored snapshots", () => {
    const runtimeSnapshot = {
      ...snapshot,
      apiKey: "secret-api-key",
      providerCredentials: { token: "secret-token" },
      settings: { temperature: 0.2 },
      parentState: "not-for-persistence",
    } as TeamSnapshot;

    const restored = readActiveTeam([
      entry({
        active: true,
        snapshot: runtimeSnapshot,
        apiKey: "secret-state-key",
      }),
    ]);

    expect(restored).toEqual(snapshot);
    expect(restored).not.toBe(runtimeSnapshot);
    expect(restored?.aliases).not.toBe(runtimeSnapshot.aliases);
    expect(restored?.agents).not.toBe(runtimeSnapshot.agents);
  });

  it("ignores malformed custom entries safely", () => {
    expect(
      readActiveTeam([
        entry({ active: true }),
        entry({ active: true, snapshot: { name: "missing-agents" } }),
        entry({ active: true, snapshot: { ...snapshot, agents: undefined } }),
        entry({
          active: true,
          snapshot: {
            ...snapshot,
            agents: { worker: { model: "openai/gpt-4o", thinking: 3 } },
          },
        }),
        entry({ active: "yes", snapshot }),
        entry({ active: true, snapshot }),
      ]),
    ).toEqual(snapshot);

    expect(() => readActiveTeam([entry({ active: true })])).not.toThrow();
    expect(readActiveTeam([{ type: "message", data: {} }])).toBeUndefined();
  });

  it("decodes agent thinking levels and drops unknown thinking values", () => {
    const withThinking = {
      ...snapshot,
      thinking: "medium" as const,
    };
    expect(
      readActiveTeam([entry({ active: true, snapshot: withThinking })]),
    ).toEqual(withThinking);

    const invalidTeamThinking = { ...withThinking, thinking: "ultra" };
    expect(
      readActiveTeam([entry({ active: true, snapshot: invalidTeamThinking })]),
    ).toBeUndefined();
  });
});

describe("encodeTeamState and appendTeamState", () => {
  it("encodes only approved snapshot fields and reset state", () => {
    const runtimeSnapshot = {
      ...snapshot,
      apiKey: "secret-api-key",
      providerCredentials: { token: "secret-token" },
      settings: { temperature: 0.2 },
      parentState: "not-for-persistence",
    } as TeamSnapshot;

    expect(encodeTeamState(runtimeSnapshot)).toEqual({
      active: true,
      snapshot,
    });
    expect(encodeTeamState(undefined)).toEqual({ active: false });
  });

  it("copies the snapshot before appending only the state entry", () => {
    const pi = { appendEntry: vi.fn() };
    appendTeamState(pi, snapshot);

    expect(pi.appendEntry).toHaveBeenCalledOnce();
    expect(pi.appendEntry).toHaveBeenCalledWith(TEAM_STATE_ENTRY, {
      active: true,
      snapshot,
    });
    expect(pi.appendEntry.mock.calls[0]?.[1].snapshot).not.toBe(snapshot);
  });
});
