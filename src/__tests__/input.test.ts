import { describe, expect, it } from "vitest";
import { parseTeamInput } from "../input.js";

describe("parseTeamInput", () => {
  it("matches a standalone alias after trimming", () => {
    expect(parseTeamInput("  USE MY TEAM  ", ["Use my team"])).toEqual({
      kind: "standalone",
      alias: "Use my team",
    });
  });

  it("uses locale-independent case normalization", () => {
    expect(parseTeamInput("i team", ["I TEAM"])).toEqual({
      kind: "standalone",
      alias: "I TEAM",
    });
  });

  it("strips an anchored alias prefix and preserves the task", () => {
    expect(
      parseTeamInput("Use my local llm team: investigate the failing test", [
        "Use my local llm team",
      ]),
    ).toEqual({
      kind: "prefix",
      alias: "Use my local llm team",
      remainder: "investigate the failing test",
    });
  });

  it("accepts a newline prefix and normalizes only comparison", () => {
    expect(parseTeamInput(" use my team\n\n fix it ", ["Use My Team"])).toEqual(
      {
        kind: "prefix",
        alias: "Use My Team",
        remainder: "fix it",
      },
    );
  });

  it("treats colon-only prefixes as standalone activation", () => {
    expect(parseTeamInput("Use my team:", ["Use my team"])).toEqual({
      kind: "standalone",
      alias: "Use my team",
    });
    expect(parseTeamInput("Use my team:   ", ["Use my team"])).toEqual({
      kind: "standalone",
      alias: "Use my team",
    });
  });

  it("chooses the longest matching alias", () => {
    expect(
      parseTeamInput("Use my local team: task", [
        "Use my",
        "Use my local team",
      ]),
    ).toEqual({
      kind: "prefix",
      alias: "Use my local team",
      remainder: "task",
    });
  });

  it("rejects arbitrary mid-sentence matches", () => {
    expect(
      parseTeamInput("please use my team to investigate", ["use my team"]),
    ).toEqual({
      kind: "none",
    });
  });
});
