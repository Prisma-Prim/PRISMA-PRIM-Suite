# PRD — UX Architecture, Accessibility, Localization and Configuration

**Status:** Draft — role and terminology evidence pending  
**Version:** 0.1  
**Owner:** Dan Popescu  
**Decisions:** DEC-193–DEC-211

## 1. Problem statement

Users work across Clients, Companies, Projects, visits, audits, approvals, Documents and deadlines in several languages and on different screen sizes. A visually coherent mockup alone does not guarantee correct role journeys, safe context, accessible interaction, failure recovery or historically stable configuration.

## 2. Solution

Use the Client dossier as the central operational view, keep Workspace and Company context visible, prioritize role-based action queues and reveal complexity progressively.

Deliver responsive web, WCAG 2.2 AA intent, localization from Release 1, stable internal semantics, bounded typed configuration, durable event-derived notifications and governed dashboard metrics.

The accepted Prisme & lumière direction in [#225](https://github.com/Prisma-Prim/PRISMA-PRIM-Suite/issues/225) is the preferred evolving visual reference for its production slices. Atlas Blue in /ui-baseline remains a recoverable synthetic snapshot. Neither reference proves implemented behaviour or freezes the final design.

On 2026-09-26, Dan confirmed Prisme as the current application design and removed the user-facing Classic rollback option (#426). Prisme navigation must not offer a switch to Classic. Explicit legacy Classic URLs remain compatibility coverage; their return to Prisme remains available. This does not remove business owners, existing regression coverage or the recoverable /ui-baseline snapshot.

## 3. User stories

1. As a user, I want the Client overview to answer my immediate operational questions.
2. As a multi-Company user, I want the active Company visible before I act.
3. As an authorized manager, I want a consolidated view with explicit ownership.
4. As a role-specific user, I want my next actions and exceptions prioritized.
5. As a mobile user, I want essential visit and audit actions usable without overflow or hidden controls.
6. As a keyboard or assistive-technology user, I want perceivable, operable and understandable journeys.
7. As a Romanian, Russian, French or English user, I want the interface and Documents in the appropriate language.
8. As a domain user, I want familiar terminology without changing stable business meaning.
9. As an administrator, I want bounded settings with validation and preview.
10. As a reviewer, I want high-impact configuration changes attributable and historically reproducible.
11. As a user, I want notifications derived from real business events, so that reminders survive refreshes and outages.
12. As a manager, I want dashboard metrics with explicit definitions and scope.
13. As a bulk-work user, I want preview and confirmation, so that one action cannot silently affect the wrong records.
14. As a user facing an error or permission denial, I want a clear recovery path without hidden data leakage.

## 4. Navigation architecture

- Client dossier as the primary operational hub;
- persistent Workspace/Company context;
- All Companies as an authorized consolidated view, never an ownership value;
- capability navigation that preserves Client/Project context;
- role-based action queues for approvals, exceptions, overdue work and failed integrations;
- progressive disclosure for advanced detail.

## 5. Required UI states

Every delivered journey specifies:

- initial loading and delayed loading;
- empty and first-use;
- success and confirmation;
- validation and business-rule conflict;
- permission denial;
- record not found without metadata leakage;
- provider unavailable, retrying and degraded mode;
- stale/concurrent change;
- partial data, unknown and unverified state;
- archived/historical state;
- mobile and narrow-screen behaviour.

## 6. Responsive and accessibility rules

Responsive web precedes native mobile. Named acceptance viewports cover desktop, tablet and phone where the journey is relevant.

Target WCAG 2.2 AA through semantic structure, keyboard operation, focus visibility, contrast, text resizing, touch targets, accessible names, error association and non-color-only meaning.

Generated Documents have separate accessibility requirements where applicable.

## 7. Localization and terminology

Localization infrastructure begins in Release 1. Stable internal concepts, tenant labels and translations are separate:

- internal semantics remain stable;
- Romanian (`ro`) is the interface default when no valid explicit choice exists, regardless of browser or operating-system language;
- the offered interface choices are Română (`ro`), Русский (`ru`), Français (`fr`) and English (`en`);
- a user's explicit supported choice controls the interface until the user changes it; an unsupported or invalid saved choice falls back to Romanian;
- interface strings, accessible names, errors, dates and numbers follow the chosen interface locale;
- a missing required translation falls back to Romanian, never to a raw translation key or silently to English, and release checks report the missing translation;
- approved tenant terminology may override bounded labels;
- Company-specific wording may vary without changing rules;
- historical Documents preserve the language and wording used at generation time.

The interface locale, Document language, Client communication language and Company default language are distinct. Changing the interface locale does not translate or mutate business content, prices, currencies, timezone rules, permissions or stored canonical identifiers, and it preserves work already entered in the current journey. Technical documentation, code and identifiers remain English. `/ui-baseline` remains an unchanged, recoverable snapshot and does not prove production localization.

Dates, numbers and sorting follow the chosen interface locale while currencies, timezone rules and canonical values remain governed by their business context. Localization acceptance proves that:

- French, English or Russian browser preferences still start in Romanian without a valid explicit choice;
- every offered interface choice can be selected by keyboard and presents its own accessible language name, including Romanian and French diacritics and Russian Cyrillic;
- an explicit supported choice survives navigation and reload, while an unsupported saved choice falls back to Romanian;
- switching languages preserves entered work and business meaning;
- required translation coverage fails release checks when a key is missing.

## 8. Configuration

Configuration is typed and bounded. Workspace defaults and Company overrides are explicit. High-impact changes provide:

- validation;
- impact explanation;
- preview where possible;
- effective date/version when historical meaning changes;
- attribution through Activity Log;
- safe rollback or new version rather than silent rewriting.

Tenant names never appear in conditional code.

## 9. Notifications

Notifications derive from durable business events and rules. They have recipient, reason, Company/Workspace scope, channel, schedule, escalation, deduplication and disposition.

In-app delivery is primary for governed work. Email and Calendar channels are capability-specific and may fail without losing the underlying obligation.

## 10. Dashboards

Every metric defines:

- business meaning;
- included/excluded records;
- Workspace/Company scope;
- time window and timezone;
- currency treatment;
- freshness;
- permission;
- drill-down or explanation.

Dashboards never create an independent source of truth.

## 11. Bulk actions

Bulk work is permission-checked per target, previewable, partially failure-aware, idempotent where retried and attributable. Sensitive actions may require confirmation or approval.

## 12. Implementation decisions

- evolve the #225 production slices from the accepted Prisme & lumière reference;
- preserve /ui-baseline as a recoverable synthetic snapshot;
- keep user-facing text localization-ready;
- centralize semantic design primitives without building a universal design platform;
- keep business state server-authoritative.

## 13. Testing decisions

- browser tests for complete role journeys rather than isolated screenshots;
- named desktop/mobile viewports and overflow checks;
- keyboard and automated accessibility checks plus targeted manual review;
- Romanian, Russian, French and English representative content;
- long labels, empty data, large data and provider failures;
- permission-safe not-found and denial behaviour;
- deterministic screenshot evidence through ignored test output.

## 14. Acceptance journey

Users with Workspace and Company roles sign in, understand their context, find a Client, complete their next action and recover from an error on desktop and phone. Romanian, Russian, French and English labels preserve stable meaning. A high-impact configuration change is previewed and attributed. Notifications and dashboard numbers link back to governed business records and remain permission-safe.

## 15. Evidence dependencies

- first three daily actions by role;
- Client overview questions;
- consolidated versus Company-only situations;
- mobile activities;
- approval and exception queues;
- confusing terminology and current errors;
- language needs and Company-specific terms;
- useful reminders, escalation and noise limits;
- governed dashboard questions and definitions.

Question source: S11.

## 16. Technical dependencies

- frontend localization architecture;
- accessibility tooling and manual-review process;
- configuration storage/versioning model;
- durable notification scheduling;
- metric query and caching design;
- browser viewport/evidence harness.

## 17. Readiness

This PRD is ready to govern Release 1 UI specifications. Detailed tickets remain blocked on role journeys, terminology and metric evidence for the affected slice.
