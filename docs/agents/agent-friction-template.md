# Agent friction issue body

Agents that create issues through an API cannot use GitHub's interactive issue form. Use this Markdown body, apply the `agent-friction` label when available, and deduplicate against existing issues first.

```markdown
## Origin

- Originating PR: URL
- Harness: Codex Cloud | Codex CLI | Claude Code | Other
- Environment: OS, named environment, Node version, pnpm version

## Impact

Describe the blocked check, repeated effort, or reliability risk.

## Sanitized evidence

- Command: `command`
- Error or symptom: concise excerpt with no secrets or client data
- Reproduction: minimal deterministic steps

## Root cause

- Cause: confirmed | suspected | unknown
- Evidence supporting the assessment:

## Workaround

Describe the temporary recovery, or state that none exists.

## Durable fix

Describe the smallest proposed fix.

### Acceptance criteria

- [ ] The original reproduction no longer fails.
- [ ] Relevant local/cloud/CI environments are aligned.
- [ ] Documentation and automated guards are updated where appropriate.

## Potentially affected environments

- [ ] Codex Cloud
- [ ] Codex CLI or local development
- [ ] Claude Code
- [ ] GitHub Actions CI
- [ ] Other harnesses

## Required checks not run

- None, or list each check and exact blocker.
```
