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
    getThinkingLevel: () => "high",
  };
  const ctx: any = {
    cwd: dir,
    hasUI: true,
    ui: {
      notify: (message: string) => notices.push(message),
      setStatus: vi.fn(),
    },
    sessionManager: { getEntries: () => entries },
    getThinkingLevel: () => "high",
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
  it("registers command and handles normal reset without stale adjustments", async () => {
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
    expect(h.commands.has("team")).toBe(true);
    await h.commands.get("team")!.handler("local", h.ctx);
    await h.commands.get("team")!.handler("normal", h.ctx);
    expect(h.entries.at(-1).data).toEqual({ active: false });
    await h.commands.get("team")!.handler("", h.ctx);
    expect(h.notices.at(-1)).toContain("Active team: normal");
    expect(h.notices.at(-1)).toContain("Thinking adjustments: none.");
  });

  it("activates configured teams and preserves state after failed activation", async () => {
    const h = harness({
      teams: {
        local: {
          aliases: ["Use local"],
          model: "localllm-orm/Qwen/Qwen3.6-35B-A3B-FP8",
        },
        bad: { aliases: ["Bad"], model: "missing/model" },
      },
    });
    await createTeamExtension({
      agentDir: h.dir,
      probeLocalProvider: vi.fn().mockResolvedValue(undefined),
    })(h.pi);
    await h.commands.get("team")!.handler("local", h.ctx);
    const activeEntry = h.entries.at(-1);
    await h.commands.get("team")!.handler("bad", h.ctx);
    expect(h.entries.at(-1)).toBe(activeEntry);
    const failingProbe = vi
      .fn()
      .mockRejectedValue(new Error("secret-key must not escape"));
    const failed = harness({
      teams: {
        local: {
          aliases: ["Use local"],
          model: "localllm-orm/Qwen/Qwen3.6-35B-A3B-FP8",
        },
      },
    });
    await createTeamExtension({
      agentDir: failed.dir,
      probeLocalProvider: failingProbe,
    })(failed.pi);
    await failed.commands.get("team")!.handler("local", failed.ctx);
    expect(failed.entries).toHaveLength(0);
    expect(failed.notices.join(" ")).not.toContain("secret-key");
    const activeNote = await h.handlers.get("before_agent_start")!(
      { systemPrompt: "base" },
      h.ctx,
    );
    expect(activeNote.systemPrompt).toContain("active team: local");
    expect(h.notices.join(" ")).toContain("not registered");
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

  it("reports thinking normalization and external runner skips in status and notes", async () => {
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
    const before = await h.handlers.get("before_agent_start")!(
      { systemPrompt: "base" },
      h.ctx,
    );
    expect(before.systemPrompt).toContain("Thinking adjustments");
    await h.commands.get("team")!.handler("", h.ctx);
    expect(h.notices.at(-1)).toContain("Thinking adjustments");
    expect(h.notices.at(-1)).toContain("external-cli and external-job");
  });

  it("applies configured thinking levels and reports normalization", async () => {
    const h = harness({
      teams: {
        local: {
          aliases: ["Use local"],
          model: "localllm-orm/Qwen/Qwen3.6-35B-A3B-FP8",
          thinking: "low",
          agents: {
            worker: {
              model: "localllm-orm/Qwen/Qwen3.6-35B-A3B-FP8",
              thinking: "high",
            },
          },
        },
      },
    });
    await createTeamExtension({
      agentDir: h.dir,
      probeLocalProvider: vi.fn().mockResolvedValue(undefined),
    })(h.pi);
    await h.commands.get("team")!.handler("local", h.ctx);
    const note = await h.handlers.get("before_agent_start")!(
      { systemPrompt: "base" },
      h.ctx,
    );
    expect(note.systemPrompt).toContain(
      "worker: localllm-orm/Qwen/Qwen3.6-35B-A3B-FP8:high",
    );
    expect(note.systemPrompt).toContain("low thinking to off");
    expect(note.systemPrompt).toContain("high thinking to off");
    await h.commands.get("team")!.handler("", h.ctx);
    expect(h.notices.at(-1)).toContain(
      "worker: localllm-orm/Qwen/Qwen3.6-35B-A3B-FP8:high",
    );
  });

  it("keeps failed headless alias activation handled and warns safely", async () => {
    const h = harness({
      teams: {
        broken: { aliases: ["Use broken"], model: "missing/model" },
      },
    });
    h.ctx.hasUI = false;
    const warning = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      await createTeamExtension({ agentDir: h.dir })(h.pi);
      const result = await h.handlers.get("input")!(
        { type: "input", text: "Use broken", source: "interactive" },
        h.ctx,
      );
      expect(result).toEqual({ action: "handled" });
      expect(warning).toHaveBeenCalledWith(
        expect.stringContaining("not registered"),
      );
    } finally {
      warning.mockRestore();
    }
  });

  it("uses the public registry auth seam for the default local probe", async () => {
    const h = harness({
      teams: {
        local: {
          aliases: ["Use local"],
          model: "localllm-orm/Qwen/Qwen3.6-35B-A3B-FP8",
        },
      },
    });
    const key = "probe-secret";
    h.ctx.modelRegistry.find = () => ({
      provider: "localllm-orm",
      id: "Qwen/Qwen3.6-35B-A3B-FP8",
      reasoning: false,
      baseUrl: "http://local.test/",
    });
    h.ctx.modelRegistry.getApiKeyAndHeaders = vi.fn().mockResolvedValue({
      ok: true,
      apiKey: key,
      headers: { "X-Test": "yes" },
    });
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);
    try {
      await createTeamExtension({ agentDir: h.dir })(h.pi);
      await h.commands.get("team")!.handler("local", h.ctx);
      expect(fetchMock).toHaveBeenCalledWith(
        "http://local.test/models",
        expect.objectContaining({
          headers: { "X-Test": "yes", Authorization: `Bearer ${key}` },
        }),
      );
      expect(h.notices.join(" ")).not.toContain(key);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
