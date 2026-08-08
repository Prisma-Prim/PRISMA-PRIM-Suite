# PRISMA CERT AI UI baseline

## Purpose

This directory preserves the complete interactive frontend mockup approved as
the current working reference for PRISMA CERT AI. It gives local Codex agents a
concrete interface to extend while backend capabilities are implemented in
vertical slices.

Open the baseline locally at:

```text
http://localhost:5173/ui-baseline#/dashboard
```

The hash identifies the mock screen, entity, workflow stage, scenario, and
localization state. Representative deep links include:

- `/ui-baseline#/request/REQ-0280/validation`
- `/ui-baseline#/offers/OFR-2026-142`
- `/ui-baseline#/contracts/CTR-2026-096`
- `/ui-baseline#/documents?scenario=tariff`
- `/ui-baseline#/dashboard?lang=ro`

## Status and authority

The baseline fixes the visual progress of the published prototype as captured
on 2026-08-08 after the responsive and shared status-alignment passes.

It is authoritative for the current visual language, information architecture,
responsive shell, representative screens, and intended interaction shape. It
does **not** close the repository's design approval gate, replace the product
specification, or prove that a workflow is implemented.

All records are synthetic. State transitions, uploads, search, AI answers,
pricing, approvals, signatures, invitations, and persistence are simulated
unless a later GitHub issue explicitly connects the slice to the API.

## Source layout

| Path                                                   | Responsibility                                              |
| ------------------------------------------------------ | ----------------------------------------------------------- |
| `apps/web/src/ui-baseline/PrismaCertUiBaseline.tsx`    | Complete interactive mockup and screen routing              |
| `apps/web/src/ui-baseline/prisma-data.ts`              | Synthetic requests, extracted fields, and coverage fixtures |
| `apps/web/src/ui-baseline/prisma-cert-ui-baseline.css` | Full Atlas Blue visual and responsive system                |
| `apps/web/src/ui-baseline/prisma-logo.ts`              | Self-contained original PRISMA Prim logo asset              |
| `apps/web/e2e/ui-baseline.spec.ts`                     | Baseline rendering and responsive overflow checks           |

The logo is embedded as a data URL so this preserved snapshot cannot silently
lose its source asset. A later production asset pipeline may replace that
representation without changing the visible logo.

## Rules for future agents

1. Read the originating issue, `CONTEXT.md`, relevant ADRs,
   `docs/design/design-exploration.md`, and this file before changing the
   product UI.
2. Treat this baseline as the starting UI reference. Do not replace its shell,
   hierarchy, terminology, or responsive behavior silently.
3. Implement backend-connected behavior one issue at a time. Move synthetic
   data behind explicit adapters instead of mixing API calls into fixture
   constants.
4. Preserve the distinction between confirmed, inferred, missing,
   contradictory, and corrected information.
5. Pricing remains deterministic; AI outputs remain proposals; approvals remain
   explicit human decisions.
6. When a functional slice supersedes a simulated interaction, update the
   baseline status documentation and tests in the same issue.
7. Do not treat the mock coverage screen as acceptance evidence. Acceptance is
   proven by executable tests against the implemented slice.

## Known limitations

The current snapshot intentionally preserves the mockup exactly enough to keep
the design progress recoverable. The latest product audit still applies:

- several actions and state transitions are simulated rather than persisted;
- synthetic records are not a backend domain model;
- some future workflow states are demonstrative;
- complete keyboard-dialog behavior and production localization remain follow-up
  work;
- business correctness comes from product specifications and tests, not from
  hard-coded display data.

These limitations are reasons to implement the next vertical slices, not reasons
to redesign the interface from scratch.
