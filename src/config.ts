import { readFileSync } from "node:fs";
import { join } from "node:path";
import { getAgentDir } from "@earendil-works/pi-coding-agent";
import type {
  AgentTarget,
  LoadedTeamsConfig,
  TeamDefinition,
  TeamSnapshot,
  TeamsFile,
  ThinkingLevel,
  ValidationIssue,
} from "./types.js";
import { isThinkingLevel, THINKING_LEVELS } from "./types.js";

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
    const agents: Record<string, AgentTarget> = {};
    if (value.agents !== undefined) {
      if (!isRecord(value.agents)) {
        teamIssues.push(
          issue("invalid-agents", `Team '${name}' agents must be an object.`),
        );
      } else {
        for (const [role, raw] of Object.entries(value.agents)) {
          if (!SLUG_PATTERN.test(role)) {
            teamIssues.push(
              issue(
                "invalid-role-key",
                `Team '${name}' role '${role}' is not a valid role key.`,
              ),
            );
          }
          const target = parseAgentTarget(name, role, raw, teamIssues);
          if (target) agents[role] = target;
        }
      }
    }
    let thinking: ThinkingLevel | undefined;
    if (value.thinking !== undefined) {
      if (!isThinkingLevel(value.thinking)) {
        teamIssues.push(
          issue(
            "invalid-thinking",
            `Team '${name}' thinking must be one of: ${THINKING_LEVELS.join(", ")}.`,
          ),
        );
      } else {
        thinking = value.thinking;
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
      agents: Object.freeze(
        Object.fromEntries(
          Object.entries(agents).map(([role, target]) => [
            role,
            Object.freeze(target),
          ]),
        ),
      ),
      ...(thinking !== undefined ? { thinking } : {}),
    });
    candidates.set(name, snapshot);
  }

  // Only valid teams claim names and aliases, so invalid entries cannot poison siblings.
  for (const [name] of candidates) {
    const normalizedName = normalizeAlias(name);
    const previous = names.get(normalizedName);
    if (previous) {
      invalidNames.add(previous);
      invalidNames.add(name);
      issues.push(
        issue(
          "duplicate-team-name",
          `Team name '${name}' duplicates '${previous}'.`,
        ),
      );
    } else {
      names.set(normalizedName, name);
    }
    const team = candidates.get(name) as TeamSnapshot;
    for (const alias of team.aliases) {
      const normalizedAlias = normalizeAlias(alias);
      const aliasOwner = aliases.get(normalizedAlias);
      if (aliasOwner) {
        invalidNames.add(aliasOwner);
        invalidNames.add(name);
        issues.push(
          issue(
            "duplicate-alias",
            `Alias '${normalizedAlias}' is also used by team '${name}'.`,
          ),
        );
      } else {
        aliases.set(normalizedAlias, name);
      }
    }
  }
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
  return Object.hasOwn(config.teams, name) ? config.teams[name] : undefined;
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

/** Split a trailing `:level` suffix off a target only when it is a valid thinking level. */
export function splitThinkingSuffix(target: string): {
  model: string;
  thinking?: ThinkingLevel;
} {
  const separator = target.lastIndexOf(":");
  if (separator > 0 && separator < target.length - 1) {
    const suffix = target.slice(separator + 1);
    if (isThinkingLevel(suffix)) {
      return { model: target.slice(0, separator), thinking: suffix };
    }
  }
  return { model: target };
}

function parseAgentTarget(
  teamName: string,
  role: string,
  raw: unknown,
  teamIssues: ValidationIssue[],
): AgentTarget | undefined {
  if (typeof raw === "string") {
    if (raw.trim() === "") {
      teamIssues.push(
        issue(
          "invalid-role-model",
          `Team '${teamName}' role '${role}' must have a non-empty model.`,
        ),
      );
      return undefined;
    }
    return splitThinkingSuffix(raw.trim());
  }
  if (isRecord(raw)) {
    const model = raw.model;
    if (typeof model !== "string" || model.trim() === "") {
      teamIssues.push(
        issue(
          "invalid-role-model",
          `Team '${teamName}' role '${role}' must have a non-empty model.`,
        ),
      );
      return undefined;
    }
    if (raw.thinking !== undefined && !isThinkingLevel(raw.thinking)) {
      teamIssues.push(
        issue(
          "invalid-thinking",
          `Team '${teamName}' role '${role}' has a thinking level that must be one of: ${THINKING_LEVELS.join(", ")}.`,
        ),
      );
      return undefined;
    }
    return {
      model: model.trim(),
      ...(raw.thinking !== undefined ? { thinking: raw.thinking } : {}),
    };
  }
  teamIssues.push(
    issue(
      "invalid-role-model",
      `Team '${teamName}' role '${role}' must be a model string or an object with a model.`,
    ),
  );
  return undefined;
}

export type { LoadedTeamsConfig, TeamDefinition, TeamsFile };
