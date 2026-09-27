# PRD — Release 1 Shared Client

**Status:** Draft — Company Director dossier delivered; governed duplicate-resolution contract approved for one vertical slice
**Version:** 0.6
**Owner:** Dan Popescu  
**Parent authorities:** Product Vision; Tenant, Company, Shared Client and Authorization PRD; Activity Log PRD

## 1. Problem statement

The same real Client may work with PRISMA-PRIM, BIC and ECG, while commercial and operational activity must remain Company-scoped. Duplicating the Client per Company fragments identity; sharing every field exposes confidential relationships. One Client group may also contain several exact parties that receive different Offers, Contracts, invoices or credentials.

## 2. Release 1 outcome

Authorized users can create, find, view and update one shared Client dossier, maintain exact legal entities and establish separate Company relationships. Duplicate candidates receive human review. Company-scoped users see shared identity plus only their authorized relationship/activity.

## 3. User stories

1. As an authorized user, I want to find a Client before creating one.
2. As a user, I want to create a minimal shared Client with provenance.
3. As a user, I want to add the exact legal entity needed for later legal acts.
4. As a Company user, I want to establish my Company's relationship without duplicating the Client.
5. As a user, I want general Contacts distinguished from Company-specific relationship data.
6. As a reviewer, I want possible duplicates proposed without automatic merge.
7. As an authorized resolver, I want to decide a duplicate while preserving identity history.
8. As a Company-scoped user, I want hidden Company activity protected.
9. As a user, I want archived Clients excluded by default but deliberately recoverable.
10. As a manager, I want the Client overview to show authorized Projects, Tasks and Documents as later Release 1 slices arrive.

## 4. In scope

- Client Account identity and active/archive state;
- one primary and additional Client Legal Entities;
- Contacts at the correct shared or relationship scope;
- Client–Company Relationship;
- typed identifiers and addresses with provenance;
- search by initial business identifiers;
- duplicate-candidate review without automatic merge;
- authorized Client list and central overview;
- critical Activity Log events owned by this capability.

## 5. Out of scope

- full historical bulk migration;
- semantic search;
- external Client portal;
- automatic registry validation unless separately approved;
- Document-backed duplicate matching, comparison or identity basis until the Document Registry authorization model is delivered;
- universal corporate-group modeling;
- destructive merge that erases prior references.

## 6. Invariants

1. A Client Account belongs to one Workspace.
2. Legal Entities and relationships remain in that Workspace.
3. One active relationship exists per Client/Company pair.
4. Legal acts identify the exact legal entity when required.
5. Name similarity never triggers automatic merge.
6. Shared identity does not reveal Company activity.
7. A Client with operational history is archived, not hard-deleted.
8. Duplicate resolution preserves aliases, identifiers and prior references.

## 7. Minimal data

Issue #141 fixes the first slice's complete shared interface to the server-assigned Client Account id and one required display name. Registration atomically establishes the server-validated active Company's relationship. Workspace search returns only that identity and whether it is already related to the active Company; a deliberate attach action reuses the same Client Account in another Company. Names never trigger an automatic merge.

The delivered #146 / PR #147 enriched slice approved and implemented these shared general fields:

- Client name;
- IDNO/tax code;
- address;
- telephone and general email;
- Contacts;
- business activity;
- the fact that the Client also works with another involved Company.

These fields may be seen by directors of the Companies involved with that Client. Issue #146 / PR #147 owns their delivered storage shapes, validation and Contact cardinality. Later changes must not broaden visibility or invent mandatory values that Iurie did not require. Section 18 refines the shared Contact with two optional descriptive fields, and section 19 adds optional descriptive communication preferences; neither changes its visibility. Section 20 records additional Client Legal Entities beside these fields, while this dossier identity remains the main organization.

## 8. Permissions

Separate permissions cover shared read/create/update, relationship update, archive and duplicate resolution. Legal-entity changes used by governed Documents require stronger correction/history behaviour.

Issue #141 introduces only `client.manage`, a Workspace permission granted by the configured bootstrap Workspace Owner path. It covers the minimal list, search, create and attach operations in an active Company context. It does not establish an ordinary-user bundle or authorize update, archive, duplicate resolution or operational activity.

The Company Director may create, view and correct the Client dossier for the Company or Companies they direct. The following activity remains completely invisible to users of other Companies: Contracts, prices, invoices and Payments, audits, certificates and Project names. Only Iurie may authorize an exception; the exception mechanism itself is not part of the first enriched slice.

The [Tenant, Company, Shared Client and Authorization PRD](tenant-company-client-authorization-prd.md#8-initial-permission-families) is the sole normative owner of duplicate-resolution permission-set versioning or hashing, the Workspace Owner grant/revoke lifecycle, legacy-assignment migration and fail-closed behavior. The Shared Client-specific consequence is that pending-review listing, reference lookup and full comparison require current Client read authority for every persisted candidate plus an active assignment whose captured version or immutable hash resolves to resolver-enabled `v2` in every Company in the live candidate review scope. Union, reversal and restricted operation detail require current read authority for both affected Clients plus that captured resolver-enabled `v2` authority in every affected Company. The shared bundle label, legacy `v1`, Client visibility, Workspace ownership and free-form role names are insufficient. One cross-Company resolver must hold every affected `v2` scope; asynchronous multi-person approval remains deferred.

## 9. UX states

- empty Client list;
- search before create;
- possible duplicate warning;
- incomplete or unverified identity;
- no Company relationship;
- archived Client;
- hidden relationship/activity;
- concurrent update conflict;
- possible duplicate comparison and disagreement;
- union blocked by conflicting legal identifiers or incomplete Company authority;
- superseded dossier and reversible-union history;
- safe not found/forbidden behaviour.

## 10. Activity Log

Issue #141 authorizes exactly `client.created` and `client_company_relationship.established`, recorded atomically with their successful mutations. Issue #146 / PR #147 delivers attributable `client.corrected` history with previous values, server-authoritative actor, date and time. Relationship archive and broader Client archive/restore remain separate event families.

A successful governed union requests `client.union_confirmed`, and a successful reversal requests `client.union_reversed`, through the Accountability boundary. Failed, conflicted, unauthorized and replayed commands request no success event. The [Activity Log and accountability PRD](activity-log-accountability-prd.md#8-retention-correction-and-export) solely owns the internal operation record, Company projections, redaction, attribution, visibility and restricted-detail contract.

## 11. Governed duplicate resolution

### 11.1 Candidate and identity boundary

Candidate generation is advisory and uses one deterministic key predicate in the first vertical implementation: a submitted non-empty IDNO/tax identifier triggers a candidate when its exact normalized value equals the non-empty normalized identifier on another Client or when that exact key is retained by union history and resolves to a live persisted Client. For this slice, normalization is exactly the representation already produced by the delivered Client dossier validator: trim leading and trailing whitespace, then compare the remaining value exactly; do not remove punctuation or internal whitespace, fold case, transliterate or infer numeric equivalence. A value empty after trimming is missing. Thus `"12345"` and `" 12345 "` match, while `"12-345"`, `"12 345"`, `"ABC"` and `"abc"` remain distinct values. The first vertical implementation permits union only when both dossiers carry that same identifier. Official name, address, telephone, general email and Contacts may support human comparison of those exact-ID candidates but never establish identity by themselves. Official Documents may become stronger evidence only after the Document Registry authorization model is delivered, so this slice does not inspect, match, compare, disclose or accept any Document-derived identity basis. Name similarity never authorizes union. A missing or different legal/tax identifier on either input blocks the union.

The server may evaluate candidate signals across the Workspace, but an ordinary create or search flow receives only an opaque “possible duplicate requires authorized review” warning. That warning exposes no candidate identifier, field value, Contact, Document, count, affected Company or match reason.

The first slice carries that warning into authorized work through a server-generated, unpredictable `duplicate_review_reference`. The reference contains no embedded Client or Company data, grants no read or resolution authority and cannot be enumerated by an ordinary user. A blocked registration or correction returns only that reference with the generic conflict and binds it server-side to the active Company selected for the rejected command. For two persisted Client inputs, the **candidate review scope** is their affected-Company set and must contain at least one active Company. If that persisted-only scope is empty, pending review, reference dereference and comparison return a safe unavailable outcome with no row, count, detail, mutation or success event; resolver authority never passes vacuously. For a rejected registration or correction proposal, the candidate review scope is the union of every persisted candidate's affected Companies and that attempted Company; the attempted Company is required even though the failed command created no Client–Company Relationship. A resolver-only pending-review view exposes a reference only after the server confirms the complete current authority owned by the Tenant/Authorization PRD across that live review scope and current Client-read authority for every persisted candidate. A-only or attempted-Company-only authority therefore returns no reference, row, count or hidden metadata. Candidate discovery for the submitted normalized identifier builds one complete candidate group from the deduplicated union of every active, non-superseded persisted Client carrying that identifier currently and every live target to which the historical reservation index resolves that key. An unreversed union reservation resolves to its current canonical Client even if that Client's current identifier later changed; after reversal, it resolves to the restored original dossier or dossiers. A superseded source that resolves to an already included canonical Client is not counted twice. A rejected proposal is reviewable only when that group contains exactly one persisted Client; an existing-dossier union comparison is reviewable only when the group contains exactly two persisted Clients and those are the two proposed inputs. If a rejected proposal matches two or more persisted Clients, or an existing-dossier request has a complete group of three or more, partial authority returns the same safe denial; after complete current review-scope and Client-read authority passes, the server returns only `multiple_duplicate_candidates_require_data_remediation`, without comparison data or arbitrary pair selection. That outcome creates no union, mutation or success event, and remediation of the legacy data is a separately scoped capability. For a supported candidate cardinality, presenting the reference for review causes the server to re-resolve the complete live candidate group, review scope, exact identifier, lifecycle and versions and to reapply that complete authority before returning either the existing Client with the rejected proposed values for deliberate attach or correction, or both already persisted Clients for governed union comparison. Any changed attempted Company, identifier, dossier version, relationship set, lifecycle state or authority makes the reference stale; stale review returns a safe denial and creates no mutation or success event.

Pending-review listing uses stable keyset pagination in durable creation order with the unpredictable review reference as its tie-breaker. Each request scans and revalidates at most 20 durable reviews plus one existence lookahead under one repeatable-read snapshot. Its random server-owned continuation cursor is distinct from the review reference, scoped to the current Workspace and attempted Company, and contains no embedded review, Client, Company, total or hidden-count data. An unknown, malformed or wrong-scope cursor fails safely. Stale and partially authorized reviews remain omitted; therefore a bounded page may contain no visible item while still returning a continuation cursor. The resolver interface advances only on an explicit request and never follows empty pages automatically.

When Client registration itself hits that exact-ID predicate, the command returns a safe `possible_duplicate_review_required` conflict and commits no Client Account, Client–Company Relationship, `client.created` event or relationship event. It does not auto-attach or disclose the existing Client. The governed union path remains available for duplicates that already exist; a blocked registration may proceed only through the delivered deliberate attach flow when the actor can already read and select the existing Client, or after correction of a genuinely mistaken submitted identifier. This first slice provides no override that creates a second persisted Client with the same normalized IDNO/tax identifier.

Registration and every correction that changes an IDNO/tax value to a non-empty normalized value use the same atomic conflict boundary. Inside the owning transaction, the server acquires a lock keyed by `(Workspace, normalized identifier)` and then rechecks both non-superseded Clients and identifiers retained by union history before any mutation. A normalized identifier retained in a superseded snapshot remains reserved to that union's canonical Client even when the canonical Client's current identifier later changes. A correction target may reclaim a reserved identifier only when the reservation's deduplicated live-target set contains exactly that target and no different current non-superseded Client carries the identifier; this sole-owner reclaim is not a collision. Every other current or reserved match returns the same opaque `possible_duplicate_review_required` conflict and commits no Client, relationship, dossier correction, version change or `client.created`, `client.corrected` or relationship event. The server resolves a reserved match to its live target set only inside the authorized handoff; the conflict exposes no historical or canonical identity, and the first slice has no identifier-release or reassignment action for a different Client. After a successful reversal, the reservation resolves to the restored original dossier or dossiers, so no third Client may claim it. Registration↔registration, registration↔correction and correction↔correction races for the same key serialize, so at most one previously unused and unreserved normalized identifier mutation commits. A correction that leaves its target's normalized identifier unchanged, or that performs the permitted sole-owner reservation reclaim, is not a new collision. Viewing the full candidate comparison requires current read authority for every persisted candidate plus an active assignment whose captured version or immutable hash resolves to resolver-enabled `v2` in every Company in the candidate review scope. The shared `company_director_client_access` label or legacy `v1` alone is insufficient. The server resolves and authorizes that complete Company set before returning comparison data; a partial or failed check returns only safe denial and no hidden metadata.

A resolver assertion or any combination of supporting fields cannot override the missing-ID guard. Ambiguous branch, subsidiary or distinct-legal-entity cases stay outside this workflow until Client Legal Entity behavior is delivered.

### 11.2 Authority and disagreement

For persisted-only candidate comparison and a new union, the **affected Companies** are the unique active Companies that have an active Client–Company Relationship to either input at command time. That set must be nonempty; an empty set returns a safe unavailable outcome, grants no authority vacuously, changes nothing and requests no Activity Log projection. A successful union immutably captures that complete nonempty Company set on its operation. Reversal always reuses the captured set rather than recomputing it from current relationships or Company status. An archived relationship remains preserved against its source Client but is excluded from duplicate-resolution authority, confirmation, canonical current-access projection and Activity Log projection scope; union never reactivates it. An active relationship to an inactive Company blocks union under the active-Company guard. Any future relationship-restore capability must reconcile its Client to the then-current canonical identity in a separate governed transition.

A same-Company union requires an active assignment whose captured version or immutable hash resolves to resolver-enabled `v2` in that Company. A cross-Company union requires that same captured `v2` authority in every affected Company. One actor may confirm in one command only when that actor already holds every required Company scope. Otherwise the operation is unavailable until a separately delivered multi-approver workflow exists.

Any disagreement means no union. AI, matching score, Workspace ownership and role-name strings cannot override the missing approval.

Every union requires at least one affected Company, current read authority for both affected Clients, active affected Companies, complete duplicate-resolution authority, fresh versions and complete affected-Company confirmation. Reversal requires the same guards across every Company captured by the union; if any captured Company is inactive, unavailable or unauthorized, reversal blocks instead of shrinking the scope. A failure of any such guard, including a concurrency conflict, blocks the requested command.

For a new union, both inputs must also be active, current Client dossiers that are not already superseded and do not participate in another unreversed union. They must be the complete exact-normalized-identifier candidate group of exactly two persisted Clients at command time; a third active non-superseded match blocks pairwise union with the authorized remediation-required outcome. An archived or superseded Client or an active union participant blocks the new union command. Chained or overlapping unions and legacy multi-candidate remediation are outside the first vertical slice. Every denial creates no success event and reveals no hidden Client or Company metadata.

### 11.3 Union result

The resolver:

- chooses the canonical Client and current shared values field by field;
- reviews the identity basis and every material difference;
- places every Contact entry from both inputs, with its stable source identity and provenance, on the canonical current dossier by default;
- supplies a written reason;
- confirms the complete affected-Company set.

Union never hard-deletes either Client or rewrites its immutable pre-union snapshot. The selected field values update the chosen canonical Client's current projection as one attributable union change, while both pre-union snapshots remain reconstructible. Complementary Contacts from both inputs are therefore visible on the canonical current dossier; no Contact is automatically deduplicated, collapsed or stranded only on the superseded dossier. Explicit Contact consolidation selects the retained current representation field by field, preserves every source identity in union history and never erases either pre-union value.

Before mutation, union preflight computes the complete source-preserving current Contact result after any explicit consolidation. If it would exceed the delivered maximum of 50 Contacts, the whole union is blocked with a safe non-leaking capacity error and creates no mutation, success event or projection. This slice does not raise that limit, discard a Contact, auto-consolidate entries or strand overflow on the superseded dossier. The operation may be retried only when a source-preserving result is within the delivered limit or separately approved capacity work raises it.

Every original Client–Company Relationship retains its identifier, responsible Company, confidentiality and historical source Client. Ordinary current access uses one active canonical relationship projection for each Company in the union of both dossiers' active relationships: an existing canonical relationship is reused, otherwise union creates a projection that references the preserved source relationship. No duplicate active canonical Client–Company pair is created. Before mutation, if the chosen canonical Client already owns an archived relationship for an affected Company whose relationship from the other input must remain active, union is blocked with a safe non-leaking conflict; the first slice never reactivates or repurposes that archived row as a canonical projection. The resolver may choose the other Client as canonical and retry when that removes the collision; if neither choice does, union remains unavailable. Because no archived row changes status, reversal never has to guess or restore a pre-union archived state. Lists and dossier reads use these canonical projections, so each previously involved Company keeps authorized access to the canonical Client. Company-owned Project, Contract, Document, invoice, Certificate and later operational records remain on their original identifiers and ownership boundary.

The superseded dossier leaves default active search, but authorized users can follow its “united with…” history to the readable canonical Client.

### 11.4 Reversal

Union is reversible only under complete authority for the exact nonempty affected-Company set captured by that union. Reversal never recomputes or shrinks this set: every captured Company must still be active, and the actor must still hold current Client read plus captured resolver-enabled `v2` authority across all of them. Its Activity Log action emits exactly one projection for each captured Company. Reversal restores the governed pre-union state because originals and references remain preserved, and it never rewrites subsequent history.

The first vertical implementation permits reversal only while version fences prove that the canonical dossier, its Contacts, every captured or union-created Client–Company Relationship and every captured Company's active lifecycle remain valid since union. Any post-union correction, Contact change, relationship attach/archive or new operational reference blocks reversal for controlled resolution. A successful reversal removes only union-created canonical relationship projections, restores ordinary lookup through the preserved original relationships and leaves pre-existing canonical relationships intact.

Reversal requires its own written reason. The restricted operation record appends it separately and never overwrites the original union reason. The command never discards, guesses at or automatically redistributes intervening data.

### 11.5 Representative acceptance cases

1. Same IDNO with spelling variation and complementary Contacts: eligible for human-confirmed union.
2. Similar name with different IDNO: union blocked.
3. Shared brand or corporate group with distinct legal identifiers and Contracts: separate legal entities, outside this workflow.

These are synthetic Product Owner acceptance cases, not examples supplied by Iurie. Real anonymized cases may improve later matching evaluation without blocking the first safe slice.

## 12. Testing decisions

- PostgreSQL REST tests for identity, relationship uniqueness and isolation;
- browser journey for search-before-create, relationship and overview;
- negative tests for Company activity and metadata leakage;
- exact normalized IDNO/tax candidates with display-name script/spelling variations, plus negative name-only and missing/different-identifier cases;
- registration-conflict tests proving an exact-ID hit returns only `possible_duplicate_review_required` and creates no Client, relationship or success event, while non-candidates retain the delivered registration behavior;
- pending-review pagination tests proving stable creation/reference keyset order, opaque Company-scoped cursors, a 20-review revalidation window plus one lookahead, a fixed query budget across multiple durable pages, safe empty pages with continuation, and explicit-only browser continuation without cursor or reference disclosure;
- PostgreSQL REST concurrency tests for registration↔registration, registration↔ID-changing correction and correction↔correction on the same Workspace/normalized-ID key, proving one commit at most, opaque conflicts for losers, no losing version changes or success events, and independent progress for different Workspaces or identifiers;
- correction-conflict tests proving that a sequential ID change to another current or historically reserved normalized identifier returns the same nonmutating opaque conflict, that a superseded reservation follows its canonical Client, that an authorized handoff for reserved X includes and authorizes the canonical Client after its current identifier changes to Y or the restored originals after reversal before applying cardinality, that the sole live reservation owner may atomically reclaim X while another Client or a shared restored reservation still conflicts, and that an unchanged normalized ID does not create a false collision;
- correction/history tests through public commands;
- PostgreSQL REST tests for one logical union/reversal operation, one internal operation identifier, stable `client_union_operation` target type, a distinct unpredictable public projection reference per affected Company, no shared/internal correlation key, actor identity, exact/coarse action time or cross-scope ordering key in redacted reads, independently generated Company-local ordering, shared correlation/actor/time only after complete affected-Company captured-`v2` authority, separate union/reversal reasons, redacted Company-scoped event projections and matching safe target representations, exactly one event projection per union-captured affected Company, reversal rejection when any captured Company becomes inactive instead of scope shrinkage, versioned fixed-bundle assignment lifecycle, rejection of any Document-derived candidate or identity-basis input, canonical Contact union/consolidation, canonical relationship projection/reuse, continued Company access, stale state, blocked identifiers, post-union reversal guards and preserved source relationships;
- migration tests starting from the delivered unversioned assignment schema and proving every legacy row is backfilled to `v1` with exactly `client.read`, `client.create` and `client.update`, denies `client.duplicate.resolve`, preserves scope/status and fails closed for null or unknown versions;
- assignment-version tests proving that a prior-version active assignee gains no resolver authority until an explicit attributable Workspace Owner revoke and fresh versioned grant;
- comparison-authorization tests proving that the shared bundle label and legacy `v1` cannot reveal full candidate data, that a captured resolver-enabled `v2` version or hash is required throughout the candidate review scope, and that a rejected Company B attempt against a Company A Client denies both A-only and B-only resolvers; multi-candidate cases cover a rejected proposal matching exactly two persisted Clients as well as existing-dossier groups of three or more, and prove partial authority reveals nothing while complete authority receives only `multiple_duplicate_candidates_require_data_remediation`, with no comparison, arbitrary pair, mutation or success event; affected-scope cases prove archived relationships are preserved but excluded, a persisted-only group with no active relationship cannot be compared or united, and an active relationship to an inactive Company blocks union;
- Contact-capacity tests proving that a 51-to-100-entry union result is rejected atomically without discard, stranding or success events, while a source-preserving result at or below 50 succeeds;
- relationship-collision tests proving that a chosen canonical Client's pre-existing archived row blocks any union that would need it active, creates no mutation/event, permits retry with the other canonical choice when safe, and never requires reversal to restore an archived status;
- browser comparison at desktop and narrow widths for canonical field selection, reason, blocked union, superseded history and reversal.
- #141 proves its narrow two-Company identity journey through REST/PostgreSQL, migration, public UI and browser seams while returning no relationship collection or operational activity.

## 13. Acceptance journey

A BIC user searches for an existing shared Client, adds a BIC relationship and sees only authorized activity. A PRISMA-PRIM user sees the same shared identity with separate activity. A reused exact normalized IDNO/tax identifier makes registration return an opaque `possible_duplicate_review_required` conflict with no Client, relationship or success event; it neither merges nor auto-attaches, while a similar name alone produces no candidate in this slice. The same result applies when a correction attempts to adopt another Client's normalized identifier, and simultaneous create/correction attempts on one Workspace/identifier key permit at most one commit. An authorized reviewer resolves the candidate and history remains attributable.

## 14. Business evidence at the current audited boundary

The current audited evidence and Iurie's direct 2026-08-23 response approve the following boundary:

- Iurie wants one general Client dossier shared across PRISMA-PRIM, BIC and ECG.
- Operational activity remains separated by responsible Company.
- Future ordinary Company users must not automatically see another Company's Contracts, money or other operational activity.
- Directors of involved Companies may see the approved general fields and the fact of the other involved Company relationships.
- Contracts, prices, invoices and Payments, audits, certificates and Project names are hidden from other Companies; only Iurie may authorize an exception.
- Only the relevant Company's director may confirm a duplicate and decide a significant correction or union, with the required history preserved.
- Representative cases are: a PRISMA-PRIM-only consulting Client; a Client using PRISMA-PRIM consulting, BIC certification and EUROCERTGRUP (`ECG`) internal audit; and one organization with multiple branches or legal entities whose Projects, Contracts and invoices remain separate but relate to the main organization.

Still blocking separate later slices:

- the Client Legal Entity capabilities excluded by section 20: party kind, natural persons, contracting-party selection and signatory authority, primary-entity materialization, archive, and duplicate signals that consider legal entities;
- general fuzzy matching, transliteration and evaluation against real examples;
- asynchronous multi-person approval when no one resolver holds every affected Company scope;
- remediation of legacy normalized identifiers shared by three or more active Clients;
- archive/restore practice beyond governed union reversal;
- broader Client-overview questions beyond the delivered Company Director dossier.

The #140 completion package is satisfied and normalized through #144 for the first enriched slice. Dan's separately approved DEC-213 / #148 product synthesis makes one conservative governed duplicate-resolution slice ready for vertical ticketing; broader archive/restore and Client Legal Entity behaviour remain separate.

Question sources: S00, S02 and the direct 2026-08-23 answer in #81. Provenance owner: issue #81; semantic coverage owner: `docs/product/iurie-business-answer-coverage.md`.

## 15. Technical dependencies

- Company/RBAC capability;
- canonical Client vocabulary;
- general fuzzy/transliteration matching research without automatic authority;
- transaction, persistence and rollback implementation for the approved union-operation and source-reference contract inside the vertical slice.

## 16. Readiness

Issue #141 delivered the initial minimal Client implementation child. Issue #146 / PR #147 then delivered the enriched Company Director dossier and is the runtime baseline for the newly approved duplicate-resolution slice.

Issue #146 / PR #147 delivered the Company Director dossier, shared/confidential boundary and attributable correction history. After #148 normalization, one next vertical child may implement the conservative governed duplicate-resolution contract in section 11. The Client Legal Entity capabilities excluded by section 20 (party kind, natural persons, contracting-party selection and signatory authority, primary-entity materialization, archive, and duplicate signals that consider legal entities), general fuzzy entity resolution, legacy multi-candidate data remediation, asynchronous multi-person approval, broader archive/restore and broader Client-overview behaviour remain separate slices.

## 17. Evidence authority boundary

Issue #81 preserves raw interview evidence. The coverage matrix owns its semantic coverage classifications and blocker deltas. Neither artifact authorizes automatic duplicate handling, broad cross-Company visibility or any runtime rule by itself. Implementation issues must cite this PRD after the relevant evidence has been normalized here.

## 18. Approved provisional Contact position and decision roles (#366)

Under Dan's 24 September 2026 delegation to implement sourced business functionality and reversible provisional MVP choices, this slice records optional descriptive Contact data. It normalizes Iurie's accepted session 94 direction ([#81 comment 5308702257](https://github.com/Prisma-Prim/PRISMA-PRIM-Suite/issues/81#issuecomment-5308702257), items 475 and 477) into two optional descriptive Contact fields. The exact field shape and the closed code list are delegated provisional choices, not newly collected Iurie evidence. Iurie validates or corrects them against a demonstration.

Each shared Contact may record a free-text `position` of up to 500 characters and a set of `decisionRoles` drawn from exactly: final decision-maker, influencer, user, financial, technical, blocker. These are the values Iurie listed in item 477. The list is closed in this slice. Adding a value later is an additive change. Neither field is mandatory. Both fields belong to the shared Contact defined in section 7. They are visible exactly where Contacts are visible, and they do not broaden visibility. Iurie's Company-confidential categories do not include them.

A change to either field is an ordinary material dossier correction. It records `client.corrected` with previous and new Contact values, uses the existing expected-version, idempotency, correction-history and union rules, and adds no permission, event family or storage scope.

Excluded, and not presented as business fact: relationships between Contacts (item 478), a departed or former Contact, and warnings on role change (item 479). Also excluded: a primary Contact, consent, Contact-level interactions (session 95), Contact identity for linking to Requests, Offers or Contracts, mission-specific Contacts stored on a relationship or Project, and any additional decision-role value. Communication preferences (item 476) are owned by section 19.

## 19. Approved provisional Contact communication preferences (#372)

Iurie's session 94 answer ([#81 comment 5308702257](https://github.com/Prisma-Prim/PRISMA-PRIM-Suite/issues/81#issuecomment-5308702257), item 476) asks to record each Contact's practical communication preferences: preferred channel, language, suitable time windows and practical working preferences. Under Dan's 24 September 2026 delegation of reversible provisional MVP choices inside a vertical implementation, this slice records them as one optional descriptive Contact field. The field shape, normalization and bound below are delegated provisional choices, not a new verbatim Iurie rule. Iurie validates or corrects them against a demonstration.

Each shared Contact may record optional free-text `communicationPreferences`, for example “Romanian; email preferred; weekday mornings”. The server trims leading and trailing whitespace, omits a value that is blank after trimming and preserves the internal text and line breaks. The trimmed value holds at most 1000 Unicode code points, so a character outside the Basic Multilingual Plane counts once. A non-text, `null` or longer value is a validation error that commits nothing. There is no prescribed channel or language vocabulary, mandatory value, structured schedule or time-zone conversion. Readers present the value as plain text, never as markup or an executable link.

The field belongs to the shared Contact defined in section 7. It is shared general data, not a private Company note. It is visible exactly where Contacts are visible, to current authorized readers of the dossier and its correction history, and it is not added to Client lists, search, counts or unrelated Activity summaries. Contacts recorded before this slice remain valid without it.

Enriched registration and correction accept the field under the existing `client.create` and `client.update` authority; minimal registration still rejects Contacts. A correction submits the complete Contact list, so every other Contact field is resubmitted unchanged, and a blank value clears that Contact's preferences explicitly. A change is an ordinary material dossier correction. It records one `client.corrected` event with previous and new Contact values and keeps the delivered expected-version, no-op, idempotency, correction-history, duplicate-review and union/reversal rules. Like every other Contact field, preferences appear in the union comparison before confirmation and in the preserved originals, so the resolver reviews them as a material difference under section 11.3. It adds no permission, route, event family, migration or storage scope.

Excluded, and not presented as business fact: sending, scheduling or integrating communications; capturing or inferring consent; and any decision or approval authority. Contact position and decision roles are owned by section 18. Relationships among Contacts, a departed Contact and related alerts remain outside this slice.

## 20. Approved provisional additional Client Legal Entities (#393)

Under Dan's 24 September 2026 delegation of reversible provisional MVP choices inside a vertical implementation, this slice models Iurie's representative Client C (section 14) without classifying party kinds. The record shape, bounds and union guard are delegated provisional choices, not newly collected Iurie evidence. Iurie validates or corrects them against a demonstration.

The shared dossier identity (section 7) remains the main organization. A Company Director with dossier-correction authority may record up to 50 additional Client Legal Entities, meaning branches or legal entities linked to that organization. Each has a required exact legal name, an optional IDNO/tax code and an optional legal address. The same directors may correct those values. The records are shared general identity (decision record §8.2; DEC-032). They are visible exactly where the dossier is visible and reveal no Company activity.

Each committed registration or correction serializes on the Client row exactly like a dossier correction, and increments the Client version. It records `client_legal_entity.registered` or `client_legal_entity.corrected` with the recorded or previous-and-new values, the actor, the Company and the server time. Failures, no-ops and replays record nothing. Because the dossier version advances, the delivered duplicate-review staleness and union-reversal fences apply unchanged.

This slice does not create the primary Client Legal Entity of DEC-023. The first capability that must reference a contracting, invoiced or certified party decides that materialization. An entity identifier stays outside section 11: it is not normalized, reserved, unique, searched or matched, because branches may share a parent identifier. While either input Client has an entity, union returns the safe conflict `client_union_legal_entities_unsupported` after complete authority passes.

Excluded, and not presented as business fact:

- party kind and natural persons;
- who signs or represents the Client, and under what mandate;
- selecting an entity on any commercial, operational, Document, invoice or certificate record;
- archive, removal and restore;
- duplicate signals and union that consider entities;
- registry validation;
- Company-specific entity data;
- the stronger correction behaviour required once a governed Document references an entity (section 8).
