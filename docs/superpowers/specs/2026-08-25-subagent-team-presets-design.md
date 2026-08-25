# Subagent Team Presets Design

## Status

Approved for implementation planning. Initial package name: `@kreeger/pi-subagent-teams`.

## Goal

Provide globally available, session-scoped team presets for Pi subagent delegation.

The initial use case is selecting a local team so parent-agent delegation targets:

```text
localllm-orm/Qwen/Qwen3.6-35B-A3B-FP8
```

The normal team remains Pi's existing runtime behavior, including `~/.agents`,
`~/.pi/agent/settings.json`, project config, agent frontmatter, and per-run
settings.

## Decisions

- Distribution: published npm Pi package.
- Package: `@kreeger/pi-subagent-teams`.
- Resources: one Pi extension plus one bundled skill.
- Config scope: global only, at `~/.pi/agent/teams.json`.
- Preset lifetime: until the Pi session ends; state survives `/reload` and
  compaction, resets on `/new`, and remains session-specific for `/resume`.
- Preset activation snapshots the validated definition. Later config edits take
  effect only after reselecting the team.
- Routing scope: child subagents only; the parent model is unchanged.
- Override depth: model only. Role prompts, tools, context, outputs, and other
  agent settings remain unchanged unless thinking normalization is required by
  the selected model.
- Preset precedence: active preset guidance tells the parent to prefer the
  active target over ad hoc child model args; this is not runtime enforcement.
- Preset shape: one default model plus optional canonical-agent role exceptions.
- Model targets: fully qualified `provider/model` IDs.
- Built-in `normal` team: pass-through; no config entry required.
- Phrase aliases: explicit aliases stored in `teams.json`; normalized exact
  matching only.
- Phrase grammar: standalone alias or anchored prefix followed by `:`/newline.
  Prefix aliases are removed before task processing.
- Config errors: fail safe to the built-in normal team; invalid configured teams
  are disabled with actionable diagnostics.
- Activation errors: fail activation when selected targets, aliases, or role
  names are invalid.
- Provider support: all exact registry-resolved models. `localllm-*` targets
  receive a live connectivity/auth probe; other providers use registry/auth
  validation because Pi has no universal health API.
- External runners: `external-cli` and `external-job` are not rewritten; they
  are reported as skipped.
- Thinking mismatch: if the selected model does not support an agent's
  configured thinking level, normalize that child to `off` and report it.
- Best-effort boundary: the package cannot intercept every direct or nested
  `subagent` tool launch without an upstream `pi-subagents` hook. The supported
  behavior is model guidance injected into the parent turn. Direct launches can
  bypass the active team and this limitation must be visible.

## User Experience

### Commands

- `/team` — show active team, snapshot targets, validation status, skipped
  external agents, and any thinking adjustments.
- `/team <name>` — validate, snapshot, and activate a configured team.
- `/team normal` — clear the session override and restore pass-through behavior.
- `/skill:subagent-teams` — explicitly load the bundled delegation guidance.

The built-in normal team includes aliases equivalent to `normal` and
`Use my normal team`. User-defined teams provide their own aliases, such as
`Use my local llm team`.

### Natural-language activation

The extension handles raw input before skill expansion:

- Standalone: `Use my local llm team`
- Prefix: `Use my local llm team: investigate the failing test`

Standalone input changes state without starting an agent turn. Prefix input
changes state, removes the alias, then sends the remaining task to the parent.
Arbitrary mid-sentence matches do not activate a team.

### Parent guidance

While a team is active, the extension adds a compact per-turn system note with:

- active team name;
- exact default and role-exception targets;
- model-only precedence rule;
- thinking normalization notices;
- external-runner limitations;
- direct/nested-launch bypass warning;
- instruction to pass the exact target on every native child launch.

The skill contains the same operational guidance, config semantics, and explicit
phrase examples. Auto-discovery remains enabled; explicit skill invocation is
the deterministic fallback.

## Configuration

Initial schema:

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

`agents` is optional. Every target uses the same fully qualified model syntax.
The default model applies to all native children; an `agents` entry replaces it
for that canonical agent name.

Validation rejects:

- malformed top-level/schema values;
- invalid team names;
- duplicate normalized team names or aliases;
- empty aliases or targets;
- unresolved provider/model IDs;
- malformed or empty canonical agent names in `agents`; unknown names produce a
  warning because runtime agent discovery is model/tool-facing rather than an
  extension API;
- local target live-probe failures.

A malformed or missing config never prevents Pi from starting. The built-in
normal team remains available. Invalid configured teams are excluded and their
errors are shown by `/team`.

## State and Lifecycle

The selected team is persisted as a custom session entry containing the team
name and resolved snapshot. It contains no API keys or provider credentials.

On session start/reload/resume, the extension restores only the current
session's snapshot. `/new` starts with normal. Fork behavior follows the new
session boundary and does not implicitly carry the parent override.

Selecting a team validates and snapshots it before writing active state. A later
edit to `teams.json` cannot change already-active routing. Reselecting the team
reloads and validates the definition.

## Routing Contract

For parent-created native child launches, the skill instructs the parent to:

1. call `subagent({ action: "list" })` before selecting and launching agents;
2. use the active preset's role exception when the canonical role matches;
3. otherwise use the active preset's default model;
4. pass the exact fully qualified model to each child launch;
5. preserve the agent's existing role configuration;
6. avoid ad hoc model escapes while the team is active;
7. report any child that cannot honor the target.

The extension does not mutate `settings.json`, agent files, project config, or
the parent model. It does not claim enforcement over children launched outside
this guidance path.

## Architecture

### Extension

Owns:

- config loading and schema validation;
- team name/alias resolution;
- `/team` commands;
- raw-input alias handling;
- provider/model registry checks;
- `localllm-*` live probes;
- session-entry persistence;
- per-turn system-note injection;
- status and diagnostics.

Uses Pi extension APIs for config, input/session lifecycle events,
`ctx.modelRegistry`, session entries, command registration, and UI/status APIs.
The bundled skill instructs the parent to call `subagent({ action: "list" })`
before delegation, because `/subagents` and that management action can discover
canonical agents from inside the pi-subagents runtime, but another extension
cannot invoke that LLM tool directly. The package therefore validates role keys
syntactically and reports unknown-role warnings.

### Skill

Owns model-facing delegation guidance. It must not claim hard enforcement. It
explains the active-state note, exact model syntax, role exceptions, thinking
normalization, external-runner behavior, and the bypass limitation.

### Package manifest

The npm package declares Pi resources for the extension and skill. Core Pi
packages remain peer dependencies. No fork, modified runtime, or RPC dependency
on `pi-subagents` is required for v1; the skill uses its existing list action
through the parent model when delegation begins.

## Error Handling

- Missing config: normal remains active; no startup error.
- Malformed config: normal remains active; `/team` reports diagnostics.
- Unknown team: command fails with available team names.
- Invalid selected model/alias: activation fails without changing active
  state.
- Malformed role keys fail activation; syntactically valid but unknown role
  names activate with a warning and fall back to the preset default when no
  matching child exists.
- Local provider unavailable: activation fails without changing active state.
- Unsupported thinking: activation succeeds; affected child is normalized to
  `off` and the adjustment appears in `/team` and the per-turn note.
- External runner: remains unchanged and is reported as skipped.
- Bypass: diagnostics describe that direct/nested launches may escape routing.

## Testing

Unit tests cover:

- schema parsing and defaults;
- built-in normal behavior;
- exact model ID handling with a slash-containing model ID;
- alias normalization, prefix stripping, and collision rejection;
- role-key syntax validation and unknown-role warnings;
- preset snapshot/reselection behavior;
- malformed-config fail-safe behavior;
- thinking normalization;
- provider probe success/failure.

Integration tests cover:

- `/team` command output and reset;
- standalone and prefix input handling;
- session entry restore across reload/resume and reset on new session;
- per-turn note content and inactive-team silence;
- delegation guidance requiring `subagent({ action: "list" })` before launch;
- parent model/config immutability;
- external-runner diagnostics;
- package resource discovery.

The implementation must run focused tests plus the package's typecheck/build
checks before completion.

## Non-goals

- Changing the parent model.
- Mutating Pi settings or agent definitions.
- Project-local team files in v1.
- Full-agent profile replacement.
- Universal provider health probes.
- Guaranteed interception of direct/nested `subagent` launches.
- Upstream `pi-subagents` changes.
- A fixed orchestration workflow or `/team-run` command.
