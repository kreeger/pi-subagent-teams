import type {
  AgentTarget,
  RegisteredModel,
  TeamSnapshot,
  ThinkingAdjustment,
  ValidationIssue,
  ValidationResult,
} from "./types.js";

export interface ModelValidationContext {
  models: readonly RegisteredModel[];
  probeLocalProvider: (provider: string, modelId: string) => Promise<void>;
}

/** Resolve a canonical agent role to its configured target, or the team default. */
export function resolveTeamModel(
  snapshot: TeamSnapshot,
  agentName: string,
): AgentTarget {
  return Object.hasOwn(snapshot.agents, agentName)
    ? snapshot.agents[agentName]
    : {
        model: snapshot.model,
        ...(snapshot.thinking ? { thinking: snapshot.thinking } : {}),
      };
}

/** Every distinct (model, effective thinking) pair, team default thinking applied. */
function collectTargets(
  snapshot: TeamSnapshot,
): readonly { model: string; thinking?: string }[] {
  const seen = new Set<string>();
  const targets: { model: string; thinking?: string }[] = [];
  const candidates = [
    { model: snapshot.model, thinking: snapshot.thinking },
    ...Object.values(snapshot.agents).map((target) => ({
      model: target.model,
      thinking: target.thinking ?? snapshot.thinking,
    })),
  ];
  for (const candidate of candidates) {
    const key = `${candidate.model}\u0000${candidate.thinking ?? ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    targets.push(candidate);
  }
  return targets;
}

/** Validate every distinct configured target and probe local providers. */
export async function validateTeamModels(
  snapshot: TeamSnapshot,
  context: ModelValidationContext,
): Promise<ValidationResult> {
  const issues: ValidationIssue[] = [];
  const adjustments: ThinkingAdjustment[] = [];

  for (const target of collectTargets(snapshot)) {
    const separator = target.model.indexOf("/");
    if (separator <= 0 || separator === target.model.length - 1) {
      issues.push({
        severity: "error",
        code: "invalid-model-target",
        message: `Model target '${target.model}' must use provider/model syntax.`,
      });
      continue;
    }
    const provider = target.model.slice(0, separator);
    const modelId = target.model.slice(separator + 1);
    const registered = context.models.find(
      (model) => model.provider === provider && model.id === modelId,
    );
    if (!registered) {
      issues.push({
        severity: "error",
        code: "model-not-found",
        message: `Model '${target.model}' is not registered.`,
      });
      continue;
    }
    if (provider.startsWith("localllm-")) {
      try {
        await context.probeLocalProvider(provider, modelId);
      } catch {
        // Probe errors can contain credentials or authorization headers. Keep diagnostics data-only.
        issues.push({
          severity: "error",
          code: "local-probe-failed",
          message: `Could not reach local provider model '${target.model}'.`,
        });
      }
    }
    if (
      registered.reasoning === false &&
      target.thinking !== undefined &&
      target.thinking !== "off"
    ) {
      adjustments.push({
        from: target.thinking,
        to: "off",
        reason: `Model '${target.model}' does not support reasoning.`,
      });
    }
  }

  return {
    ok: issues.every((issue) => issue.severity !== "error"),
    issues,
    adjustments,
  };
}

export function normalizeUnsupportedThinking(
  model: RegisteredModel,
  configuredThinking: string | false | undefined,
): ThinkingAdjustment | undefined {
  if (
    model.reasoning !== false ||
    configuredThinking === undefined ||
    configuredThinking === false ||
    configuredThinking === "off"
  ) {
    return undefined;
  }
  return {
    from: configuredThinking,
    to: "off",
    reason: `Model '${model.provider}/${model.id}' does not support reasoning.`,
  };
}
