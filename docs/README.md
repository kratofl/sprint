# Sprint docs

Written for the agents that build Sprint. Start with [`AGENTS.md`](../AGENTS.md); read the internal
note for the area you are changing before you change it.

## Internals — decisions, constraints, traps

- [Architecture overview](internals/overview.md)
- [Glossary](internals/glossary.md)
- [Session planner and lap-history corpus](internals/session-planner.md)
- [Live Compare: traces, HUD, analysis, sharing](internals/live-compare.md)
- [Dash rendering](internals/dash-rendering.md) · [color research behind it](internals/dash-color-research.md)
- [Screen protocols (VoCore, USBD480, WinUSB)](internals/screen-protocols.md)
- Research: [RACELOGIC-style lap timer](internals/racelogic-lap-timer.md) ·
  [LMU weekly schedule feed](internals/lmu-schedule-feed.md)

## Operations — runbooks

- [Development and verification](operations/development.md)
- [Desktop diagnostics](operations/diagnostics.md)
- [Releasing the desktop app](operations/release.md)
- [Deploying the API and web app](operations/deployment.md)

## Design

- [Design system](design/DESIGN.md) — binding UI rules, tokens, component previews, mockups.

## Writing docs

Most changes need no doc change; agents can read the code.

- `internals/` holds decisions and their reasons, constraints that span components, and traps the
  source does not reveal. Before adding a paragraph, ask what a maintainer would get wrong without it.
- Do not document features, enumerate fields, narrate control flow, keep file catalogs or append PR
  summaries. Link to source instead of copying it. A local explanation belongs in a code comment.
- When a decision changes, rewrite or remove the old text — do not append a second account.
- `operations/` holds setup, release and debugging procedures.
- No plans, specs, checklists or status trackers in the repo. Work in progress lives in GitHub issues;
  settled decisions move into `internals/`.
- Human-facing docs stay minimal: the root `README.md` is enough.
