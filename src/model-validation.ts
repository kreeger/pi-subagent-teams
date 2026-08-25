import type {
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
): string {
  return Object.hasOwn(snapshot.agents, agentName)
    ? snapshot.agents[agentName]
    : snapshot.model;
}

/** Validate every distinct configured target and probe local providers. */
export async function validateTeamModels(
  snapshot: TeamSnapshot,
  context: ModelValidationContext,
): Promise<ValidationResult> {
  const issues: ValidationIssue[] = [];
  const targets = new Set([snapshot.model, ...Object.values(snapshot.agents)]);

  for (const target of targets) {
    const separator = target.indexOf("/");
    if (separator <= 0 || separator === target.length - 1) {
      issues.push({
        severity: "error",
        code: "invalid-model-target",
        message: `Model target '${target}' must use provider/model syntax.`,
      });
      continue;
    }
    const provider = target.slice(0, separator);
    const modelId = target.slice(separator + 1);
    const registered = context.models.find(
      (model) => model.provider === provider && model.id === modelId,
    );
    if (!registered) {
      issues.push({
        severity: "error",
        code: "model-not-found",
        message: `Model '${target}' is not registered.`,
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
          message: `Could not reach local provider model '${target}'.`,
        });
      }
    }
  }

  return {
    ok: issues.every((issue) => issue.severity !== "error"),
    issues,
    adjustments: [],
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
