import { readFileSync } from "node:fs";
import { join } from "node:path";
import { getAgentDir } from "@earendil-works/pi-coding-agent";
import type {
  LoadedTeamsConfig,
  TeamDefinition,
  TeamSnapshot,
  TeamsFile,
  ValidationIssue,
} from "./types.js";

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function normalizeAlias(text: string): string {
  return text.trim().replace(/\s+/g, " ").toLowerCase();
}

export function loadTeamsConfig(
  agentDir: string = getAgentDir(),
): LoadedTeamsConfig {
  const path = join(agentDir, "teams.json");
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    const missing = isMissingFile(error);
    const invalidJson = error instanceof SyntaxError;
    const code = missing
      ? "missing-file"
      : invalidJson
        ? "invalid-json"
        : "read-error";
    const message = missing
      ? `Teams configuration was not found at ${path}.`
      : `Could not read teams configuration at ${path}: ${errorMessage(error)}`;
    return {
      teams: {},
      issues: [{ severity: missing ? "warning" : "error", code, message }],
    };
  }
  return parseTeamsConfig(raw, path);
}

export function parseTeamsConfig(
  raw: unknown,
  source = "teams.json",
): LoadedTeamsConfig {
  const issues: ValidationIssue[] = [];
  if (!isRecord(raw) || !isRecord(raw.teams)) {
    return {
      teams: {},
      issues: [
        {
          severity: "error",
          code: "invalid-top-level",
          message: `${source} must contain a teams object.`,
        },
      ],
    };
  }

  const candidates = new Map<string, TeamSnapshot>();
  const invalidNames = new Set<string>();
  const names = new Map<string, string>();
  const aliases = new Map<string, string>();

  for (const [name, value] of Object.entries(raw.teams)) {
    const normalizedName = normalizeAlias(name);
    const teamIssues: ValidationIssue[] = [];
    if (!SLUG_PATTERN.test(name)) {
      teamIssues.push(
        issue(
          "invalid-team-name",
          `Team name '${name}' must match ${SLUG_PATTERN}.`,
        ),
      );
    }
    if (name === "normal") {
      teamIssues.push(
        issue("reserved-team-name", "The team name 'normal' is reserved."),
      );
    }
    if (names.has(normalizedName)) {
      const previousName = names.get(normalizedName) as string;
      invalidNames.add(previousName);
      invalidNames.add(name);
      teamIssues.push(
        issue(
          "duplicate-team-name",
          `Team name '${name}' duplicates '${previousName}'.`,
        ),
      );
      issues.push(
        issue(
          "duplicate-team-name",
          `Team name '${name}' duplicates '${previousName}'.`,
        ),
      );
    } else {
      names.set(normalizedName, name);
    }
    if (!isRecord(value)) {
      issues.push(issue("invalid-team", `Team '${name}' must be an object.`));
      continue;
    }
    const aliasesValue = value.aliases;
    const model = value.model;
    if (!Array.isArray(aliasesValue) || aliasesValue.length === 0) {
      teamIssues.push(
        issue(
          "invalid-aliases",
          `Team '${name}' must have a non-empty aliases array.`,
        ),
      );
    }
    if (typeof model !== "string" || model.trim() === "") {
      teamIssues.push(
        issue("invalid-model", `Team '${name}' must have a non-empty model.`),
      );
    }
    const normalizedAliases: string[] = [];
    if (Array.isArray(aliasesValue)) {
      for (const alias of aliasesValue) {
        if (typeof alias !== "string" || normalizeAlias(alias) === "") {
          teamIssues.push(
            issue(
              "invalid-alias",
              `Team '${name}' has an empty or non-string alias.`,
            ),
          );
          continue;
        }
        const normalized = normalizeAlias(alias);
        if (normalizedAliases.includes(normalized)) {
          teamIssues.push(
            issue(
              "duplicate-alias",
              `Team '${name}' has duplicate alias '${alias}'.`,
            ),
          );
        } else {
          normalizedAliases.push(normalized);
        }
      }
    }
    const agents: Record<string, string> = {};
    if (value.agents !== undefined) {
      if (!isRecord(value.agents)) {
        teamIssues.push(
          issue("invalid-agents", `Team '${name}' agents must be an object.`),
        );
      } else {
        for (const [role, target] of Object.entries(value.agents)) {
          if (!SLUG_PATTERN.test(role)) {
            teamIssues.push(
              issue(
                "invalid-role-key",
                `Team '${name}' role '${role}' is not a valid role key.`,
              ),
            );
          }
          if (typeof target !== "string" || target.trim() === "") {
            teamIssues.push(
              issue(
                "invalid-role-model",
                `Team '${name}' role '${role}' must have a non-empty model.`,
              ),
            );
          } else {
            agents[role] = target.trim();
          }
        }
      }
    }
    for (const alias of normalizedAliases) {
      const previous = aliases.get(alias);
      if (previous) {
        invalidNames.add(previous);
        invalidNames.add(name);
        teamIssues.push(
          issue(
            "duplicate-alias",
            `Alias '${alias}' is also used by team '${previous}'.`,
          ),
        );
        issues.push(
          issue(
            "duplicate-alias",
            `Alias '${alias}' is also used by team '${name}'.`,
          ),
        );
      } else {
        aliases.set(alias, name);
      }
    }
    if (teamIssues.length > 0) {
      issues.push(...teamIssues);
      continue;
    }
    const snapshot: TeamSnapshot = Object.freeze({
      name,
      aliases: Object.freeze([...(aliasesValue as string[])]),
      model: (model as string).trim(),
      agents: Object.freeze({ ...agents }),
    });
    candidates.set(name, snapshot);
  }

  // Remove teams involved in a normalized-name collision or alias collision.
  for (const name of invalidNames) candidates.delete(name);
  return {
    teams: Object.freeze(Object.fromEntries(candidates)),
    issues: Object.freeze([...issues]),
  };
}

export function resolveConfiguredTeam(
  config: LoadedTeamsConfig,
  input: string,
): TeamSnapshot | undefined {
  const name = normalizeAlias(input);
  return (
    config.teams[name] ??
    Object.values(config.teams).find(
      (team) => normalizeAlias(team.name) === name,
    )
  );
}

export function matchConfiguredAlias(
  config: LoadedTeamsConfig,
  text: string,
): TeamSnapshot | undefined {
  const alias = normalizeAlias(text);
  return Object.values(config.teams).find((team) =>
    team.aliases.some((candidate) => normalizeAlias(candidate) === alias),
  );
}

function isRecord(value: unknown): value is Record<string, any> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function issue(code: string, message: string): ValidationIssue {
  return { severity: "error", code, message };
}
function isMissingFile(error: unknown): boolean {
  return isRecord(error) && error.code === "ENOENT";
}
function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export type { LoadedTeamsConfig, TeamDefinition, TeamsFile };
