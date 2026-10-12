# PRD — Release 3 Commercial Workflow, section 22: Controlled commercial evidence October 2026 (#493)

Part of the [Release 3 Commercial Workflow PRD](release-3-commercial-workflow-prd.md). Section and subsection numbers are unchanged; cross-references such as “section 16.4” point to the numbered section in its own file, listed in the [core PRD index](release-3-commercial-workflow-prd.md#sections-by-capability).

## 22. Controlled commercial evidence October 2026 (#493)

**Status:** Source reconciliation only; no change to the provisional execution contracts of sections 18–20.

The [controlled-source matrix](commercial-source-reconciliation-2026-10.md) preserves provenance for the newly received primary dossier and comparison material. Received examples now support preparation of questionnaire, Offer, Contract and annex models. They do not approve reusable Templates, legal clauses, operational prices, thresholds, acceptance evidence, signatures or transmission. Existing `ILLUSTRATIVE` records and O1–O8/C1–CP2 dependencies remain unchanged.

### 22.1 Case-specific acceptance and the C1 prerequisite

Evidence E02 describes one real case: after transmission of the Offer, the Client supplied details for the Contract, then signed the Contract and paid. Iurie considers acceptance confirmed by explicit progression to the Contract and its signature. E07 p. 5 visibly contains both parties' signature areas. These statements do not establish a universal policy, verified payment, signatory mandate, cryptographic validity or a distinct pre-signature Client acceptance record.

The current illustrative route records a simulated acceptance in O6 before C1 creates a Contract from an Accepted Offer (sections 18.15 and 19.17). Applying E02 automatically would create a circular prerequisite: the signature that confirms acceptance would belong to a Contract that cannot yet be created. The real-use path therefore needs a separate explicit product decision; E02 does not silently waive C1's gate.

| Unapproved option                                                        | Consequence                                                                                                                            | Decision/evidence still needed                                                                                                                         |
| ------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Retain separate acceptance before Contract creation                      | Preserve O6 → C1; capture an explicit Client acceptance before preparation                                                             | Which pre-signature evidence suffices and who confirms it; legal details alone are not established acceptance                                          |
| Allow governed Contract preparation while Offer response remains pending | Distinguish preparation intent from acceptance; later signature may support a separately recorded acceptance of an exact Offer Version | Eligible states, exact version/concordance rules, actors, evidence and atomic/retry behavior; resolve unsigned, changed, rejected and cancelled drafts |

Neither option is selected. The future decision must distinguish internal approval, intention to proceed, Client acceptance, Contract preparation, signature and execution. No retroactive automatic acceptance, new permission or runtime state is introduced. Section 19.3's governed direct origin is an existing exceptional route; it is not an automatic workaround for an Offer awaiting acceptance and does not turn received historical files into imported Contracts.

OQ3 in section 18.13 now has case-specific evidence, but the general rule and confirmation authority remain open. OQC1/OQC2 in section 19.15 still require complete signing, mandate and effect policy. The remaining request is targeted policy/evidence for these gaps, not repetition of E02's already-described sequence.

### 22.2 Numbering direction without an invented final rule

E02 explicitly requests separate configurable rules for Offers and Contracts: assignment moment, annual restart and cancelled-number handling. It also states that the final internal rules are not sufficiently formalized yet. This confirms configuration direction compatible with the Governed Documents PRD §8; it supplies no operational default.

OQ2 and OQC5 remain open for the final format and policy by issuing Company and applicable Contract kind. A number visible in a received file proves neither an assignment moment nor a counter/reset rule. The existing illustrative references P3/PC6 stay non-official. Existing decided preservation of cancelled numbers is retained; unresolved handling details are not filled by reusing or deleting a number.

### 22.3 Template and field evidence

E04 supplies candidate qualification fields for activity, staffing, locations, existing documentation, risk, objectives and requested timeframe. E05 supplies an Offer section/layout example; E06/E07 supply parties, scope, term, financial conditions, signature areas and an activity/result annex. These are received examples, not approved mandatory fields, clauses, Project Tasks or completion facts. Governed Documents §14 owns Template validation; the substitution register owns the reduced input requests.

The Offer filename/content year, Contract/annex date and Standard edition disagreements are explicit contradictions in the source matrix. Preserve the originals and validate a correcting reusable model with its responsible owner. No source is rewritten, no legal precedence is inferred, and no generic Standard edition is silently selected.

The [candidate field/section mapping and review skeletons](commercial-candidate-models-2026-10.md), prepared under #495, now locate these fields without copying received clauses or case values. They preserve separate Offer-stage and Contract-annex inventories, flag contradictory placeholders and document limited legacy-conversion comparison. They are non-canonical preparation, not new mandatory fields or approved Templates; sections 18–20 and the unresolved choices above remain unchanged.
