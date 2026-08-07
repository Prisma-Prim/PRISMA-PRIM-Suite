# Issue tracker: GitHub

Product specifications and implementation tickets live in GitHub Issues in `Dan-Popescu/PRISMA-PRIM-Suite`. Local Codex sessions use the authenticated `gh` CLI from the repository clone.

## Working conventions

- Publish a master specification as one issue before splitting it into implementation tickets.
- Write implementation tickets as narrow tracer bullets that deliver complete, observable behaviour.
- Use GitHub sub-issues for membership under the master specification or an epic when available.
- Use native blocking dependencies when available. Otherwise include `Blocked by: #...` in the issue body.
- A ticket is ready only when its blockers are closed, its acceptance criteria are testable, and its required inputs exist or can be simulated.
- Open one implementation branch and pull request per ticket unless the user explicitly chooses a different publication workflow.
- Never broaden an implementation ticket silently. Create or propose a separate issue for follow-on work.

## Required ticket shape

Every implementation issue contains:

1. Parent specification or epic.
2. End-to-end behaviour to build.
3. Acceptance criteria.
4. Blocking issues.
5. Explicit exclusions.
6. Required test seams and verification commands.
7. Relevant context or ADR pointers.

## Common commands

```bash
gh issue view <number> --comments
gh issue create --title "..." --body-file <file>
gh issue edit <number> --add-label "ready-for-agent"
gh issue close <number> --comment "Implemented by <pull-request>"
```

GitHub Issues and pull requests share one number space. Resolve an ambiguous reference before acting.
