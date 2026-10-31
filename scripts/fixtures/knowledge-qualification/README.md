# Knowledge qualification fixtures

**Status:** Authored synthetic mechanics examples; no provider output or real pilot.

`kit.bundle.json` transcribes the complete literal content and expectation JSON
blocks from the [synthetic preparation kit](../../../docs/product/ai-knowledge-synthetic-kit/README.md)
at canonical commit `ecb7edf42e90a39d44bda2e01c2cc607ac1a4b4e`, inside the
explicit `prisma-prim-knowledge-bundle/v1` wrapper. The original source and
expectation identities, Versions, text, ordering and authored fictional events
remain unchanged. They are operator-owned oracles, not candidate instructions.

`kit.observations.json` contains 22 separately authored literal observations,
labelled `authored_fixture`. These fixed examples demonstrate mechanical
qualification, including inferred, missing and contradictory fields and the
separately supplied fictional acceptance, correction and rejection events.
They are not captured inference, measured accuracy, authenticated human review,
real source admission or real access grants. Runtime code must never generate
candidate observations by copying the expected answers.

For example, K01 requests current evidence. Its authored observation records
`S-RO-INVENTORY`, Version `2`, locator `p1`, and this complete literal quote:

> În atelierul fictiv Lumen sunt patru cutii de mostre.

Changing that quote or using Version `1` must be reported as a mechanical
mismatch; a correct tuple alone proves no semantic understanding or production
AI readiness. K19 deliberately retains an initial inferred `5` and the supplied
fictional correction to confirmed `4`; it must not become an initially correct
proposal. K20 supplies a rejection and no final value.

Run the committed examples with an unused output filename in an existing writable
directory; the tool never overwrites a prior result:

```bash
node scripts/knowledge-qualification.mjs prepare --bundle scripts/fixtures/knowledge-qualification/kit.bundle.json --out /tmp/knowledge-contexts-001.tar
node scripts/knowledge-qualification.mjs evaluate --bundle scripts/fixtures/knowledge-qualification/kit.bundle.json --observations scripts/fixtures/knowledge-qualification/kit.observations.json --out /tmp/knowledge-result-001.tar
```

Each output is one private USTAR file containing `result.json` and `report.md`.
Preparation contains candidate-safe contexts only; evaluation consumes the
separately supplied observations and preserves findings instead of claiming AI
quality or real authorization. Use `--help` for the closed command boundary.
