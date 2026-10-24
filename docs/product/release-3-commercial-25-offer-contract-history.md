# PRD — Release 3 Commercial Workflow, section 25: Approved provisional Offer and Contract history in the commercial Activity Log (HI-4)

Part of the [Release 3 Commercial Workflow PRD](release-3-commercial-workflow-prd.md). Section and subsection numbers are unchanged; cross-references such as “section 16.4” point to the numbered section in its own file, listed in the [core PRD index](release-3-commercial-workflow-prd.md#sections-by-capability).

## 25. Approved provisional Offer and Contract history in the commercial Activity Log (HI-4)

This section normalizes one reversible MVP execution choice under the provisional authority of sections 1 and 15. Dan approved its direction on 2026-10-11 ([decision record on #290](https://github.com/Prisma-Prim/PRISMA-PRIM-Suite/issues/290#issuecomment-6113125561)): the Offer and Contract events already recorded under sections 18.10 and 19.12 become readable in the commercial Activity Log, so an authorized reader can follow a commercial case from Request to signed agreement and reopen the exact version each event concerns. It replaces P15 and PC18 ("recorded but not projected") and records no new event.

Sources:

- decision record §14.8 and §14.15, and the [Activity Log PRD](activity-log-accountability-prd.md#6-critical-event-families) §6: approval, rejection, acceptance evidence, Contract execution and post-signature instruments are critical attributed events;
- sections 17.3, 18.10 and 19.12: the existing projection rule and the recorded Offer and Contract event families with their metadata limits.

### 25.1 Projected actions and authority

The section 17.3 rule applies, with its Offer and Contract target predicates defined here: active membership, the server-validated active Company equal to the event's responsible Company, `commercial.activity.read` in that Company, and current read authority on the event's target. Reading an Offer or Contract target means its complete read prerequisite under sections 18.6 and 19.6: `commercial.offer.read` or `commercial.contract.read` together with current `commercial.opportunity.read` visibility of the owning Opportunity; neither permission alone suffices. Partial authority fails closed, and no count, label or ordering value discloses an event the actor cannot read.

| Family   | Actions                                                                                                                                                                       | Target read required       |
| -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------- |
| Offer    | `offer.created`, `offer_version.created`, `offer_version.approved`, `offer_version.rejected`, `offer_version.transmission_recorded`, `offer_version.client_response_recorded` | `commercial.offer.read`    |
| Contract | `contract.created`, `contract_version.created`, `contract_version.approved`, `contract_version.rejected`, `contract_version.signature_recorded`, `contract_project.linked`    | `commercial.contract.read` |

`contract_project.linked` concerns two targets, so it is projected only when the actor can currently read both the Contract, as above, and the linked Project under the Project owner's read rule (Project read and its Client boundary), as the [Activity Log PRD](activity-log-accountability-prd.md#7-authorization-and-privacy) requires for relationship events; otherwise the whole event is omitted. `project.created` stays with the Project owner and is not added here. Unknown actions and metadata outside the section 18.10 or 19.12 shape fail closed, except the closed source-provenance metadata variant defined by [approved-estimate internal preparation §26.7](release-3-commercial-26-estimate-offer-preparation.md#267-activity-storage-and-compatibility). That variant adds no returned field: economic source identities/decisions remain Offer content, costs remain protected, and §25.2's minimal projection is unchanged.

### 25.2 Returned content

A projected event returns the section 17.3 fields: canonical action, responsible Company, actor label, server time and a readable target reference. In addition, from the recorded metadata and the immutable illustrative reference of the current target:

- **Offer events:** the Offer's illustrative reference and the version number; for a Client response, its outcome (`ACCEPTED`, `REJECTED` or `EXPIRED`); for a transmission or response, the simulated provenance marker.
- **Contract events:** the kind (`CONTRACT`, `PRECONTRACT` or `ADDENDUM`), the illustrative reference and the version number; for a signature, the simulated provenance marker; for a Project link, whether the Project was created and the Project's reference.

Nothing else is returned: no amount, condition, scope, reason, note, signatory label, user-entered date, party identity, Snapshot content or warning text. An event whose Offer, Contract, owning Opportunity or linked Project can no longer be resolved is omitted entirely, because its read authority cannot be established; it is never shown with an unavailable reference.

### 25.3 Navigation

Each projected event offers one link to its target, which section 25.1 has already proven readable: it opens the Request detail of the Opportunity that owns the Offer or Contract, with the exact Offer Version or Contract Version the event concerns selected, including a superseded version. Opening a link after authority was lost returns the existing safe denial or not-found.

### 25.4 Compatibility, testing and delivery

Already recorded events become readable without rewriting, duplicating or backfilling them; their order, page boundaries and the existing Activity Log page are unchanged. The highest stable seam is the Activity read REST interface against PostgreSQL, then the browser journey: perform an Offer sequence and a Contract sequence, read the events as an authorized reader, follow each link to the exact version, and repeat as a reader without `commercial.offer.read` or `commercial.contract.read`, as a reader holding them without `commercial.opportunity.read`, as a Contract reader who cannot read the linked Project, without `commercial.activity.read`, in another Company, and after revocation. PostgreSQL REST cases also prove that an event whose Offer, Contract, owning Opportunity or linked Project cannot be resolved is omitted together with its count contribution and reference, while a resolvable sibling event on the same page is still returned.

Two independently complete slices may deliver the Offer family and the Contract family in either order. The capability is credited once, when both are delivered.

Provisional choices for Iurie's validation: the exact projected action set, the returned fields, and the reuse of the opt-in Commercial Activity Reader v1 bundle with no new permission. Excluded: filters, search, export, Opportunity-level timelines outside the Activity Log, Project events, notifications, and any new event or metadata field.
