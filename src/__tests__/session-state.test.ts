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
  agents: { worker: "localllm-orm/Qwen/Qwen3.6-35B-A3B-FP8" },
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

  it("copies a restored snapshot and does not expose credentials", () => {
    const restored = readActiveTeam([entry({ active: true, snapshot })]);

    expect(restored).toEqual(snapshot);
    expect(restored).not.toBe(snapshot);
    expect(restored?.aliases).not.toBe(snapshot.aliases);
    expect(restored?.agents).not.toBe(snapshot.agents);
    expect(JSON.stringify(restored)).not.toContain("api");
    expect(JSON.stringify(restored)).not.toContain("credential");
  });

  it("ignores malformed custom entries safely", () => {
    expect(
      readActiveTeam([
        entry({ active: true }),
        entry({ active: true, snapshot: { name: "missing-agents" } }),
        entry({ active: true, snapshot: { ...snapshot, agents: undefined } }),
        entry({ active: "yes", snapshot }),
        entry({ active: true, snapshot }),
      ]),
    ).toEqual(snapshot);

    expect(() => readActiveTeam([entry({ active: true })])).not.toThrow();
    expect(readActiveTeam([{ type: "message", data: {} }])).toBeUndefined();
  });
});

describe("encodeTeamState and appendTeamState", () => {
  it("encodes active snapshots and reset state without credentials", () => {
    expect(encodeTeamState(snapshot)).toEqual({ active: true, snapshot });
    expect(encodeTeamState(undefined)).toEqual({ active: false });
    expect(JSON.stringify(encodeTeamState(snapshot))).not.toContain("key");
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
