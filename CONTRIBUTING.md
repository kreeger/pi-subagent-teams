# Contributing to pi-subagent-teams

Thanks for your interest in pi-subagent-teams! This document covers how to
contribute, set up a development environment, and get your changes reviewed and
merged.

## Getting started

1. Fork the [repository](https://github.com/kreeger/pi-subagent-teams) on
   GitHub.
2. Clone your fork:
   ```bash
   git clone git@github.com:YOUR_USERNAME/pi-subagent-teams.git
   cd pi-subagent-teams
   ```
3. Install dependencies:
   ```bash
   npm install
   ```
4. Run the tests to verify everything works:
   ```bash
   npm test
   ```

## Development workflow

This project uses [Vitest](https://vitest.dev/) for testing. Tests live in
`src/__tests__/`. Run the full suite before pushing:

```bash
npm test
```

CI also runs the typecheck on every push, so run it locally before you open a
pull request:

```bash
npm run typecheck
```

Formatting is checked with Prettier. It is not part of the CI gate, but the
repository is formatted, so run this before committing:

```bash
npm run format:check
```

Use Conventional Commit prefixes such as `feat:`, `fix:`, and `docs:`. The
release process uses these prefixes to generate `CHANGELOG.md` and recommend the
next version.

### Testing your changes in pi

Install the package from your working copy, then restart your pi session:

```bash
pi install /path/to/pi-subagent-teams
```

### Releasing

Releases are run locally from a clean checkout, with `main` up to date and both
npm and GitHub authenticated. The GitHub release step reads `GITHUB_TOKEN`.

```bash
npm run release -- --dry-run
npm run release
```

release-it runs the tests and typecheck, prompts for the version, generates the
changelog, bumps `package.json`, creates and pushes the `v${version}` tag,
publishes to npm, and opens the GitHub release.

The 0.1.0 release was published by hand, so `CHANGELOG.md` starts with a
hand-written `0.1.0` section. release-it inserts each new section above it.

## Submitting changes

1. Create a branch with a descriptive name:
   ```bash
   git checkout -b feat/my-feature
   ```
2. Make your changes and commit them. Keep commits focused and well-described.
3. Push your branch and open a pull request.

### Pull request guidelines

- **One change per PR.** If you have multiple unrelated changes, split them into
  separate pull requests.
- **Include tests.** New behavior should include test coverage in
  `src/__tests__/`. Bug fixes should add a test that reproduces the issue.
- **Update documentation.** If you change configuration or activation behavior,
  update `README.md` and `skills/subagent-teams/SKILL.md`.
- **Keep the scope tight.** Avoid reformatting unrelated code or changing
  dependencies that aren't needed for your change.

## Coding conventions

- Written in TypeScript with strict mode enabled.
- Tests use Vitest (import `{ expect, test, describe, vi }` from `vitest`).
- Prettier handles formatting; `npm run format:check` must pass.
- Model targets are always exact, fully qualified `provider/model` IDs. Do not
  add prefix or fuzzy matching.

## Asking questions

Open an issue if you have questions about the codebase, feature ideas, or run
into trouble getting set up.
