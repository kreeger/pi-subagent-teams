# @kreeger/pi-subagent-teams

Session-scoped model presets for Pi subagent teams.

This package adds a Pi extension and a bundled `subagent-teams` skill. It
changes the model target used for native child delegation without changing the
parent model or agent profiles.

## Install and configure

Install the package:

```bash
pi install npm:@kreeger/pi-subagent-teams
```

Create `~/.pi/agent/teams.json` with your team presets:

```json
{
  "teams": {
    "local-llm": {
      "aliases": ["Use my local llm team"],
      "model": "localllm-orm/Qwen/Qwen3.6-35B-A3B-FP8",
      "agents": {
        "worker": "localllm-orm/Qwen/Qwen3.6-35B-A3B-FP8"
      }
    },
    "budget": {
      "aliases": ["Use my budget team"],
      "model": "openai/gpt-4o-mini",
      "thinking": "low",
      "agents": {
        "planner": "anthropic/claude-sonnet-4:high",
        "worker": {
          "model": "openai/gpt-4o-mini",
          "thinking": "off"
        },
        "reviewer": "openai/gpt-4o:medium"
      }
    }
  }
}
```

Each model target must be an exact, fully qualified `provider/model` ID.
`model` is the default for native children. An entry in `agents` overrides the
target for a canonical agent name.

Every agent can also carry its own thinking level. Write it as an object
`{ "model": "...", "thinking": "high" }`, or use the shorthand suffix
`"provider/model:high"`. Valid levels, from least to most thinking, are `off`,
`minimal`, `low`, `medium`, `high`, `xhigh`, and `max` — the same levels the Pi
subagents tool accepts as a `provider/id:level` suffix. An optional team-level
`thinking` applies to every agent without its own level; when neither is set,
children keep the parent session's current thinking level. If a selected model
declares `reasoning: false`, a non-`off` effective level is normalized to `off`
and reported at activation and in the delegation guidance.

## Use teams

The built-in `normal` team requires no configuration and preserves Pi's
pass-through behavior.

- `/team` shows the active snapshot, configuration diagnostics, validation
  status, and skipped runners.
- `/team local-llm` validates and activates the configured team.
- `/team normal` clears the session override.
- `/skill:subagent-teams` explicitly loads the delegation guidance.

Aliases are matched exactly after case and whitespace normalization. The
built-in aliases are `normal` and `Use my normal team`. An alias can be a
standalone message or an anchored task prefix:

```text
Use my local llm team: investigate the failing test
Use my local llm team
investigate the failing test
```

The prefix is removed before the task is processed. A match in the middle of a
sentence does not activate a team.

## Lifetime and validation

An activated preset lasts until the Pi session ends. Pi snapshots the validated
team definition when you select it, so later edits to `teams.json` take effect
only after you select the team again.

The snapshot survives `/reload`, compaction, and `/resume`. A `/new` session
starts with `normal`, and forked sessions do not implicitly inherit the
override. Session state stores model snapshots, not credentials.

Activation validates every unique target against Pi's exact model registry. A
`localllm-*` target also receives a live connectivity and auth probe. Other
providers use registry and auth validation because Pi has no universal health
API.

If configuration is missing or malformed, activation fails safe to `normal`.
Invalid configured teams and unavailable local targets produce actionable
diagnostics, and failed activation does not replace the current active team.

Role keys are checked syntactically. When delegation resolves the canonical
agent list, an unmatched role falls back to the preset default. Before
launching, the parent guidance requires `subagent({ action: "list" })` and
reports when a target cannot be honored.

Team settings do not change roles, prompts, tools, context, outputs, or other
agent behavior. `external-cli` and
`external-job` runners remain unchanged and are reported as skipped.

## Best-effort routing

While a team is active, the extension adds model-routing guidance to the parent
turn. Before each native child launch, the guidance requires:

```js
subagent({ action: "list" });
```

The parent then passes the exact active target to each native child launch —
`provider/model`, plus the configured `:thinking` suffix when the team or the
matching agent sets one — using a role exception only for a matching canonical
agent.

Routing is best effort. Direct or nested `subagent` launches can bypass the
guidance because the extension does not intercept the upstream runtime. The
parent model and normal Pi configuration are never mutated.
