# PRD — Release 1 Shared Client

**Status:** Draft — interview evidence received; representative cases pending
**Version:** 0.2  
**Owner:** Dan Popescu  
**Parent authorities:** Product Vision; Tenant, Company, Shared Client and Authorization PRD; Activity Log PRD

## 1. Problem statement

The same real Client may work with PRISMA-PRIM, BIC and ECG, while commercial and operational activity must remain Company-scoped. Duplicating the Client per Company fragments identity; sharing every field exposes confidential relationships. One Client group may also contain several legal entities that receive different Offers, Contracts, invoices or credentials.

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
- critical Activity Log events.

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

The first slice requires only enough shared identity to recognize the Client and preserve provenance. Exact mandatory fields depend on real examples; absent tax/legal identifiers do not block early intake unless the downstream action requires them.

## 8. Permissions

Separate permissions cover shared read/create/update, relationship update, archive and duplicate resolution. Legal-entity changes used by governed Documents require stronger correction/history behaviour.

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

Record Client creation, significant identity correction, relationship create/archive, Client archive/restore and governed duplicate disposition.

## 11. Testing decisions

- PostgreSQL REST tests for identity, relationship uniqueness and isolation;
- browser journey for search-before-create, relationship and overview;
- negative tests for Company activity and metadata leakage;
- duplicate scenarios with representative scripts/spellings;
- correction/history tests through public commands.

## 12. Acceptance journey

A BIC user searches for an existing shared Client, adds a BIC relationship and sees only authorized activity. A PRISMA-PRIM user sees the same shared identity with separate activity. A new similar name produces a duplicate warning, not a merge. An authorized reviewer resolves the candidate and history remains attributable.

## 13. Business evidence

- shared versus Company-specific fields;
- real multi-legal-entity examples;
- identifiers used to recognize Clients;
- duplicate-resolution authority;
- permitted work before exact legal identity;
- ten representative Clients and Client overview questions.

Question sources: S00 and S02.

## 14. Technical dependencies

- Company/RBAC capability;
- canonical Client vocabulary update;
- matching normalization research without automatic authority;
- duplicate-resolution and referential-history design.

## 15. Readiness

Ticket decomposition is blocked on representative Client examples, field visibility and duplicate authority. The capability must follow Company/RBAC.

## 16. Interview evidence reconciliation (2026-08-16)

**Confirmed evidence**

- Iurie wants one general Client dossier shared across the group.
- Operational activity remains separated by responsible Company.
- Authorized consolidated users need a group view without converting Company-owned work into shared ownership.

**Still blocking**

- The exact shared fields and Company-confidential fields remain partially resolved.
- Representative multi-legal-entity Clients, matching identifiers and duplicate-resolution authority remain absent.
- No answer authorizes automatic duplicate merge or broad cross-Company activity disclosure.

Provenance: [issue #81](https://github.com/Prisma-Prim/PRISMA-PRIM-Suite/issues/81), sessions 1, 3 and 12; [coverage matrix](iurie-business-answer-coverage.md). The existing archive, provenance, human duplicate-review and non-leakage rules remain unchanged.
