import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import type { SessionEntry, TeamSnapshot, TeamStateEntry } from "./types.js";

export const TEAM_STATE_ENTRY = "subagent-team-state";

type TeamStatePi = Pick<ExtensionAPI, "appendEntry">;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function decodeSnapshot(value: unknown): TeamSnapshot | undefined {
  if (!isRecord(value)) return undefined;
  if (
    typeof value.name !== "string" ||
    !Array.isArray(value.aliases) ||
    !value.aliases.every((alias) => typeof alias === "string") ||
    typeof value.model !== "string" ||
    !isRecord(value.agents) ||
    !Object.values(value.agents).every((model) => typeof model === "string")
  ) {
    return undefined;
  }

  return {
    name: value.name,
    aliases: [...value.aliases],
    model: value.model,
    agents: { ...value.agents } as Record<string, string>,
  };
}

function decodeState(value: unknown): TeamStateEntry | undefined {
  if (!isRecord(value) || typeof value.active !== "boolean") return undefined;
  if (!value.active) return { active: false };
  const snapshot = decodeSnapshot(value.snapshot);
  return snapshot ? { active: true, snapshot } : undefined;
}

export function readActiveTeam(
  entries: readonly SessionEntry[],
): TeamSnapshot | undefined {
  let active: TeamSnapshot | undefined;
  for (const entry of entries) {
    if (entry.type !== "custom" || entry.customType !== TEAM_STATE_ENTRY)
      continue;
    const state = decodeState(entry.data);
    if (!state) continue;
    active = state.active ? state.snapshot : undefined;
  }
  return active;
}

export function encodeTeamState(
  snapshot: TeamSnapshot | undefined,
): TeamStateEntry {
  if (!snapshot) return { active: false };
  const decoded = decodeSnapshot(snapshot);
  if (!decoded) return { active: false };
  return { active: true, snapshot: decoded };
}

export function appendTeamState(
  pi: TeamStatePi,
  snapshot: TeamSnapshot | undefined,
): void {
  pi.appendEntry(TEAM_STATE_ENTRY, encodeTeamState(snapshot));
}
