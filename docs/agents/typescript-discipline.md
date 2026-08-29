# Mandatory TypeScript discipline

**Status:** Approved repository contract

This is the canonical TypeScript implementation and review contract for the
repository. Apply it before reading or editing any `.ts` or `.tsx` file and in
every pull-request review that covers TypeScript. These rules are mandatory by
default; they do not depend on a prompt naming a TypeScript skill.

## Model valid states constructively

- Choose the simplest total type that represents the domain. Use discriminated
  unions when behavior varies by state so illegal states are unrepresentable;
  avoid parallel optional fields that admit contradictory combinations.
- Make state handling exhaustive. Use a `never` check when a switch or mapping
  must cover every variant so a newly added variant fails type checking until
  it is handled deliberately.
- Prefer schema-derived types and `satisfies` over duplicated declarations,
  widened annotations, or unchecked casts. Keep the runtime validator and the
  type it proves under one owner.

## Prove boundaries once

- Treat data from external boundaries as `unknown`, including HTTP payloads,
  environment variables, persisted JSON, storage, and third-party responses.
  Validate exactly once at the boundary that owns the input, then pass the
  resulting typed value inward instead of repeating ad hoc checks.
- Do not use `any`. Do not use type assertions with `as` or non-null assertions
  to manufacture evidence. An assertion is acceptable only when it expresses
  a complete runtime claim already validated at the same boundary and no
  narrower TypeScript construct can preserve that proof.
- Fail closed when an unrecognized value affects authorization, permissions,
  identity, tenancy, or version compatibility.

## Keep interfaces and tests honest

- Use object arguments when parameter ordering is ambiguous or several values
  share a type. Keep public interfaces narrow and name domain concepts rather
  than transporting loosely related primitives.
- Test behavior through the highest stable public seam. Mock only true system
  boundaries, not the module whose contract the test is meant to prove. Cover
  rejected, malformed, unauthorized, and stale inputs when the seam admits
  them.

## Review contract

Standards review reports every material violation of this contract. A narrow
exception must be justified at the use site or in the pull request and must
name the runtime evidence that makes it safe; convenience is not evidence.
