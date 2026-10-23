# HTTP response migration candidates (noncanonical)

Source `92f502415999f33ec2f056ba0871706892bf7fd3`; base
`53de3106951083eeb8e726a663476a26dbe3ff41`. Paths are relative to
`apps/web/src/`. Mandatory TypeScript policy was read first.
No source edits, tests, builds or live checks.

Transport JSON assertion: `api/authenticated-api-client.ts:118`. `rg` found
these candidates outside the four migrated Client operations. These are not confirmed
production bugs or authorization bypasses. Server authorization is authoritative.
Test seams were inspected, not run; malformed-payload coverage is not established.

| Priority | Public owner / static evidence | Existing test seam | Cost and compatibility |
| --- | --- | --- | --- |
| 1 | Shell actor bootstrap/selection: `production-shell/authenticated-production-shell-transport.ts:13` requests `ActorContext` without decoding; initialization consumes it (`production-shell/production-shell-session.ts:268`). | `production-shell/production-shell-session.test.ts:201,221,436`: rejection, restoration and refresh; mock transport; add HTTP fixtures at the adapter. | `access-types.ts:1` holds identity, optional Company, permissions and versions. One actor contract should serve rows 2–3. Preserve delivered optional/legacy variants; reject unrecognized authority deliberately. |
| 2 | Resource-403 recovery: `api/latest-authenticated-request.ts:71,92` reads selected/Workspace actors and forwards successful values (`:82,108,110`). Checking optional Company ID does not prove the full actor. | `api/latest-authenticated-request.test.ts:86,148,181`: fetch-based revalidation, revoked Workspace access and transient failures. | Reuse the actor owner. Preserve transient-error versus forbidden-context meaning, cancellation and Workspace fallback; this helper has broad callers. |
| 3 | Self-assignment refresh: `access/CompanyContextAccess.tsx:327` reads an actor after a mutation and publishes it (`:343`). | `access/CompanyContextAccess.test.tsx:2291,2467,2541`: self grant, context removal and revalidation retry with the command key. | Same format, different workflow: prove the response before authority publication while retaining assignment state, retry identity and canonical reload. |
| 4 | Dossier correction/read: `client/ClientDossierPanel.tsx:171,274` trusts a local interface. PATCH clears its retry key before draft conversion (`:345–349`); GET publishes raw data (`:202`). Conversion maps Contacts (`:766`); rendering joins Company names (`:544`). | `client/ClientWorkspace.test.tsx:300,602`: versioned correction/stale reload; `App.client-corrections.test.tsx:310`: membership replacement. | Nullable fields, Contacts and versions exceed the summary decoder. One reader can serve GET/PATCH. Preserve old valid optional Contact fields and uncertain-command retry. Keep historical/storage validation separate. |
| 5 | Company registration: `company/CompanyRegistration.tsx:119,132` trusts POST/GET as `CompanyRecord`. POST ID selects readback URL (`:133`); readback is published and clears retry state (`:162–164`). | `ApplicationRoot.test.tsx:210–266`: fetch-based retry/readback with stable command identity; `App.test.tsx:665`: stale Workspace result. | Prove POST identity before readback, then Company fields before success/callback. Preserve canonical readback/idempotency; do not silently add UUID, nonblank or date-normalization rules. |
| 6 | Suspension acknowledgement: `access/WorkspaceMembershipSuspension.tsx:130` declares a receipt but never consumes its body. Success uses HTTP status; other-member success requires reload (`:162–167`), while self-suspension exits immediately (`:149–155`). | `access/CompanyContextAccess.test.tsx:798,1039,1117,1156`: confirmation/self-exit/stale recovery. | Decide status-only acknowledgement versus target-identifying receipt first: decoding unused fields is not automatically useful. Retain immediate self-access removal and canonical reload; an annotation change alone proves nothing. |
| 7 | Company discovery: `production-shell/authenticated-production-shell-transport.ts:18` omits explicit `T`, but its interface promises `VisibleCompany[]` (`production-shell/production-shell-session.ts:26`). Values drive length/ID selection (`:474–478`) without adapter proof. | `production-shell/production-shell-session.test.ts:51,221,250`: discovery and persisted/stale selection via mocked transport; HTTP fixtures belong at the actual adapter. | Small shape (`company-context-transitions.ts:10`), but preserve order and empty/one/many behavior. Visible IDs do not establish selection authority: retain actor revalidation. |

Share actor/dossier owners; rows are not separate issues. Scope one actor
boundary or command-confirmation flow before implementation. No new dependency. Direct fetches, decoded `request<unknown>` flows, backend and
stored JSON are not exhaustively audited. This creates no canonical policy.
