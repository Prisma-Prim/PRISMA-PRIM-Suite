# Environment friction note

Add an **Environment friction** section to a pull request only when avoidable repository, environment, CI, or harness friction occurred: runtime or package-manager drift, missing prerequisites, incorrect or undocumented commands, permission, network, or sandbox constraints, differences between local, cloud, and CI behavior, flaky tests, or a required check that could not run. Delete the section otherwise.

Do not report expected failing TDD tests, syntax mistakes, discarded approaches, or bugs introduced and fixed during ordinary development.

## Format

One line per observation:

```markdown
## Environment friction

- Category: what failed and the exact sanitized symptom; workaround used; suggested durable fix or "none".
```

Keep the note free of secrets, credentials, full logs, and Client data.

## When friction becomes an issue

Apply a small certain fix in the current pull request only when it stays inside the issue's scope.

Open an issue with the `Agent friction` form, or the [Markdown body](agent-friction-template.md) when the harness cannot use forms, only when the same friction blocked a required check on two occasions or when the durable fix changes CI, cloud setup, Docker, secrets, permissions, or network policy. Link the originating pull requests and deduplicate against open friction issues.

The repository owner prioritizes friction issues. Do not implement one from inside a product issue, and do not turn a friction note into a process document.
