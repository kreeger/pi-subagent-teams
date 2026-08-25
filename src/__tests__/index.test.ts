import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import extension, { createTeamExtension } from "../index.js";

function harness(config: unknown) {
  const dir = mkdtempSync(join(tmpdir(), "teams-index-"));
  writeFileSync(join(dir, "teams.json"), JSON.stringify(config));
  const handlers = new Map<string, (event: any, ctx: any) => any>();
  const commands = new Map<string, any>();
  const entries: any[] = [];
  const notices: string[] = [];
  const pi: any = {
    on: (name: string, fn: any) => handlers.set(name, fn),
    registerCommand: (name: string, options: any) =>
      commands.set(name, options),
    appendEntry: (type: string, data: unknown) =>
      entries.push({ type: "custom", customType: type, data }),
  };
  const ctx: any = {
    cwd: dir,
    hasUI: true,
    ui: {
      notify: (message: string) => notices.push(message),
      setStatus: vi.fn(),
    },
    sessionManager: { getEntries: () => entries },
    modelRegistry: {
      getAll: () => [
        {
          provider: "localllm-orm",
          id: "Qwen/Qwen3.6-35B-A3B-FP8",
          reasoning: false,
        },
      ],
      find: () => ({
        provider: "localllm-orm",
        id: "Qwen/Qwen3.6-35B-A3B-FP8",
        reasoning: false,
      }),
    },
  };
  return { dir, handlers, commands, entries, notices, pi, ctx };
}

describe("team extension", () => {
  it("registers command and handles normal reset", async () => {
    const h = harness({ teams: {} });
    await extension(h.pi);
    expect(h.commands.has("team")).toBe(true);
    await h.commands.get("team")!.handler("normal", h.ctx);
    expect(h.entries.at(-1).data).toEqual({ active: false });
  });

  it("activates configured teams and preserves state after failed activation", async () => {
    const h = harness({
      teams: {
        local: {
          aliases: ["Use local"],
          model: "localllm-orm/Qwen/Qwen3.6-35B-A3B-FP8",
        },
      },
    });
    await createTeamExtension({
      agentDir: h.dir,
      probeLocalProvider: vi.fn().mockResolvedValue(undefined),
    })(h.pi);
    await h.commands.get("team")!.handler("local", h.ctx);
    const activeEntry = h.entries.at(-1);
    await h.commands.get("team")!.handler("missing", h.ctx);
    expect(h.entries.at(-1)).toBe(activeEntry);
    await h.handlers.get("before_agent_start")!(
      { systemPrompt: "base" },
      h.ctx,
    );
    expect(h.notices.join(" ")).toContain("Unknown team");
  });

  it("handles standalone and prefix aliases before agent processing", async () => {
    const h = harness({
      teams: {
        local: {
          aliases: ["Use local"],
          model: "localllm-orm/Qwen/Qwen3.6-35B-A3B-FP8",
        },
      },
    });
    await createTeamExtension({
      agentDir: h.dir,
      probeLocalProvider: vi.fn().mockResolvedValue(undefined),
    })(h.pi);
    expect(
      await h.handlers.get("input")!(
        { type: "input", text: "Use local", source: "interactive" },
        h.ctx,
      ),
    ).toEqual({ action: "handled" });
    expect(
      await h.handlers.get("input")!(
        {
          type: "input",
          text: "Use local: investigate",
          source: "interactive",
        },
        h.ctx,
      ),
    ).toEqual({ action: "transform", text: "investigate", images: undefined });
  });

  it("restores only session state and injects guidance while active", async () => {
    const h = harness({ teams: {} });
    h.entries.push({
      type: "custom",
      customType: "subagent-team-state",
      data: {
        active: true,
        snapshot: {
          name: "saved",
          aliases: [],
          model: "provider/model",
          agents: {},
        },
      },
    });
    await createTeamExtension({ agentDir: h.dir })(h.pi);
    await h.handlers.get("session_start")!(
      { type: "session_start", reason: "resume" },
      h.ctx,
    );
    const result = await h.handlers.get("before_agent_start")!(
      { systemPrompt: "base" },
      h.ctx,
    );
    expect(result.systemPrompt).toContain("active team: saved");
    expect(result.systemPrompt).toContain("direct or nested");
  });
});
