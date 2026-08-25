---
name: subagent-teams
description: Use team and model preset delegation for Pi subagents.
---

# Subagent team presets

Use the active team selected by `/team <name>`, `/team normal`, or a configured
exact alias (for example, `Use my local llm team`). The built-in `normal` team
preserves Pi's normal behavior. A configured alias may also prefix a task with
`:` or a newline; remove that prefix before handling the task.

Before delegating, call:

```js
subagent({ action: "list" });
```

For every native child launch, pass the exact active `provider/model` target.
Use a role exception only when the listed agent's name exactly matches the
configured canonical agent name; otherwise use the active team's default model.
Preserve the selected agent's tools, prompt, context, runner, and all other
role behavior. This is model routing, not agent-profile replacement.

If the active target declares `reasoning: false`, normalize an unsupported
thinking setting to `off` and report the adjustment. Leave `external-cli` and
`external-job` runners unchanged and report them as skipped; do not rewrite
their targets.

This guidance is best effort. Direct or nested `subagent` launches can bypass
it, so do not claim that every child is enforced by the active team.
