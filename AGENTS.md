## Rules that apply everywhere

- **MUST** and **MUST NOT** mark real invariants - layer boundaries, wire
  contracts, output shapes - not house style.
- UI edits are the ones the eye can check: markup, styles, layout and copy MUST
  NOT be gated on test cases. Logic the eye cannot check - validation, data
  flow, state transitions - carries tests as usual.
- Before committing, `pnpm run ci` MUST pass.
- Commit messages follow Conventional Commits.

## Upstream reference submodule

`deepseek-harness/` is a Git submodule pointing at
[deepseek-ai/deepseek-harness](https://github.com/deepseek-ai/deepseek-harness).
It exists as read-only reference material for developing this package.

- It MUST NOT be edited, imported, published, or added to dependencies.
- It MUST stay excluded from every local tool: ESLint (`eslint.config.js`),
  `tsc` (`tsconfig.json`), knip (`knip.json`), and Vitest
  (`vitest.config.ts`). Any new scanning tool MUST exclude it too.
- Never commit a change to the pinned submodule commit unless the task is
  explicitly to bump that reference.

## Agent skills

### Issue tracker

Issues and specs live as GitHub issues, managed with the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

The five canonical triage roles map to `needs-triage`, `needs-info`,
`ready-for-agent`, `ready-for-human`, `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: `GLOSSARY.md` and `docs/adr/` at the repo root. See `docs/agents/domain.md`.
