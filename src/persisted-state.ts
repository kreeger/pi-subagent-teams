import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export const STATE_FILE = "teams-state.json";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** The last activated team name, or undefined when unset, missing, or malformed. */
export function readPersistedTeam(agentDir: string): string | undefined {
  try {
    const raw: unknown = JSON.parse(
      readFileSync(join(agentDir, STATE_FILE), "utf8"),
    );
    if (
      isRecord(raw) &&
      typeof raw.team === "string" &&
      raw.team.trim() !== ""
    ) {
      return raw.team.trim();
    }
  } catch {
    // Missing or malformed state falls back to no saved default.
  }
  return undefined;
}

/** Persist the saved default team name, or clear it. Non-string inputs are rejected. */
export function writePersistedTeam(
  agentDir: string,
  team: string | undefined,
): void {
  if (team !== undefined && team.trim() === "") {
    throw new Error("persisted team name must not be empty");
  }
  writeFileSync(
    join(agentDir, STATE_FILE),
    `${JSON.stringify({ team: team ?? null }, null, 2)}\n`,
  );
}
