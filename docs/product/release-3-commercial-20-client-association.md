# PRD — Release 3 Commercial Workflow, section 20: Approved provisional one-time Client association after Request capture (#450)

Part of the [Release 3 Commercial Workflow PRD](release-3-commercial-workflow-prd.md). Section and subsection numbers are unchanged; cross-references such as “section 16.4” point to the numbered section in its own file, listed in the [core PRD index](release-3-commercial-workflow-prd.md#sections-by-capability).

## 20. Approved provisional one-time Client association after Request capture (#450)

This section normalizes one bounded, reversible MVP execution choice under the provisional authority of sections 1 and 15. It is not new Iurie evidence or approved first-tenant business policy. It removes the dead end for a Request captured before its Client is known without changing capture-time evidence, Opportunity meaning, Pricing history, Offer policy or Client ownership.

### 20.1 Observable outcome and boundary

An authorized user in a server-validated active Company opens a Company-owned Request whose stored original Client reference is absent, selects one existing active Client Account from the authorized Client search and confirms the association. The Request detail and list then expose the existing Client-owned current projection and dossier navigation when the reader retains Client visibility. Reload and process restart preserve the association.

The association names a Client Account, not a Client Legal Entity. It does not create or change a Client, a Client–Company Relationship, a Client Legal Entity, the responsible Company, original Request evidence, capture fields, subject, Opportunity, next action, responsible actor, status or stage.

### 20.2 Request versions and one-time lifecycle

Version 1 remains the complete capture contract and has two valid historical forms: a Request may already store an original Client reference, or it may store none. Only the second form may transition once to version 2. Version 2 requires a stored original Client reference and has no transition back to version 1.

The eligibility decision uses the stored original reference. A null or omitted current permission-filtered Client projection does not mean that the reference is absent and never makes an already-associated version 1 Request eligible. A Request with any existing stored association, visible or hidden, cannot be re-pointed.

### 20.3 Explicit permission and prerequisites

The [authorization PRD](tenant-company-client-authorization-prd.md#8-initial-permission-families) owns captured **Company Commercial Intake v3**, whose permissions are v2 plus `commercial.request.client.associate`. Existing v1 and v2 assignments never expand in place. An administrator must revoke the old assignment and issue a fresh grant that captures v3; null or unknown versions fail closed.

Execution and exact replay require all of the following at that time:

- a verified identity, active Workspace Membership and server-validated active Company;
- a live captured Company Commercial Intake v3 assignment in that Company;
- current Request read authority for the target;
- current Client read authority for the selected Client Account and an active Client–Company Relationship in that Company.

The new permission grants none of those independent prerequisites and adds no Client, pricing, Offer, Contract, Activity read, administration or cross-Company authority.

### 20.4 Public command and atomic result

`POST /commercial-intake/requests/{requestId}/client-association` requires `Idempotency-Key` and accepts exactly `{ expectedVersion, clientAccountId }`. A valid material success returns `200 { receipt: { requestId, version: 2, outcome: "associated" }, request }`, where `request` is the current permission-filtered Request detail and the receipt is the immutable command result.

One successful transaction commits all of the following or none:

1. the Request's original Client Account reference through the Client owner's public operational-reference boundary and its existing Client, relationship, union and reversal fence;
2. the Request transition from version 1 to version 2;
3. one durable command receipt;
4. exactly one `client_request.client_associated` event with metadata `{ "requestVersion": 2 }`.

The Commercial Intake module does not copy Client lookup, relationship, union, reversal or legal-entity rules. The server establishes the actor, Company, resulting version and event time.

### 20.5 Validation, replay and safe refusals

Unknown fields, malformed identifiers and an invalid version are field-specific `400` responses. Missing verified identity returns `401`. Missing, revoked, inactive, null, unknown, v1 or v2 association authority returns the existing safe `403`.

An unknown, cross-Workspace, cross-Company or unreadable Request uses the existing Request-detail not-found response. A stale Request version returns `409 STALE_VERSION`. Any stored association, visible or hidden, returns `409 CLIENT_ALREADY_ASSOCIATED` without a Client identifier or label. An unknown, inaccessible, inactive, unrelated, superseded or concurrently invalidated Client returns `CLIENT_REFERENCE_UNAVAILABLE`, matching capture. Reusing a key with changed input returns `409 IDEMPOTENCY_CONFLICT`. Every refusal writes no Request change, receipt or event.

The key is scoped to Workspace, Company and acting Membership. Its fingerprint covers the Request id, observed Request version and Client Account id. Current authority, Request visibility and selected-Client availability are revalidated before replay. An exact replay is resolved before rejecting its now-stale observed Request version and returns the original receipt without another write or event. Concurrent exact retries converge on that receipt. An uncertain response preserves the exact payload, observed version and key for an explicit unchanged retry.

### 20.6 Concurrency and Client ownership

The Request row owns association ordering. Two associations submitted against version 1 commit at most one. A next-action update remains independent because it changes the Opportunity row and Opportunity version rather than the Request row.

Client union, reversal, relationship archive and Client mutation retain the Client owner's existing lock order, authorization and outcomes through its public operational-reference fence. A race cannot strand a Client reference, bypass a relationship, copy a Client rule into Commercial Intake or change any Client Legal Entity. A harmless Client correction that preserves the authorized relationship may proceed under that existing owner contract.

### 20.7 Pricing ordering and immutable history

Pricing calculation and association use a compatible lock on the Request row when reading or changing its nullable stored Client reference. When calculation races with the first association of a previously unassociated Request, obtaining the lock first means its immutable Snapshot stores no Client reference and association may commit afterwards. If association commits first, the new Snapshot stores the original Client reference. A race never produces a partly associated Snapshot or a stranded Client reference.

No existing Pricing Snapshot is rewritten, backfilled or re-pointed. After association, a fresh calculation creates a new Snapshot that stores the reference and later reads return the Client owner's current visible projection. Losing Client read authority hides only that projection; it does not erase the stored association or make the Request eligible again.

### 20.8 Activity, reads and interface states

The association event targets the Request in its responsible Company, attributes the acting Membership at server time and contains only `requestVersion`. Failed, denied and replayed commands create no event. Its projection is allowed only through section 17's existing Company Commercial Activity Reader plus current `commercial.request.read`; it never reveals a Client identifier, label or relationship.

Prisme and Classic Request detail show “No Client associated” only when the stored association is absent. “Associate a Client” appears only with effective v3 association permission and current Client read authority, and reuses the capture form's authorized Client search. Empty selection, unavailable Client, stale or already-associated state, denial, uncertain outcome and success are explicit. Authority, identity or Company changes clear the draft and late responses never render. Success refreshes detail and any loaded list row and exposes the existing dossier action when the current projection is visible. The flow is usable by keyboard at 1440 px and 390 px.

### 20.9 Migration and acceptance

The implementation is additive. Existing Requests and assignments are unchanged: associated version 1, unassociated version 1 and newly associated version 2 are all valid, while version 2 without a stored Client reference is invalid. Migration proof covers both existing version 1 forms and proves that neither is rewritten.

The highest stable seam is the public REST interface against PostgreSQL, followed by the real browser journey. Acceptance proves:

1. success, restart persistence, version 2, one receipt and one minimal event;
2. permission, Company, Workspace, Request and Client isolation, including revocation and hidden-projection cases without metadata leakage;
3. exact replay, changed-payload conflict, two-association convergence and atomic rollback;
4. deterministic races with Pricing calculation and the Client owner's union, reversal, relationship and correction fences;
5. unchanged Request evidence, Company, Opportunity, responsible actor, Client identity, Client relationship and every Client Legal Entity;
6. detail and list projection, then capture without a Client → associate → calculate a fresh Snapshot → reload → reopen → Client dossier at desktop and narrow width.

Every existing Request-create and read prerequisite accepts v3 because it contains the v1 permissions, and next-action update accepts v2 or v3 because both contain its permission. No contained-permission check treats the bundle's newest version as the only valid version.

### 20.10 Exclusions and unresolved question

Excluded: replacing, correcting or removing an association; creating a Client or Client–Company Relationship from the Request; selecting or changing a Client Legal Entity; rewriting or backfilling any Pricing Snapshot; Opportunity reassignment, status, stage or additional Opportunities; pricing formulas; Offer or Contract behaviour; external messages; CSS redesign; and any permission beyond Intake v3's one association permission.

The approved sources do not decide whether an Offer may reuse a Pricing Snapshot created while the Request still had no Client after a later association. This section neither permits nor forbids that reuse. Its complete demonstration calculates a fresh Snapshot after association, preserving a usable Request → Pricing → Offer path without inventing Offer policy or rewriting history.
