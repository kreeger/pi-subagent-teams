import { describe, expect, it } from "vitest";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readPersistedTeam, writePersistedTeam } from "../persisted-state.js";

function dir(): string {
  return mkdtempSync(join(tmpdir(), "teams-state-"));
}

describe("readPersistedTeam", () => {
  it("returns undefined for a missing file", () => {
    expect(readPersistedTeam(dir())).toBeUndefined();
  });

  it("round-trips the team name written by writePersistedTeam", () => {
    const agentDir = dir();
    writePersistedTeam(agentDir, "deepseek");
    expect(readPersistedTeam(agentDir)).toBe("deepseek");
    writePersistedTeam(agentDir, undefined);
    expect(readPersistedTeam(agentDir)).toBeUndefined();
  });

  it("returns undefined for malformed or non-string state", () => {
    const agentDir = dir();
    writeFileSync(join(agentDir, "teams-state.json"), "{ broken");
    expect(readPersistedTeam(agentDir)).toBeUndefined();
    writeFileSync(join(agentDir, "teams-state.json"), '{"team": 3}');
    expect(readPersistedTeam(agentDir)).toBeUndefined();
    writeFileSync(join(agentDir, "teams-state.json"), '{"team": "  "}');
    expect(readPersistedTeam(agentDir)).toBeUndefined();
    writeFileSync(join(agentDir, "teams-state.json"), '["deepseek"]');
    expect(readPersistedTeam(agentDir)).toBeUndefined();
  });
});
