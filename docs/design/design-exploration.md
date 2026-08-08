# Historical UI/UX Design Exploration

> **Historical record:** This document preserves the exploration process used by
> issues #2 through #10 and the superseded T00 consolidation issue #11. Those
> issues are not dependencies of new implementation tickets. Current work starts
> from the evolving Atlas Blue baseline documented in
> [`ui-baseline.md`](ui-baseline.md) and proceeds through narrow vertical feature
> issues.

## Purpose

The exploration began from the premise that PRISMA-PRIM Suite needed a credible, efficient, and distinctive internal B2B interface before production feature work created patterns that were expensive to replace. It therefore explored multiple generated proposals rather than accepting the first one.

This document records the former design exploration, comparison, approval, and consolidation model. It is not an active gate. The product specification remains the source of truth for product behaviour, and the Atlas Blue baseline is the preferred current UI reference.

## Product experience brief

The brief described an interface for invited PRISMA-PRIM and BIC collaborators who review requests, evidence, AI proposals, governed prices, quality checks, and approved documents. The intended qualities were:

- trustworthy enough for audit, certification, contractual, and pricing work;
- modern and polished without resembling a generic AI dashboard;
- efficient for repeated operational use without becoming visually oppressive;
- explicit about provenance, uncertainty, missing information, contradictions, approvals, and locked versions;
- understandable to a new Internal User while remaining dense enough for an experienced operator;
- ready for Romanian, Russian, and English copy without layouts that depend on short English labels.

The exploration avoided decorative metric cards, gratuitous gradients, excessive empty space, hidden critical actions, ambiguous icon-only controls, and visual treatment that made Inferred data look equivalent to Confirmed data.

## Shared comparison fixture

Every concept in a comparison round used the same synthetic organization, Client Request, source excerpts, Extracted Fields, counts, statuses, and pending actions. Comparable content prevented a concept from appearing stronger merely because it received easier or more attractive data.

The initial round covered the same three representative screens:

1. A Dashboard that communicates workload, exceptions, and next actions.
2. A Client Request detail that connects the Client, Request Sources, workflow state, and downstream progress.
3. An Analysis review that makes Confirmed, Inferred, Missing, and Contradictory fields, provenance, corrections, and the pricing gate immediately understandable.

Each concept provided working navigation between those screens and one representative narrow/mobile view showing how its core model adapted. Prototypes used synthetic data only and did not add production API, authentication, persistence, or business workflow logic.

## Initial divergence

The first round contained six coherent directions. Their names prompted genuine structural exploration rather than prescribing visual templates:

1. **Institutional assurance:** calm, rigorous, and conventionally trustworthy.
2. **Premium editorial:** refined dossier-like composition with strong typographic hierarchy.
3. **Operations cockpit:** dense queues, exceptions, and rapid actions for frequent use.
4. **Guided workflow:** explicit progress, checklists, and the next safe action.
5. **Document-centric workspace:** source documents and extracted evidence organize the experience.
6. **Human-AI review workspace:** provenance, confidence, contradictions, and human decisions dominate the composition.

The set was not intended to be six palettes on one shell. Each direction differed meaningfully from the others across at least four of these dimensions:

- navigation architecture;
- page composition and information grouping;
- information density and hierarchy;
- primary interaction model;
- visual expression, typography, spacing, and shape language.

Concept-specific components were allowed during divergence so that one premature component system did not suppress meaningful alternatives.

For agent execution, the initial round was split into a neutral design-lab harness, one bounded issue per direction, and a final comparison issue. Direction issues proceeded independently after the harness and remained isolated to avoid turning the first completed concept into a shared shell for the others.

## Evaluation

Every round was reviewed against the same questions:

- Does the concept create confidence for professional audit and certification work?
- Can an Internal User see priorities and the next action quickly?
- Are source provenance and the four Extracted Field states unmistakable?
- Does the information architecture scale to Offers, Contracts, Documents, and knowledge search?
- Is the density suitable for repeated desktop work while remaining usable on narrow screens?
- Are navigation, forms, tables, and complex states accessible and legible?
- Does the direction have enough personality to avoid a generic generated-dashboard appearance?
- Can future agents extend it consistently without repeatedly inventing new patterns?

Agent critiques and comparison scores served as decision support only; they did not select or approve a design.

## Iteration loop

The former design gate used the following loop, with each coding round represented by a separate bounded GitHub issue sized for one fresh Codex context:

1. The current prototype round was completed with deterministic desktop and mobile captures.
2. Product-owner feedback was recorded against named concepts and specific elements.
3. If no direction was approved, the feedback shaped a new bounded issue that could refine finalists, create hybrids, or reopen divergence with new concepts.
4. Promising concepts were preserved until feedback explicitly rejected them so the search space did not collapse merely to finish faster.
5. The loop repeated until the product owner explicitly approved one named direction or a precisely described hybrid.

The process had no predetermined maximum number of rounds. A later round could contain fewer, deeper variants or return to broad divergence when all current directions were unsatisfactory.

## Historical approval gate

The gate would have closed only when the product owner explicitly approved:

- navigation architecture;
- information hierarchy and working density;
- overall visual personality;
- the Client Request and Analysis review models;
- treatment of provenance, uncertainty, contradictions, and approvals;
- representative desktop and mobile behaviour.

Issue closure, numerical scores, positive agent commentary, or lack of new feedback did not imply approval. The gate issue was expected to record the approved concept or hybrid and link the final comparison captures.

## Superseded T00 consolidation

The former plan called for T00 to turn an approved prototype into the production reference by delivering:

- semantic design tokens and typography;
- canonical application shell, navigation, layouts, and responsive behaviour;
- production-ready primitives and recurring business components;
- patterns for tables, forms, documents, status, provenance, Extracted Field states, approvals, and feedback;
- empty, loading, error, success, disabled, and permission-denied states;
- accessibility requirements and keyboard behaviour;
- approved desktop and mobile reference captures;
- browser-based visual verification at named viewports;
- frontend-specific agent instructions and a visual review checklist;
- removal or isolation of rejected prototype code so it cannot become an accidental dependency.

This consolidation step was superseded before it became an implementation dependency. Production UI tickets now evolve Atlas Blue deliberately in bounded vertical slices while preserving `/ui-baseline`; they may not silently redesign unrelated parts of the application.
