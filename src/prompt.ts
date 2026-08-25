import type {
  TeamSnapshot,
  ThinkingAdjustment,
  ValidationIssue,
} from "./types.js";

const BASE_GUIDANCE = [
  'Before each native child launch, call subagent({ action: "list" }) to discover canonical agents.',
  "Apply the matching canonical agent's role exception when one exists; otherwise use the exact default model.",
  "This guidance changes model only and preserves role settings, prompts, tools, and other configuration for each agent.",
  "Pass the exact fully qualified target on every native child launch and avoid ad hoc model escapes.",
  "If the target does not support the configured thinking level, use thinking off and report the normalization.",
  "Leave external-cli and external-job runners unchanged; report them as skipped.",
  "This is best-effort guidance: direct or nested launches can bypass the active team.",
].join(" ");

export function buildTeamSystemNote(
  snapshot: TeamSnapshot | undefined,
  adjustments: readonly ThinkingAdjustment[] = [],
  warnings: readonly ValidationIssue[] = [],
): string {
  if (!snapshot) return "";

  const roleTargets = Object.entries(snapshot.agents)
    .map(([role, target]) => `${role}: ${target}`)
    .join(", ");
  const lines = [
    `active team: ${snapshot.name}.`,
    `default model: ${snapshot.model}.`,
    `role exceptions: ${roleTargets || "none"}.`,
    BASE_GUIDANCE,
  ];
  if (adjustments.length > 0) {
    lines.push(
      `Thinking adjustments: ${adjustments
        .map(
          (adjustment) =>
            `${adjustment.from ?? "configured"} thinking to ${adjustment.to} (${adjustment.reason})`,
        )
        .join("; ")}.`,
    );
  }
  if (warnings.length > 0) {
    lines.push(
      `Warnings: ${warnings.map((warning) => warning.message).join(" ")}`,
    );
  }
  return lines.join("\n");
}

export function buildDelegationGuidance(): string {
  return `Active team delegation guidance. ${BASE_GUIDANCE}`;
}
