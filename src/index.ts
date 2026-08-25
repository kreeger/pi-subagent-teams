import type {
  ExtensionAPI,
  ExtensionContext,
  ExtensionFactory,
  InputEvent,
  SessionStartEvent,
} from "@earendil-works/pi-coding-agent";
import { loadTeamsConfig, resolveConfiguredTeam } from "./config.js";
import { parseTeamInput } from "./input.js";
import {
  normalizeUnsupportedThinking,
  validateTeamModels,
} from "./model-validation.js";
import { buildTeamSystemNote } from "./prompt.js";
import { appendTeamState, readActiveTeam } from "./session-state.js";
import type {
  RegisteredModel,
  TeamExtensionOptions,
  TeamSnapshot,
  ThinkingAdjustment,
} from "./types.js";

function modelRegistryModels(ctx: ExtensionContext): RegisteredModel[] {
  return ctx.modelRegistry.getAll().map((model) => ({
    provider: model.provider,
    id: model.id,
    reasoning: model.reasoning,
  }));
}

async function defaultLocalProbe(
  ctx: ExtensionContext,
  provider: string,
  modelId: string,
): Promise<void> {
  const model = ctx.modelRegistry.find(provider, modelId);
  if (!model) throw new Error("local provider model is unavailable");
  const baseUrl = model.baseUrl;
  if (typeof baseUrl !== "string" || !baseUrl) {
    throw new Error("local provider endpoint is unavailable");
  }
  const auth = await ctx.modelRegistry.getApiKeyAndHeaders(model);
  if (!auth.ok) throw new Error("local provider authentication unavailable");
  const headers = { ...auth.headers };
  if (auth.apiKey) headers.Authorization = `Bearer ${auth.apiKey}`;
  const response = await fetch(`${baseUrl.replace(/\/$/, "")}/models`, {
    headers,
    signal: AbortSignal.timeout(5000),
  });
  if (!response.ok) throw new Error("local provider probe failed");
}

function notify(
  ctx: ExtensionContext,
  message: string,
  type: "info" | "warning" | "error" = "info",
): void {
  if (ctx.hasUI) ctx.ui.notify(message, type);
}

const NORMAL_ALIASES = ["normal", "Use my normal team"];

export function createTeamExtension(
  options: TeamExtensionOptions = {},
): ExtensionFactory {
  return (pi) => {
    let config = loadTeamsConfig(options.agentDir);
    let active: TeamSnapshot | undefined;
    let lastAdjustments: readonly ThinkingAdjustment[] = [];

    const aliases = (): string[] => [
      ...NORMAL_ALIASES,
      ...Object.values(config.teams).flatMap((team) => [...team.aliases]),
    ];

    const showStatus = (ctx: ExtensionContext): void => {
      ctx.ui.setStatus(
        "subagent-team",
        active ? `team:${active.name}` : undefined,
      );
    };

    const activate = async (
      name: string,
      ctx: ExtensionContext,
    ): Promise<boolean> => {
      if (name === "normal" || name.toLowerCase() === "use my normal team") {
        active = undefined;
        appendTeamState(pi, undefined);
        showStatus(ctx);
        notify(ctx, "Team reset to normal.");
        return true;
      }
      const snapshot = resolveConfiguredTeam(config, name);
      if (!snapshot) {
        notify(
          ctx,
          `Unknown team '${name}'. Available teams: ${Object.keys(config.teams).join(", ") || "normal"}.`,
          "error",
        );
        return false;
      }
      const result = await validateTeamModels(snapshot, {
        models: modelRegistryModels(ctx),
        probeLocalProvider:
          options.probeLocalProvider ??
          ((provider, modelId) => defaultLocalProbe(ctx, provider, modelId)),
      });
      if (!result.ok) {
        notify(
          ctx,
          result.issues.map((issue) => issue.message).join(" "),
          "error",
        );
        return false;
      }
      active = snapshot;
      const thinking = pi.getThinkingLevel();
      lastAdjustments = thinking
        ? Array.from(
            new Set([snapshot.model, ...Object.values(snapshot.agents)]),
          )
            .map((target) => {
              const separator = target.indexOf("/");
              const model = ctx.modelRegistry.find(
                target.slice(0, separator),
                target.slice(separator + 1),
              );
              return model
                ? normalizeUnsupportedThinking(model, thinking)
                : undefined;
            })
            .filter((adjustment): adjustment is ThinkingAdjustment =>
              Boolean(adjustment),
            )
        : result.adjustments;
      appendTeamState(pi, snapshot);
      showStatus(ctx);
      notify(ctx, `Activated team '${snapshot.name}'.`);
      return true;
    };

    pi.registerCommand("team", {
      description: "Show or activate a session-scoped subagent team.",
      getArgumentCompletions: () => [
        { value: "normal", label: "normal" },
        ...Object.keys(config.teams).map((name) => ({
          value: name,
          label: name,
        })),
      ],
      handler: async (args, ctx) => {
        config = loadTeamsConfig(options.agentDir);
        const value = args.trim();
        if (value) {
          await activate(value, ctx);
          return;
        }
        const issues = config.issues.map((issue) => issue.message).join(" ");
        const target = active
          ? `Active team: ${active.name}. Default model: ${active.model}. Role exceptions: ${JSON.stringify(active.agents)}.`
          : "Active team: normal (pass-through).";
        notify(
          ctx,
          [
            target,
            issues,
            "Thinking adjustments: " +
              (lastAdjustments.length > 0
                ? lastAdjustments
                    .map(
                      (adjustment) =>
                        `${adjustment.from ?? "configured"} thinking to ${adjustment.to} (${adjustment.reason})`,
                    )
                    .join("; ")
                : "none."),
            "external-cli and external-job runners remain unchanged and are reported as skipped.",
            "Best-effort only: direct/nested launches can bypass guidance.",
          ]
            .filter(Boolean)
            .join("\n"),
        );
      },
    });

    pi.on("session_start", (event: SessionStartEvent, ctx) => {
      config = loadTeamsConfig(options.agentDir);
      active = readActiveTeam(ctx.sessionManager.getEntries() as any);
      lastAdjustments = [];
      showStatus(ctx);
    });

    pi.on("input", async (event: InputEvent, ctx) => {
      config = loadTeamsConfig(options.agentDir);
      const match = parseTeamInput(event.text, aliases());
      if (match.kind === "none") return { action: "continue" as const };
      const matchedAlias = match.alias ?? "";
      const selected = NORMAL_ALIASES.some(
        (alias) => alias.toLowerCase() === matchedAlias.toLowerCase(),
      )
        ? "normal"
        : Object.values(config.teams).find((team) =>
            team.aliases.includes(matchedAlias),
          )?.name;
      if (!selected || !(await activate(selected, ctx)))
        return { action: "handled" as const };
      return match.kind === "prefix"
        ? {
            action: "transform" as const,
            text: match.remainder ?? "",
            images: event.images,
          }
        : { action: "handled" as const };
    });

    pi.on("before_agent_start", (event, _ctx) => {
      if (!active) return;
      return {
        systemPrompt: `${event.systemPrompt}\n\n${buildTeamSystemNote(active, lastAdjustments)}`,
      };
    });
  };
}

const extension: ExtensionFactory = createTeamExtension();
export default extension;
