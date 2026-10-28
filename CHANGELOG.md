# Changelog

## [0.1.0] — 2026-10-28

### Added

- Initial release of pi-subagent-teams
- Session-scoped team presets read from `~/.pi/agent/teams.json`
- `/team` status output covering the active snapshot, configuration
  diagnostics, validation results, and skipped runners
- `/team <name>` activation, and `/team normal` to clear both the session
  override and the saved default
- Alias phrases matched as a standalone message or an anchored task prefix
- Per-agent model overrides and thinking levels, with team-level thinking
  and parent-session fallbacks
- Model validation against Pi's exact registry, plus a live connectivity
  probe for `localllm-*` targets
- Saved default team restored on new sessions after re-validation
- Team snapshots that survive `/reload`, compaction, and `/resume`
- Best-effort model-routing guidance for native child delegation
- Bundled `subagent-teams` skill with the delegation guidance
