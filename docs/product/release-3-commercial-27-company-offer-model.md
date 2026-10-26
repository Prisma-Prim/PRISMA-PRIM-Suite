# PRD — Release 3 Commercial Workflow, section 27: Company consulting Offer model

**Status:** Approved provisional product contract — model configuration runtime delivered ([#847](https://github.com/Prisma-Prim/PRISMA-PRIM-Suite/issues/847))

**Owner:** Dan Popescu  
**Contract issue:** [#845](https://github.com/Prisma-Prim/PRISMA-PRIM-Suite/issues/845)

This section normalizes the first bounded D7 outcome under Dan's 2026-10-24
direction to continue [#820](https://github.com/Prisma-Prim/PRISMA-PRIM-Suite/issues/820)
and the standing provisional delegation in [Commercial Workflow §1](release-3-commercial-workflow-prd.md#1-authority-and-purpose).
These are reversible product conventions, not new Iurie evidence or agent approval
of actual Company identities, clauses, prices, fiscal rules or tenant assignments.
The [Governed Documents PRD](governed-documents-prd.md) owns Template governance;
this section supplies one bounded commercial implementation contract.

## 27.1 Problem and complete outcome

The received consulting dossier supplies a useful Offer structure, but neither a
reusable approved model nor an actor who can approve it in the application.
Hard-coding received prose would turn evidence into business authority. The blank
[candidate mapping](commercial-candidate-models-2026-10.md) remains preparation.

An explicitly assigned Company model editor records a complete immutable model
Version. A separately assigned model approver reviews its entire content and
approves or rejects that exact Version. Authorized users can reopen its content,
decision and history, distinguish the currently available approved Version from a
pending successor, and deliberately withdraw it from new use. No model is seeded
or approved by installation. This is independently useful configuration; Offer
generation and price/tax compatibility are a separate D7 continuation.

## 27.2 Stories and boundary

1. An assignment administrator explicitly enables or revokes editing and approval
   independently, without changing any captured existing grant.
2. An editor enters the issuing Company's intended identity, Romanian consulting
   content and explicit framework editions without copying historical dates.
3. An editor corrects content through a full successor Version and preserves the
   complete former content and decision.
4. An approver reviews and decides the exact pending head, with a recorded basis;
   holding ordinary Offer approval never grants model approval.
5. A reader distinguishes source provenance, human approval and availability for
   new use; none implies a price, sent Offer, signature or certification authority.
6. An approver withdraws the active Version without erasing its earlier approval
   or rewriting an artifact that used it.
7. A user retries an uncertain command identically without duplicating a Version,
   decision or event, and receives no replay after authority is revoked.
8. A user reopens exact historical content after restart or a newer approval,
   while another Company or Workspace cannot infer its existence.

There is one model identity per Company with the fixed code
`INTEGRATED_MANAGEMENT_CONSULTING_RO` and language `ro`. The code names this bounded
family, not a Service Definition, Company Service Offering, certification ability
or first-tenant legal identity. No catalogue row or permission is fabricated.
Other services, Companies and languages are not alternate variants of this row.

## 27.3 Complete content and provenance

Each immutable Version records the following complete input. Unknown keys are
invalid; no script, HTML, expression, include, URL fetch or uploaded file executes.
Text is stored exactly as submitted and rendered as escaped plain text with
readable line breaks. Required text must contain a non-whitespace character.

| Content             | Contract                                                                                                                                                                                                                                                           |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Source kind         | Exactly `ILLUSTRATIVE` or `COMPANY_SUPPLIED`, explicitly chosen per Version; no default or silent promotion. The latter is a human source declaration, not proof of legal validity.                                                                                |
| Source description  | Required plain text, 1–500 characters, identifying the editor's basis without requiring an external document or exposing it to diagnostics.                                                                                                                        |
| Issuer              | Legal name 1–300, tax identifier 1–100, legal address 1–1,000 and optional contact details up to 1,000 characters. These are human-entered model values, not a mutation or independent verification of the Company record.                                         |
| Service title       | Required Romanian plain text, 1–300 characters.                                                                                                                                                                                                                    |
| Frameworks          | 1–10 ordered entries, each with a name 1–200 and explicit edition 1–100 characters. No automatic edition replacement or copied historical choice.                                                                                                                  |
| Narrative sections  | Exactly introduction, provider profile, scope, objectives, assessment guidance, methodology, deliverables, realization conditions, payment conditions and closing rationale; each required, 1–4,000 characters.                                                    |
| Planned-stage annex | Exactly eighteen ordered rows for this one source-shaped Offer structure; each has title 1–200, planned activity 1–1,000 and intended result 1–1,000 characters. Rows describe proposed work, never required software stages, performed Tasks or verified results. |

The complete serialized content is at most 64 KiB UTF-8. No number, issue date,
Client, price, tax rate, tax total, payment amount/share, signatory mandate or legal
effect is inferred from a source example. Narrative payment wording is reviewed
text, not a machine-readable payment schedule or calculation. A later Offer
supplies its own recipient, scope and financial facts under its own contract.

The source's eighteen Offer rows remain distinct from the thirteen Contract and
Project planning rows. Approval confirms the human's intended reusable values,
including editions and wording; it never chooses which conflicting original date
was legally correct. Originals and candidate evidence remain unchanged.

## 27.4 Independent authority

The [authorization owner §8](tenant-company-client-authorization-prd.md#8-initial-permission-families)
defines two new explicit Company-scoped captured v1 bundles:

| Bundle                       | Exact permissions                                                                                 |
| ---------------------------- | ------------------------------------------------------------------------------------------------- |
| Company Offer Model Editor   | `commercial.offer.model.read`, `commercial.offer.model.version.create`                            |
| Company Offer Model Approver | `commercial.offer.model.read`, `commercial.offer.model.decide`, `commercial.offer.model.withdraw` |

Every operation requires current active Workspace membership and independently
authorized active Company context. It requires the live captured v1 assignment
for its permission; absent/null/unknown captures fail closed. The existing
administrator with `company.assignment.manage` grants/revokes each for an active
same-Workspace membership and active Company through ordinary administration.
No role title, Workspace ownership, Director, Offer Preparer/Approver, pricing or
Document grant substitutes. The two bundles grant no Company context, Client,
Opportunity, price/cost, Offer/Contract, Document content, Activity read or
administration authority. There is no migration backfill or automatic assignment.

The same person may hold both explicit grants and review their own submission;
this provisional MVP does not invent a mandatory two-person business rule.
Editing alone never decides, and approval alone never edits. Future Offer
generation must establish its own opt-in model-selection authority; ordinary
Offer read does not silently gain access to this configuration catalogue.

## 27.5 Versions, decisions and availability

The root has server-established id, Workspace, Company, fixed code/language,
monotone revision, head Version and optional active approved Version. Content
Versions start at one and increase monotonically. Each records predecessor,
complete content, source kind/description, creator membership/Internal User and
server instant; content never changes. Decisions are separate immutable rows
against one exact Version, with outcome `APPROVE` or `REJECT`, a required basis
1–2,000 characters, actor membership/Internal User and server instant. No decision
means `PENDING`; at most one decision exists per Version.

Only the pending head can be decided. A successor may replace a pending,
rejected or approved head; this never changes the predecessor's content or
decision. Creating a successor leaves the active approved Version available.
Approving the head atomically selects it for new use and supersedes the former
selection. Rejection leaves the selection unchanged. Withdrawal names the exact
currently active Version and requires a reason 1–2,000 characters; it clears the
selection, preserving a separate immutable actor/time/reason record and all prior
decisions. It may withdraw an active Version while a newer head is pending.
The same withdrawn Version cannot be reactivated; a new Version and new approval
are required. No delete or in-place correction exists.

Availability for new use is distinct from the recorded decision. A historical
approved Version is readable but unavailable after replacement/withdrawal. A
later consumer must check current selection in its mutation transaction. Loss of
model authority prevents new commands and replay disclosure but never rewrites a
previously produced Offer; its separately authorized frozen content stays owned
by the Offer boundary. This slice creates no such Offer yet.

## 27.6 Commands, reads and atomicity

The Company-owned public boundary supports:

- submit a complete first/successor Version with `expectedModelRevision` (zero
  only for initial creation), complete content and a request idempotency key;
- decide the exact Version id and displayed number, expected root revision,
  outcome and literal basis;
- withdraw the exact active Version id and displayed number, expected root
  revision and literal reason;
- read root/head/active-selection summaries, one exact Version with its full
  decision/withdrawal facts, and bounded stable Version history.

Every material command increments root revision once. Version submission alone
allocates a new Version number. Read history uses a stable descending Version
cursor, default 20/max 50, with no hidden Company-wide list, search or count.
It returns summaries and explicit next cursor; full text is read by exact id.
An empty configured Company returns an explicit empty root/catalogue state.

Idempotency is scoped by Workspace, Company and acting membership, with one
shared namespace across model commands. The exact fingerprint includes command
kind, model/Version identity, expected revision and all literal inputs. Current
membership, Company and required grant are revalidated before receipt disclosure.
An exact replay returns the original result before stale/head checks, even after
later Versions, without a second event. Changed intent under the key conflicts.
There is no unchanged-content no-op: deliberate resubmission creates a Version.
Re-deciding/withdrawing under a new key refuses the unavailable transition.

One transaction protects authority, root/Version/decision/selection, receipt and
minimal Activity. Serialize with existing membership/Company/grant revocation
owners, then the model root in a consistent lock order; do not open nested public
transactions while holding their locks. Concurrent first submissions at revision
zero yield one root/Version; same-key concurrency converges. Competing commands
at one revision yield one material result. A decision versus successor and an
approval versus withdrawal have deterministic valid serial outcomes, never two
active selections. Final-write failure rolls back everything, including numbers
and events. Composite constraints reject foreign Workspace/Company references;
database guards protect immutable content, decisions and withdrawals.

Missing identity returns 401; invalid current context/grant returns 403. Unknown
or foreign exact Versions use one safe unavailable response without existence
disclosure. Invalid content returns 400; stale revision, changed key intent,
non-head/decided Version and unavailable selection return distinct safe 409
codes. Unknown kinds/versions never fall back to a supported mode. Denied,
invalid, conflicted and rolled-back commands create no receipt or success event.

## 27.7 Activity, privacy and compatibility

Record one event per committed `offer_model.version.created`,
`offer_model.version.approved`, `offer_model.version.rejected` or
`offer_model.version.withdrawn`, with exact model/Version target, Workspace,
Company, actor and server time. Metadata is limited to fixed model code, Version
number and resulting revision. No issuer/contact, framework, text, reason, cost
or price enters events or diagnostics. Assignment events use the existing
Company grant/revoke convention with bundle label only.

These model events are recorded internally but are not projected through the
commercial Activity endpoint or dashboard in this slice. Model history exposes
attributed business decisions under live model read; this grants no Activity
read. The [Activity owner](activity-log-accountability-prd.md) retains its separate
boundary. No existing event projection, count or filter expands implicitly.

An additive reviewed migration creates only empty Company-owned configuration,
immutable content/decision/withdrawal and command records. All existing grants,
Offers, internal-estimate drafts, illustrative Template bindings, representation
bytes/checksums, Contracts, Documents and Project plans remain unchanged. No
configuration approval upgrades their provenance or permits an internal draft to
execute. There is no dependency on Clerk setup, a file provider or new packages.

## 27.8 Interface and acceptance

Use a bounded Company configuration section in the accepted Prisme shell with
ordinary explicit assignment administration. Show the fixed service/language,
source kind, current active approval and pending head distinctly. The editor
reviews a complete plain-text form; an explicit copy-from-Version action may
prefill a successor without changing its source. The reviewer opens all content,
enters a basis and deliberately approves/rejects. Withdrawal requires its reason.
Use visible labels, not UUID entry. Exact history preserves original content,
author, decision and availability. No screen claims legal validation or sends
anything. An illustrative model remains visibly illustrative after approval.

Provide loading, empty, invalid, unavailable, denied, stale, uncertain and
confirmed states. Preserve literal drafts on correctable errors and the exact
body/key for uncertain retry; changing intent requires a new command. Disable
conflicting sibling commands while one is pending/uncertain. Scope/session or
live grant changes retire protected content, drafts and late responses. Respect
existing localization, shared Select, focus/keyboard and desktop1440/narrow390
contracts; UI locale changes never translate stored model text or identifiers.

The runtime child must prove through public authenticated REST/PostgreSQL:
complete create/restart/exact read; approval and rejection with exact attribution;
successor preserves active approval and history; replacement and withdrawal;
malformed/foreign/unknown/stale/decided refusal; every independent grant and
revocation boundary; exact/changed/concurrent replay; first-create and competing
decision/successor/withdrawal races with deterministic barriers; membership and
grant loss in both orders; final-write rollback; scoped constraints and immutable
storage; and unchanged existing Offer/Contract baselines. A registered real App
journey at 1440/390 proves administration, entry, review, approval, successor,
withdrawal, reload/history, literal uncertain retry and scope/access retirement.
Synthetic models alone are used in repository fixtures and evidence.

## 27.9 Readiness and deferred work

The narrow configuration/approval runtime is delivered by
[#847](https://github.com/Prisma-Prim/PRISMA-PRIM-Suite/issues/847). No new dossier or actual legal approval is
needed to implement and demonstrate it safely. Real configured content and its
human approval remain explicit deployment/user actions, not installation effects.

The separate [§28 D7 generation contract](release-3-commercial-28-model-offer-generation.md)
defines exact model selection, per-Offer population, frozen representations and
explicit human net/tax declaration from a selected approved Estimate Version.
Its non-official rehearsal runtime remains separate; it cannot simply remove
§26's internal-only flag. Official issuance needs independently
configured Offer numbering (D11); Contract content/annex, separate numbering,
received scans and external signing/acceptance follow D8/D12/D9/D10. None is
implemented or approved by this model configuration contract. No generic editor,
cross-language model conversion, arbitrary template scripting, clause library,
certification outcome, historical price reconstruction or provider integration
is a prerequisite for this bounded outcome.
