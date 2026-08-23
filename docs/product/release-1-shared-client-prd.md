# PRD — Release 1 Shared Client

**Status:** Draft — first enriched Company Director slice approved; duplicate workflow pending
**Version:** 0.5
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

For the next enriched slice, the approved shared general fields are:

- Client name;
- IDNO/tax code;
- address;
- telephone and general email;
- Contacts;
- business activity;
- the fact that the Client also works with another involved Company.

These fields may be seen by directors of the Companies involved with that Client. Their exact storage shapes, validation and Contact cardinality are technical design decisions inside the vertical issue; they must not broaden visibility or invent mandatory values that Iurie did not require.

## 8. Permissions

Separate permissions cover shared read/create/update, relationship update, archive and duplicate resolution. Legal-entity changes used by governed Documents require stronger correction/history behaviour.

Issue #141 introduces only `client.manage`, a Workspace permission granted by the configured bootstrap Workspace Owner path. It covers the minimal list, search, create and attach operations in an active Company context. It does not establish an ordinary-user bundle or authorize update, archive, duplicate resolution or operational activity.

The Company Director may create, view and correct the Client dossier for the Company or Companies they direct. The following activity remains completely invisible to users of other Companies: Contracts, prices, invoices and Payments, audits, certificates and Project names. Only Iurie may authorize an exception; the exception mechanism itself is not part of the first enriched slice.

## 9. UX states

- empty Client list;
- search before create;
- possible duplicate warning;
- incomplete or unverified identity;
- no Company relationship;
- archived Client;
- hidden relationship/activity;
- concurrent update conflict;
- safe not found/forbidden behaviour.

## 10. Activity Log

Issue #141 authorizes exactly `client.created` and `client_company_relationship.established`, recorded atomically with their successful mutations. The next correction slice must add an attributable Client correction event that preserves all changed values with server-authoritative actor, date and time. Relationship archive, Client archive/restore and governed duplicate disposition remain separate event families.

A future duplicate union must preserve both original records, every change, actor, date/time and the reason for union. It may be decided only by the director of the relevant Company and must never be automatic.

## 11. Testing decisions

- PostgreSQL REST tests for identity, relationship uniqueness and isolation;
- browser journey for search-before-create, relationship and overview;
- negative tests for Company activity and metadata leakage;
- duplicate scenarios with representative scripts/spellings;
- correction/history tests through public commands.
- #141 proves its narrow two-Company identity journey through REST/PostgreSQL, migration, public UI and browser seams while returning no relationship collection or operational activity.

## 12. Acceptance journey

A BIC user searches for an existing shared Client, adds a BIC relationship and sees only authorized activity. A PRISMA-PRIM user sees the same shared identity with separate activity. A new similar name produces a duplicate warning, not a merge. An authorized reviewer resolves the candidate and history remains attributable.

## 13. Business evidence at the current audited boundary

The current audited evidence and Iurie's direct 2026-08-23 response approve the following boundary:

- Iurie wants one general Client dossier shared across PRISMA-PRIM, BIC and ECG.
- Operational activity remains separated by responsible Company.
- Future ordinary Company users must not automatically see another Company's Contracts, money or other operational activity.
- Directors of involved Companies may see the approved general fields and the fact of the other involved Company relationships.
- Contracts, prices, invoices and Payments, audits, certificates and Project names are hidden from other Companies; only Iurie may authorize an exception.
- Only the relevant Company's director may confirm a duplicate and decide a significant correction or union, with the required history preserved.
- Representative cases are: a PRISMA-PRIM-only consulting Client; a Client using PRISMA-PRIM consulting, BIC certification and EUROCERTGRUP (`ECG`) internal audit; and one organization with multiple branches or legal entities whose Projects, Contracts and invoices remain separate but relate to the main organization.

Still blocking later ticket decomposition:

- exact branch and Client Legal Entity modelling for the representative complex case;
- identifier normalization and matching rules;
- duplicate candidate generation, referential-history and safe union design;
- archive/correction practice for real representative Clients;
- broader Client-overview questions beyond the first enriched slice.

The #140 completion package is satisfied and normalized through #144 for the first enriched slice. It does not make duplicate union, archive/restore or Client Legal Entity behaviour ready.

Question sources: S00, S02 and the direct 2026-08-23 answer in #81. Provenance owner: issue #81; semantic coverage owner: `docs/product/iurie-business-answer-coverage.md`.

## 14. Technical dependencies

- Company/RBAC capability;
- canonical Client vocabulary;
- matching normalization research without automatic authority;
- duplicate-resolution and referential-history design.

## 15. Readiness

Issue #141 delivered the initial approved implementation child: a bootstrap Workspace Owner can create a Client Account containing only id and display name, search that minimal identity and explicitly relate it to a second active Company. It remains the runtime baseline for the newly approved enriched slice.

After #144 provenance review, one vertical child may enrich the Client dossier for a Company Director, enforce the approved shared/confidential boundary and provide attributable correction history. Governed duplicate union, archive/restore, Client Legal Entities and broader Client-overview behaviour remain separate blocked slices.

## 16. Evidence authority boundary

Issue #81 preserves raw interview evidence. The coverage matrix owns its semantic coverage classifications and blocker deltas. Neither artifact authorizes automatic duplicate handling, broad cross-Company visibility or any runtime rule by itself. Implementation issues must cite this PRD after the relevant evidence has been normalized here.
