# Commercial Intake responsibility candidates

Status: Non-canonical static supplement. Candidates, not defects or an automatic refactoring recommendation.
Source: Prisma-Prim/PRISMA-PRIM-Suite commit `92f502415999f33ec2f056ba0871706892bf7fd3`.
W = `apps/web/src/commercial-intake/CommercialIntakeWorkspace.tsx`. Test filenames below are in the same directory. Repository and TypeScript policies were read first.

Shared ownership matters: W:593 owns authenticated requests; W:651 access rejection; W:731 list abort/revision/view supersession; W:799 scoped cleanup; W:894/W:921 Client projection retirement/rereads; W:982/W:1054 command retirement on authority changes. All candidates retain these operations, protected-work coordination and draft/retry state in the workspace. No file-length quota motivates these candidates.

## 1. Owned HTTP response contracts

Evidence: response types W:75/W:88, list/detail readers W:3127/W:3184/W:3232, command-correlated receipt readers W:3298/W:3365. Callers W:1563/W:1748 decide settlement versus uncertainty.

Boundary: one local module owning response types and readers. Preserve unknown inputs, additive HTTP compatibility, exact receipt fields and identity/version/command correlation. Keep publication, retries and adjacent Client projection/date-input helpers with their existing owners. Preserve existing type exports consumed by fixtures.

Public seam/proof prerequisite: CommercialIntakeWorkspace.test.tsx:529/:556/:589/:616 checks absent/contradictory fields, canonical times and malformed next actions through rendering and fetch. CommercialIntakeWorkspace.outcome.test.tsx:439 retains exact retries after malformed success; CommercialIntakeWorkspace.stage.test.tsx:825 rejects inconsistent history. Inventory consumers, then prove the same accepted/rejected payload and replay behaviors through the workspace seam.

Cost/risk: low to medium; imports/type ownership, possible cycles or changed acceptance semantics. Benefit to investigate: inspect boundary proof without orchestration.

## 2. Loaded Request list presentation

Evidence: W:2595 already has a callback-based RequestList; W:2648 restricts by dossier identity; W:2784 matches only loaded subject/title/responsible name. W:2037 masks obsolete Client projections before W:2472 supplies display props.

Boundary: relocate RequestList and its matching helper as one presentation module. Keep filter/view/restriction state, pagination and selection intent in the workspace. Preserve focus ref, localization and mount behavior; pass approved display data without actor/identity or unmasked projections.

Public seam/proof prerequisite: CommercialIntakeWorkspace.test.tsx:2395 checks clearing/focus, :2415 filter retention through detail navigation, :1595 ignored-abort late replies, :2439 unchanged capture draft/body/key while filtering. CommercialIntakeWorkspace.client-navigation.test.tsx:297 checks dossier identity, server order and focus. Require unchanged behavior and no-extra-fetch assertions.

Cost/risk: low; a function boundary already exists. Risks: changed mount/focus behavior, moving parent state or bypassing authority masking. Benefit to investigate: inspect list display without editor details.

## 3. Controlled capture form presentation

Evidence: W:2336 renders controlled capture fields and Client search/selection; W:1102 owns updates, W:1106 search cancellation/authority, W:1919 serialization, idempotency identity, uncertain retry and activity/list sequencing.

Boundary: a controlled form view taking values, display state and explicit field/query/search/submit callbacks. Keep draft storage, query-change selection retirement, pending/protected work and async operations in the workspace. Give the view no identity or transport capability.

Public seam/proof prerequisite: CommercialIntakeWorkspace.localization.test.tsx:55 preserves fields/Client selection through four locales and checks serialization. CommercialIntakeWorkspace.test.tsx:739 clears selection after query change; :1738 preserves uncertain capture across view changes. CommercialIntakeWorkspace.requested-request.test.tsx:420/:461 protects pending/uncertain capture before shell navigation. Require exact body/key, labels, selection retirement and ordering unchanged; locale changes must not create another state owner.

Cost/risk: low to medium; a deliberate prop contract is needed. Risks: generic setters replacing meaningful callbacks or state outliving captured authority. Benefit to investigate: inspect capture/localization without editors.

Limits: targeted static reading of one module and its existing public tests; no measured context benefit or exhaustive review. No source edits, tests/builds/repository checks, issues or PRs were performed for this supplement. Implementation needs separately authorized scope and fresh behavioral proof.
