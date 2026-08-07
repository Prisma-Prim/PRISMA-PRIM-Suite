# Domain documentation

This repository uses one domain context.

## Read before changing business behaviour

- Read `CONTEXT.md` for canonical business vocabulary.
- Read the ADRs in `docs/adr/` that affect the proposed change.
- Read the originating GitHub issue or product specification for behaviour and acceptance criteria.

Use glossary terms in code, tests, issues, and documentation. If a required business concept is absent or conflicts with existing language, resolve it with `domain-modeling` before implementation.

## Ownership

- `CONTEXT.md` defines domain language only.
- `docs/adr/` explains durable, costly-to-reverse decisions.
- Product specifications define user-visible behaviour, scope, and success criteria.
- `AGENTS.md` defines the delivery process and repository-wide engineering rules.

Keep each fact in its owning document and link to it instead of duplicating it.
