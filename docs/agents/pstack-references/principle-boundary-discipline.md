# Upstream reference: Boundary Discipline

This is a principle skill. The fence is the upstream file. The local rule is [Domain structure](../domain-structure.md).

- Revision: `6b0300214a09fd6029cfb7077043125758cd1fd2`
- Path: `pstack/skills/principle-boundary-discipline/SKILL.md`
- Source: https://github.com/cursor/plugins/blob/6b0300214a09fd6029cfb7077043125758cd1fd2/pstack/skills/principle-boundary-discipline/SKILL.md
- SHA-256: `62ac2862c2caa22dd14531f51c9c6bb445ceb198ca98a687e25b4d47c1f10a28`

```text
---
name: principle-boundary-discipline
description: "Apply when wiring validation, error handling, or framework adapters. Concentrate guards at system boundaries (CLI, config, network, external APIs); trust internal types and keep business logic in pure functions."
disable-model-invocation: true
---

# Boundary Discipline

Place validation, type narrowing, and error handling at system boundaries. Trust internal code unconditionally. Business logic lives in pure functions. The shell is thin and mechanical.

**Why:** Scattered validation is noisy, redundant, and gives a false sense of safety. Keep logic out of framework wiring so it can be tested without the framework.

**The pattern:**
- **At boundaries** (CLI args, config files, external APIs, network protocols): validate, return errors, handle defensively.
- **Inside the system:** typed data, error propagation, no re-validation. Trust the types.
- **Across the boundary.** Expose domain concepts, not the boundary's private representation. Keep general-purpose mechanism inside and special-purpose policy at the edge.

**Applications:**

Validation and error handling:
- Validate config at parse time (the boundary), not inside business logic
- Parse raw data into domain types at the boundary
- Do not re-export transport, storage, framework, or wire types through the public surface
- No redundant nil checks deep in call chains if the boundary already validated

Code organization:
- Business logic in pure functions with no framework dependencies
- Parse functions: pure transforms from raw bytes to typed state
- Prompt construction: structured state in, string out
- Scoring and assessment: pure transforms from state to results

**The tests:**
- "Is this data crossing a system boundary right now?" If not, validation is redundant.
- "Can this be a pure function that the shell just calls?" If yes, extract it.
```
