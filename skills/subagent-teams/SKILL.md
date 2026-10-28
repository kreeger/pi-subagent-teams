---
name: subagent-teams
description: Use team and model preset delegation for Pi subagents.
---

# Subagent team presets

Use the active team selected by `/team <name>`, `/team normal`, or a configured
exact alias (for example, `Use my local llm team`). The built-in `normal` team
preserves Pi's normal behavior. A configured alias may also prefix a task with
`:` or a newline; remove that prefix before handling the task. The last
activated team is also the saved default: new sessions restore it after
re-validation, and `/team normal` clears both the session override and the
saved default. If the saved default fails validation at session start, treat
the session as `normal` and surface the warning.

Before delegating, call:

```js
subagent({ action: "list" });
```

For every native child launch, pass the exact active target unchanged — the
configured `provider/model`, plus its `:thinking` suffix when the team or the
matching agent sets one (levels: off, minimal, low, medium, high, xhigh, max).
For example, pass `localllm-orm/Qwen/Qwen3.6-35B-A3B-FP8` verbatim,
including every slash. Use a role exception only when the listed agent's name
exactly matches the
configured canonical agent name; otherwise use the active team's default target.
Preserve the selected agent's tools, prompt, context, runner, and all other
role behavior. This is model and thinking routing, not agent-profile replacement.

If the active target declares `reasoning: false`, normalize a non-`off`
configured thinking level to `off` and report the adjustment. Leave
`external-cli` and `external-job` runners unchanged and report them as skipped;
do not rewrite their targets.

This guidance is best effort. Direct or nested `subagent` launches can bypass
it, so do not claim that every child is enforced by the active team.
