## Rules that apply everywhere

- **MUST** and **MUST NOT** mark real invariants - layer boundaries, wire
  contracts, output shapes - not house style.
- UI edits are the ones the eye can check: markup, styles, layout and copy MUST
  NOT be gated on test cases. Logic the eye cannot check - validation, data
  flow, state transitions - carries tests as usual.
- Before committing, `pnpm run ci` MUST pass.
- Commit messages follow Conventional Commits.

## Agent skills

### Issue tracker

Issues and specs live as GitHub issues, managed with the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

The five canonical triage roles map to `needs-triage`, `needs-info`,
`ready-for-agent`, `ready-for-human`, `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: `GLOSSARY.md` and `docs/adr/` at the repo root. See `docs/agents/domain.md`.
