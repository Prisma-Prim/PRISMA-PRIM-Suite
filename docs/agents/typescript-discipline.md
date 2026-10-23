# Mandatory TypeScript discipline

**Status:** Approved repository contract

This is the canonical TypeScript implementation and review contract for the
repository. Apply it before reading or editing any `.ts` or `.tsx` file and in
every pull-request review that covers TypeScript. These rules are mandatory by
default; they do not depend on a prompt naming a TypeScript skill.

## Model valid states constructively

- Choose the simplest total type that represents the domain. Use discriminated
  unions where practical to make relevant illegal states unrepresentable; avoid
  parallel optional fields that admit contradictory combinations. Types do not
  replace database constraints or checks on concurrent state.
- Make decisions over closed unions exhaustive. Use a `never` check when a
  switch or mapping must cover every variant. Partial projections and open
  external protocols may instead need an explicit compatibility fallback.
- Keep an owned runtime contract and its type together. Prefer parser-derived
  or schema-derived types, database inference and `satisfies` where they preserve
  useful evidence. A simple interface is appropriate when it does not duplicate
  a validator. Do not introduce a schema library or shared package solely to
  satisfy this preference; compare maintenance and integration costs first.

## Establish and preserve boundary evidence

- Use `unknown` for unparsed JSON and other inputs whose structure is not
  established. Retain platform, driver and schema types to the extent that their
  enforced guarantees apply: environment values already have a string-or-absent
  representation, while an ORM JSON type annotation alone proves no structure.
- Validate and normalize representation at its owning boundary, then pass the
  established type inward. Check domain constraints where their context is
  available, and recheck authorization, versions and mutable state at the
  operation or transaction that relies on them. Avoid repeating a check only
  while its invariant remains established for the unchanged value.
- State compatibility deliberately. An HTTP reader may accept additive fields
  while proving only the fields it consumes; this does not relax the publisher's
  contract. Persisted receipts and historical snapshots need their own format
  and evolution rules. Do not reuse a permissive HTTP reader where discarding
  persisted information would change historical or replay semantics.
- Do not use `any` in domain contracts or allow unchecked values to spread from
  interop code. Keep a necessary library exception local, name its supported
  contract and verify the boundary; it must still satisfy the lint configuration.
  Do not use type assertions with `as` or non-null assertions to manufacture
  evidence. A necessary assertion must express a complete runtime claim backed
  by control flow, validation or an enforced platform/library/lifecycle contract
  that still holds at use. Prefer inference or a guard when it preserves that
  proof. A cast, annotation or comment does not itself validate a value.
- Fail closed when an unrecognized value affects authorization, permissions,
  identity, tenancy, or version compatibility.

## Keep interfaces and tests honest

- Use object arguments when parameter ordering is ambiguous, especially for
  business identifiers. Keep established framework APIs and simple unambiguous
  calls intact. Keep public interfaces narrow and name domain concepts rather
  than transporting loosely related primitives.
- Test behavior through the smallest stable public seam that proves the
  contract. Use REST/PostgreSQL or browser seams when the behavior depends on
  transactions, constraints or browser integration; deterministic calculations
  and decoders can have focused public-function tests. Mock true system
  boundaries or explicit collaborators whose behavior is not under test, and
  retain the integration proof when wiring matters. Cover rejected, malformed,
  unauthorized and stale inputs when the seam admits them.

## Review contract

Standards review reports every material violation of this contract. A narrow
exception must be justified at the use site or in the pull request and must
name the runtime evidence that makes it safe; convenience is not evidence.
