# PRD — Release 3 Commercial Workflow, section 16: Approved provisional Opportunity next-action update (#306)

Part of the [Release 3 Commercial Workflow PRD](release-3-commercial-workflow-prd.md). Section and subsection numbers are unchanged; cross-references such as “section 16.4” point to the numbered section in its own file, listed in the [core PRD index](release-3-commercial-workflow-prd.md#sections-by-capability).

## 16. Approved provisional Opportunity next-action update (#306)

This section normalizes one reversible MVP execution choice under the provisional authority of sections 1 and 15. It is not confirmed Iurie business policy. It decides the next-action mutation after R3A1; section 21 decides reassignment, and every other edit and transition stays excluded.

### 16.1 Observable outcome

An authorized user working in a server-validated active Company opens a Company-owned Request detail, replaces the next action of its Opportunity and receives the stored new text with an incremented Opportunity version. The Request detail and the bounded active-Company list show the new next action after reload and after a process restart. Nothing else about the Request, the Opportunity or the Client association changes.

### 16.2 Explicit permission

The [authorization PRD](tenant-company-client-authorization-prd.md#8-initial-permission-families) owns captured **Company Commercial Intake v2**, whose permission set is v1 plus `commercial.opportunity.next_action.update`. Existing v1 assignments never expand in place; only an explicit revocation followed by a fresh grant captures v2, and null or unknown captured versions fail closed.

Authority to update is not ownership. Any holder of the captured v2 bundle in the responsible Company may update the next action whether or not they are the responsible actor, and the command never transfers responsibility, changes the durable status, assigns a sales stage, reassigns the Opportunity or grants Client, pricing, Offer, Contract, administration or Activity Log authority. The R3A1 rule that the creator is the initial responsible actor is preserved; only section 21 changes the responsible actor.

### 16.3 Input, immutability and server-owned fields

The command accepts exactly one business field, the next action, under the R3A1 rule: required, 1–500 characters, at least one non-whitespace character, stored exactly as submitted without trimming or normalization. The command carries the Opportunity identifier, the observed Opportunity version and an idempotency key.

Original request text, source kind, source label, reported received time, subject, Opportunity title, scope, status, responsible actor, Client association, Company, Workspace and capture time remain immutable through this command. The server owns the resulting version, the updating actor membership and the update time; a client never submits them.

The Request detail read returns the current Opportunity version so an authorized user can supply it; the Opportunity version stops being a fixed value while the Request version stays fixed. No separate Opportunity read route is introduced.

### 16.4 Expected version, idempotent receipt and concurrency

A material update commits the new next action, the incremented Opportunity version, the durable command receipt and the required Activity event in one transaction. A failed validation, safe denial, stale version or persistence conflict commits none of them.

The observed version must equal the current Opportunity version. A mismatch returns a safe conflict, changes nothing and requires an explicit reload before retrying. Concurrent updates on the same observed version allow at most one material outcome.

The idempotency key is scoped to the Workspace, Company and acting membership. Its fingerprint covers the target Opportunity, the observed version and the next-action text exactly as submitted. An exact retry revalidates the current membership, Company context, captured bundle version and target visibility before returning the original receipt without repeating any write; revoked authority returns the normal safe denial and no new event. The exact retry is resolved before its now-stale observed version is rejected. Reusing the key with any different input returns a safe conflict.

A submitted next action byte-identical to the stored value is a no-op. It must still pass current authorization, target visibility and expected-version checks. It stores an unchanged durable receipt at the same version without an Activity event. Exact no-op replay returns that receipt after current-authority revalidation even if another command has since changed the Opportunity; changed reuse of its key conflicts. A receipt confirms a past command result, not the current state, which is refreshed separately.

Authorization is serialized with relevant membership suspension and assignment revocation through the existing Access boundary. This command does not mutate or newly bind the Client association and requires no additional Client read grant; all responses retain the existing permission-filtered optional Client projection.

### 16.5 Activity and history

One committed material update records exactly one `opportunity.next_action.updated` event, attributed to the acting membership and scoped to the responsible Company. Its metadata contains the resulting Opportunity version only; it contains no previous or new next-action text, request text, subject or Client-confidential content. Failed commands, safe denials, no-ops and exact retries create no event. The [Activity Log PRD](activity-log-accountability-prd.md#7-authorization-and-privacy) owns the recording boundary and section 17 owns any authorized projection of that event.

### 16.6 Error, permission and UX states

- missing verified identity returns `401`;
- inactive membership, a missing or legacy-version captured bundle, or an invalid active Company returns a safe `403` without hidden metadata;
- an unknown, cross-Company or cross-Workspace Opportunity uses the same safe not-found response as Request detail, and no list, count, label or event discloses it;
- an invalid next action returns field-specific validation without persistence;
- a stale observed version and a changed idempotency payload each return a safe conflict.

The form edits the next action from the Request detail, keeps the active Company and immutable source fields visible, preserves the entered value after a correctable validation error, preserves the original payload, observed version and key for an explicit retry after an uncertain outcome, and requires an explicit reload after a conflict. Loss of update authority clears the edit draft and any pending command; read-only detail remains only if current read authority is still valid. Broader Company, Workspace, membership or session invalidation clears scoped content and rejects late responses. Loading, denied, missing, conflict and narrow-screen states are explicit and inherit the UX PRD.

### 16.7 Testing and acceptance

The highest stable seam is the public REST interface against PostgreSQL, followed by the existing browser journey for the real edit and reload. The vertical issue proves authorized update and exact persistence; preserved immutable Request, source, title, scope, status and responsible actor; version increment and reload after restart; exactly one attributed event with version-only metadata; stale-version conflict, changed-payload conflict, exact-retry convergence after current-authority revalidation, and no-op behaviour; atomic rollback; cross-Company and cross-Workspace denial without leakage; and no implicit update authority from a legacy v1 assignment.

### 16.8 Exclusions and unresolved ambiguity

This section excludes Opportunity title, scope, Client-association and status editing, reassignment, sales stages, deletion, bulk edits, scheduling, reminders and any external effect. Reassignment is owned by section 21.

Unresolved and deliberately not presented as business fact: whether a commercial next action should remain free text or later become a structured, dated commitment owned by the Task capability; whether a future business rule should restrict updates to the responsible actor or a commercial manager; and whether the Opportunity should later expose its own next-action history outside the Activity Log. Iurie's validation under section 15 may correct any of these.

[Section 34](release-3-commercial-34-opportunity-follow-up-date.md) separately owns an independent optional manual Opportunity follow-up marker. It does not change this section's text-only command or resolve Task-owned structured commitments, reminders or the other open business questions above; its own status and readiness apply.
