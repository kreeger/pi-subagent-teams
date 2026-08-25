# @kreeger/pi-subagent-teams

Session-scoped model presets for Pi subagent teams. The package provides a Pi
extension and a bundled `subagent-teams` skill. It changes the model target for
native child delegation guidance without changing the parent model or agent
profiles.

## Installation

```bash
pi install npm:@kreeger/pi-subagent-teams
```

Create `~/.pi/agent/teams.json`:

```json
{
  "teams": {
    "local-llm": {
      "aliases": ["Use my local llm team"],
      "model": "localllm-orm/Qwen/Qwen3.6-35B-A3B-FP8",
      "agents": {
        "worker": "localllm-orm/Qwen/Qwen3.6-35B-A3B-FP8"
      }
    }
  }
}
```

Every target is an exact, fully qualified `provider/model` ID. The default
model applies to native children; an `agents` entry is a role exception for a
canonical agent name.

## Teams and commands

The built-in `normal` team requires no configuration and is Pi's pass-through
behavior. Use:

- `/team` to show the active snapshot, validation status, warnings, and skipped
  runners.
- `/team local-llm` to validate and activate a configured team.
- `/team normal` to clear the session override.
- `/skill:subagent-teams` to explicitly load the delegation guidance.

Configured aliases are matched exactly after case and whitespace
normalization. The built-in aliases include `normal` and `Use my normal team`.
An alias can be a standalone message or an anchored task prefix:

```text
Use my local llm team: investigate the failing test
Use my local llm team
investigate the failing test
```

The prefix is removed before the task is processed. Arbitrary mid-sentence
matches do not activate a team.

## Lifetime and validation

An activated preset lasts until the Pi session ends. Its validated definition
is snapshotted: later edits to `teams.json` take effect only after selecting
the team again. The snapshot survives `/reload`, compaction, and `/resume`; a
`/new` session starts with `normal`, and forked sessions do not implicitly
inherit the override. Session state stores model snapshots, not credentials.

Activation validates every unique target against Pi's exact model registry. A
`localllm-*` target also receives a live connectivity/auth probe; other
providers use registry/auth validation because Pi has no universal health API.
Missing or malformed configuration fails safe to `normal`. Invalid configured
teams and unavailable local targets are reported with actionable diagnostics,
and failed activation does not replace the current active team.

Role keys are checked syntactically. A syntactically valid but unknown role
name produces a warning; it falls back to the default when no matching
canonical agent exists. Role settings, prompts, tools, context, outputs, and
other agent behavior remain unchanged.

If a selected model declares `reasoning: false`, unsupported child thinking is
normalized to `off` and reported. `external-cli` and `external-job` runners are
left unchanged and reported as skipped.

## Best-effort routing

While a team is active, the extension adds model-routing guidance to the parent
turn. Before each native child launch, the guidance requires:

```js
subagent({ action: "list" });
```

Then pass the exact active `provider/model` target on every native child launch,
using a role exception only for a matching canonical agent. This package does
not promise all-child enforcement: direct or nested `subagent` launches can
bypass the guidance because the extension does not intercept the upstream
runtime. The parent model and normal Pi configuration are never mutated.
