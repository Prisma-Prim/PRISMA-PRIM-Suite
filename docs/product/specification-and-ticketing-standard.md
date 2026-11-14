# Specification and Vertical Ticketing Standard

**Status:** Approved process  
**Version:** 1.0  
**Owner:** Dan Popescu  
**Applies to:** every new PRD, capability spec, epic and implementation issue

## 1. Purpose

This standard turns approved product reasoning into one hierarchy of durable product authorities and narrow implementation contracts.

It combines:

- the PRISMA-PRIM product-readiness requirements in the consolidated decision record;
- Matt Pocock's domain-modeling, to-spec, to-tickets, deep-module, TDD and review disciplines;
- the repository's one-issue, one-fresh-session execution workflow.

The standard protects two outcomes:

1. product intent remains complete enough that an agent does not invent business behaviour;
2. implementation work remains a sequence of demoable vertical tracer bullets rather than horizontal layer tickets.

## 2. Authority hierarchy

| Level                        | Normative purpose                                                         | Tracker representation                             |
| ---------------------------- | ------------------------------------------------------------------------- | -------------------------------------------------- |
| Consolidated decision record | Approved reconciliation rationale and decision history                    | No duplicate issue body                            |
| Product Vision PRD           | Product position, outcomes, boundaries, roadmap and success               | One tracking issue linking the PRD                 |
| Cross-cutting PRD            | Rules that every relevant capability inherits                             | One tracking issue linking the PRD                 |
| Capability PRD               | Complete observable behaviour for one bounded capability or release slice | One parent issue linking the PRD                   |
| Epic                         | Delivery grouping and readiness/frontier tracking                         | GitHub parent issue                                |
| Implementation issue         | One narrow, complete, independently verifiable tracer bullet              | One GitHub issue and one implementation PR         |
| ADR                          | Durable, surprising and costly-to-reverse technical decision              | Repository document linked by affected PRDs/issues |
| CONTEXT.md                   | Canonical domain vocabulary only                                          | No duplicated implementation rules                 |

Each fact has one normative owner. Tracker issues summarize status, dependencies and children; they link to PRDs instead of copying complete specifications.

## 3. Artifact states

### 3.1 PRD states

- **Draft — evidence pending:** approved direction exists, but named business evidence remains open.
- **Ready for product review:** all sections are populated and contradictions are explicit.
- **Approved:** observable behaviour, scope, actors, permissions, lifecycle and acceptance are decided.
- **Superseded:** a named successor owns the behaviour; historical rationale remains available.

A Draft PRD may exist with open evidence. An unresolved point is labelled as a blocker, configuration dependency or deferred choice unless [section 9.1](#91-open-business-details) resolves it; it is never filled with an unsourced assumption.

### 3.2 Delivery states

- **Epic planned:** PRD exists but ticket decomposition is premature.
- **Tickets drafted:** tracer bullets and blocking edges have been reviewed.
- **ready-for-agent:** the issue passes every gate in section 8 and all blockers are closed.
- **in progress:** one fresh agent session owns the issue.
- **done:** its conformant PR is merged and its acceptance evidence exists.

## 4. PRD preparation workflow

### Step 1 — Gather authorities

Read the complete consolidated decision record, applicable PRDs, CONTEXT.md, ADRs, current code boundaries, relevant issues and business interview answers.

**Complete when:** every normative source and known contradiction is listed.

### Step 2 — Grill the domain

Challenge overloaded terms, actor boundaries, Company ownership, legal-entity identity, lifecycle transitions, corrections, versions, exceptions and evidence. Use concrete scenarios. Update CONTEXT.md only when a canonical term is genuinely resolved; create an ADR only for a hard-to-reverse, surprising trade-off.

**Complete when:** the PRD can use one precise vocabulary and unresolved business choices are explicit.

### Step 3 — Write the enriched PRD

Use the mandatory content in section 5. Apply to-spec discipline to the problem, solution, exhaustive user stories, decisions, testing and exclusions. Product Vision and cross-cutting PRDs remain broader than the base to-spec template.

**Complete when:** a context-free agent can explain the intended behaviour, boundaries, open evidence and acceptance journey without consulting the original conversation.

### Step 4 — Review through the selected execution path

Use the path selected by `docs/agents/issue-execution.md`. An eligible low-risk mechanical documentation change uses one combined final pass covering this standard, repository authorities and its originating issue. A PRD content or other product-contract change uses the full path: Standards review first, then Product or Spec review. Resolve findings according to that path before publication.

**Complete when:** every decision is sourced, every open dependency is visible and no second source of truth is introduced.

### Step 5 — Publish the PRD and tracker

Merge the PRD through a documentation PR. Create or update one tracking issue that links the canonical file, records its state and lists downstream epics. Do not label an implementation issue ready-for-agent merely because the PRD exists.

**Complete when:** the canonical file is on main and the tracker points to it.

## 5. Mandatory PRD content

Every Product Vision, cross-cutting or capability PRD includes the sections that apply:

1. authority, status, owner and downstream consumers;
2. problem statement from the user's perspective;
3. desired outcomes and measurable value;
4. solution and product principles;
5. actors and Workspace/Company scope;
6. exhaustive numbered user stories;
7. in scope, out of scope and deferred behaviour;
8. domain concepts, relationships and canonical vocabulary;
9. lifecycle, transitions, versions, corrections and historical rules;
10. invariants and prohibited observable outcomes;
11. permission and approval matrix;
12. Documents, evidence and Activity Log events;
13. configuration, localization and accessibility;
14. integrations, source of truth, synchronization and provider failure;
15. migration and compatibility (until [Railway activation](../agents/railway-activation.md) nothing is deployed, so this covers moving development data and fixtures to the new shape; write no "legacy user" or "existing user keeps" stories and no "old payloads decode" contracts for pre-launch states, see [#1343](https://github.com/Prisma-Prim/PRISMA-PRIM-Suite/issues/1343); its proof is the current constraints on a database migrated from empty, and upgrade proofs from an earlier schema start again from the launch schema, see [#1356](https://github.com/Prisma-Prim/PRISMA-PRIM-Suite/issues/1356));
16. security, privacy, reliability, observability and performance;
17. happy path, exceptions, empty/error/permission states;
18. implementation decisions that are already durable;
19. testing decisions at the highest stable seam;
20. acceptance journey and testable criteria;
21. business evidence still required from Iurie;
22. technical research and ADR dependencies owned by Dan and agents;
23. readiness assessment and explicit blockers.

Sections link to an owning cross-cutting PRD when that document already defines the rule. They summarize only the capability-specific consequence.

## 6. Tracker and epic rules

A PRD tracker or epic contains:

- the canonical PRD link;
- product state and readiness status;
- the observable capability outcome;
- explicit blockers and evidence dependencies;
- child epics or issues;
- deliberately deferred scope.

It does not reproduce the whole PRD. Parent issues remain stable while implementation children progress.

## 7. Vertical implementation issues

Every implementation issue is a **tracer bullet**:

- one narrow but complete user-visible or externally observable outcome;
- all necessary schema, business module, interface, UI and test changes in the same slice;
- demoable or verifiable independently after merge;
- sized for one fresh agent context window;
- blocked only by work that genuinely prevents it from starting;
- implemented through the smallest deep public module interface;
- tested first at the highest stable seam that proves the behaviour.

An issue describes the behaviour to deliver, not a layer-by-layer task list. Titles such as “create Client tables”, “add Project endpoints” or “build Task screens” are horizontal and invalid unless they are part of a complete tracer bullet.

### 7.1 Required issue sections

1. Parent.
2. What to build — one end-to-end outcome.
3. Acceptance criteria — externally observable and testable.
4. Blocked by.
5. Module and public interface.
6. Test seam and red-green-refactor sequence.
7. Demonstration.
8. Explicit exclusions.
9. Required verification.
10. Delivery protocol and retrospective.

Avoid file paths and code snippets because they become stale. Include a decision-rich state machine, type or schema fragment only when prose would be less precise.

### 7.2 Refactor exception

A wide mechanical refactor may use expand → migrate → contract when no independent vertical slice can keep the repository green. Each migration batch declares its blast-radius boundary and blockers. Product behaviour must not be smuggled into the refactor.

## 8. ready-for-agent gates

An implementation issue is ready only when:

1. the observable business outcome is unambiguous;
2. Workspace, Company and legal-entity scope are explicit;
3. actors, permissions and approvals are known;
4. lifecycle, versions, corrections and deletion behaviour are testable;
5. source-of-truth and provider boundaries are explicit;
6. representative examples exist;
7. important failure, empty and permission states are included;
8. security, Activity Log and observability consequences are known;
9. dependencies and migration consequences are identified;
10. acceptance criteria prove the result without testing private implementation;
11. the slice fits one fresh agent session;
12. every blocker is closed.

If any gate fails, keep the item as a PRD dependency, epic or draft ticket. Do not compensate with agent discretion beyond [section 9.1](#91-open-business-details).

## 9. Human and agent decision boundary

Iurie supplies first-tenant business reality, desired functionality, real roles, exceptions and evidence. His questions use ordinary Romanian or Russian business language.

Dan and his agents own:

- product synthesis and PRD structure;
- canonical modeling and technical research;
- architecture, interfaces, test seams and ticket granularity;
- implementation, verification and delivery.

Routine technical validation does not return to Dan for approval.

### 9.1 Open business details

When an issue and its linked PRD leave a business detail open, the agent resolves it from the cahier des charges before escalating (owner decision, 2026-11-07, [#1117](https://github.com/Prisma-Prim/PRISMA-PRIM-Suite/issues/1117)):

1. Search the cahier des charges, Sarcina v1.0. Its 855 requirement texts, in Romanian, are in the `source_text` column of [the traceability CSV](sarcina-v1-traceability.csv); [the reconciliation](sarcina-v1-reconciliation.md) describes its relation to the PRDs.
2. Adopt a provisional, reversible choice that cites the `source_id` and a short quote. Record it in the PR, and in the owning PRD when drafting product work.

When no requirement covers a detail outside the categories below, adopt the conservative MVP default as a provisional, reversible choice and record it the same way, without a citation.

Canonical PRDs, the consolidated decision record and ADRs still win wherever they decide something.

Escalate only what no source supports, even partially:

- prices;
- legal effect and legal clauses;
- certification decisions;
- signing authority and permissions;
- workflow meaning;
- changes to an issue's acceptance criteria.

The escalation proposes the conservative MVP default.

## 10. Execution and completion

Implementation follows docs/agents/issue-execution.md:

- one issue and one fresh session;
- confirm blockers before editing;
- red-green-refactor at the named seam;
- one focused branch and PR;
- the targeted local checks required by `docs/agents/issue-execution.md` and one self-review against Standards and the originating issue before publication;
- complete verification and browser evidence where applicable;
- at most one review round with the blocking-only triage rule;
- squash merge only after green checks and the completed review round.

The next issue starts only after the current frontier issue is merged.
