# UI/UX Design Exploration and Approval Process

## Purpose

PRISMA-PRIM Suite needs a credible, efficient, and distinctive internal B2B interface before production feature work creates patterns that are expensive to replace. Design is therefore selected through an iterative exploration gate, not accepted from a single generated proposal.

This document is the source of truth for design exploration, comparison, approval, and consolidation. The product specification remains the source of truth for product behaviour.

## Product experience brief

The interface serves invited PRISMA-PRIM and BIC collaborators who review requests, evidence, AI proposals, governed prices, quality checks, and approved documents. It must feel:

- trustworthy enough for audit, certification, contractual, and pricing work;
- modern and polished without resembling a generic AI dashboard;
- efficient for repeated operational use without becoming visually oppressive;
- explicit about provenance, uncertainty, missing information, contradictions, approvals, and locked versions;
- understandable to a new Internal User while remaining dense enough for an experienced operator;
- ready for Romanian, Russian, and English copy without layouts that depend on short English labels.

Avoid decorative metric cards, gratuitous gradients, excessive empty space, hidden critical actions, ambiguous icon-only controls, and visual treatment that makes Inferred data look equivalent to Confirmed data.

## Shared comparison fixture

Every concept in a comparison round uses the same synthetic organization, Client Request, source excerpts, Extracted Fields, counts, statuses, and pending actions. Comparable content prevents a concept from appearing stronger merely because it received easier or more attractive data.

The initial round must cover the same three representative screens:

1. A Dashboard that communicates workload, exceptions, and next actions.
2. A Client Request detail that connects the Client, Request Sources, workflow state, and downstream progress.
3. An Analysis review that makes Confirmed, Inferred, Missing, and Contradictory fields, provenance, corrections, and the pricing gate immediately understandable.

Each concept must provide working navigation between those screens and one representative narrow/mobile view showing how its core model adapts. Prototypes use synthetic data only and must not add production API, authentication, persistence, or business workflow logic.

## Initial divergence

The first round contains at least six coherent directions. These names are prompts for genuine structural exploration, not mandatory visual templates:

1. **Institutional assurance:** calm, rigorous, and conventionally trustworthy.
2. **Premium editorial:** refined dossier-like composition with strong typographic hierarchy.
3. **Operations cockpit:** dense queues, exceptions, and rapid actions for frequent use.
4. **Guided workflow:** explicit progress, checklists, and the next safe action.
5. **Document-centric workspace:** source documents and extracted evidence organize the experience.
6. **Human-AI review workspace:** provenance, confidence, contradictions, and human decisions dominate the composition.

A valid set cannot be six palettes on one shell. Each direction must differ meaningfully from the others across at least four of these dimensions:

- navigation architecture;
- page composition and information grouping;
- information density and hierarchy;
- primary interaction model;
- visual expression, typography, spacing, and shape language.

Concept-specific components are allowed during divergence. Prematurely forcing every direction into one component system is prohibited when it suppresses meaningful alternatives.

## Evaluation

Every round is reviewed against the same questions:

- Does the concept create confidence for professional audit and certification work?
- Can an Internal User see priorities and the next action quickly?
- Are source provenance and the four Extracted Field states unmistakable?
- Does the information architecture scale to Offers, Contracts, Documents, and knowledge search?
- Is the density suitable for repeated desktop work while remaining usable on narrow screens?
- Are navigation, forms, tables, and complex states accessible and legible?
- Does the direction have enough personality to avoid a generic generated-dashboard appearance?
- Can future agents extend it consistently without repeatedly inventing new patterns?

Agent critiques and comparison scores are decision support only. They do not select or approve a design.

## Iteration loop

The design gate owns the loop. Each coding round is a separate bounded GitHub issue sized for one fresh Codex context.

1. Complete the current prototype round and attach deterministic desktop and mobile captures.
2. Record product-owner feedback against named concepts and specific elements.
3. If no direction is approved, create the next bounded issue from that feedback. A new round may refine finalists, create hybrids, or reopen divergence with new concepts.
4. Preserve promising concepts until the feedback explicitly rejects them; do not collapse the search space merely to finish faster.
5. Repeat until the product owner explicitly approves one named direction or a precisely described hybrid.

There is no predetermined maximum number of rounds. A later round normally contains fewer, deeper variants, but the process can return to broad divergence when all current directions are unsatisfactory.

## Approval gate

The gate closes only when the product owner explicitly approves:

- navigation architecture;
- information hierarchy and working density;
- overall visual personality;
- the Client Request and Analysis review models;
- treatment of provenance, uncertainty, contradictions, and approvals;
- representative desktop and mobile behaviour.

Issue closure, numerical scores, positive agent commentary, or lack of new feedback never imply approval. The gate issue records the approved concept or hybrid and links the final comparison captures.

## T00 consolidation

After approval, T00 turns the selected prototype into the production reference. It must deliver:

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

Functional UI tickets are blocked until T00 is complete. Later visual changes must extend this system deliberately; they may not silently redesign it page by page.
