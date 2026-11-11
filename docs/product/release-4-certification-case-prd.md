# PRD — Certification Case: first ISO 22000 initial certification journey

**Status:** Approved — bounded first journey under delegated agent product review; runtime delivery tracked by the implementation children listed in section 23

**Version:** 1.0  
**Owner:** Dan Popescu  
**Direction and tracker:** [#1129](https://github.com/Prisma-Prim/PRISMA-PRIM-Suite/issues/1129), following [Product Vision §11.1](product-vision-prd.md#111-first-working-version-priorities--2026-11-06) and [decision record §34.10](consolidated-product-decision-record.md#3410-bic-pilot-direction-and-source-qualification--2026-11-06)

## 1. Authority and downstream consumers

This PRD is the first Release 4 capability contract. It owns one complete, human-decided **initial certification of a management system against ISO 22000:2018**, carried out by a certifying Company of the Workspace for one certified Client Legal Entity: application, application review, audit duration, certification agreement, audit team, Stage 1 and Stage 2 Audits, Findings with their exact evidence, nonconformity follow-up, team recommendation, dossier review, Certification Decision and the recorded Certificate.

It applies, without restating them, the approved assurance decisions [DEC-076 to DEC-099](consolidated-product-decision-record.md#dec-076--separate-audit-decision-credential-and-training-facts): separate Audit, Decision and Credential facts; configurable labels for Audit types; versioned scope and planning; team role, competence and conflict declarations; separate Finding and corrective-action lifecycle; preserved human judgment; separate immutable Certification Decision; restrictive separation of duties; distinct Company-scoped permissions; automation that prepares but never decides.

Authority owners remain:

- [Tenant, Company, Client and Authorization](tenant-company-client-authorization-prd.md): Workspace isolation, Company scope, captured role assignments and the denial contract;
- [Activity Log and Accountability](activity-log-accountability-prd.md): attributable events in the same transaction;
- [Governed Documents](governed-documents-prd.md) and [Document Registry](release-1-document-registry-prd.md): Documents, immutable Versions, PDF content and Project association;
- [Shared Client](release-1-shared-client-prd.md): Client Account and Client Legal Entity;
- [Project and Task](release-1-project-task-prd.md): the Project that carries the certification order;
- [UX, Localization and Configuration](ux-localization-configuration-prd.md): Prisme presentation, ro/ru/fr/en copy, accessibility.

Downstream consumers: the implementation children in section 23, the private pilot verification (section 20.3) and later surveillance, recertification and Credential lifecycle contracts.

### 1.1 Source qualification (DEC-099 and DEC-139 for this journey)

On 6 November 2026 the first tenant supplied, privately, the certification body's certification procedure, its blank forms, the ISO 22000 specific forms, the duration calculator and one complete, signed initial-certification dossier (questionnaire through Certificate). Agents inspected them privately. This PRD records only generic conclusions: the steps, roles, separation of duties, record families, decision points and deferred scope that apply to an initial ISO 22000 certification. It contains no case identity, wording copied from the procedure or forms, signatures, numbering or source metadata; originals and working copies stay outside Git.

For the initial ISO 22000 certification journey, this inspection satisfies the inventory required by DEC-099 (Companies, Scheme, terminology, role separation, numbering, cycle, Findings and a representative case) and DEC-139 (document families, actors, correction paths and evidence). Surveillance, recertification, transfer, multi-site, combined and special audits remain uninventoried for implementation purposes (section 7).

## 2. Problem

Today a certification dossier is a folder of Word and PDF forms. The forms repeat the same facts (client, scope, category, dates, team) and drift apart: an editable copy can state another audit type or date than the signed PDF, a dossier checklist can mark a document absent while it is in the archive, and a blank review form can arrive with every answer pre-filled as compliant. Nothing proves that a nonconformity was verified before the decision, that the decision maker was independent of the audit team, or which exact evidence supports a Finding.

## 3. Outcomes and measurable value

1. One Certification Case holds every fact of an initial certification once, with its history; the dossier can be reconstructed without reopening folders.
2. Each step is a recorded human act with an identified actor, time and reason for any correction.
3. Every Finding opens its exact supporting evidence (DEC-076, Product Vision §11.1).
4. The Certification Decision cannot be recorded while a precondition fails or by a member of the audit team.
5. The Certificate facts (holder, address, scope, number, dates) come from confirmed data, not retyping.
6. The private pilot dossier can be replayed through the application and every recorded fact compared with its signed source (section 20.3).

## 4. Solution and principles

- **One Case, ordered steps.** A Certification Case moves through fixed steps (section 9). Each step records an immutable version; a correction creates a new version with a reason and never hides the previous one (Sarcina M09-R105).
- **Facts first, documents attached.** The application captures structured facts. Signed originals (agreement, plans, reports, participant lists, Certificate) are preserved as exact Document Versions and referenced, not re-entered.
- **Explicit confirmation.** No answer defaults to "compliant". A review item without an explicit answer blocks completion.
- **The calculator proposes, a person confirms.** The duration rule computes a proposal with its full breakdown; the programme manager confirms or adjusts it with a written justification (DEC-097).
- **Independence is enforced.** The person who approves the team, reviews the dossier and decides is not a member of the audit team of that Case (DEC-089).
- **Generic, configurable labels.** Stage 1 and Stage 2 keep stable technical identities; their displayed labels are localized copy (DEC-079).

## 5. Actors and ownership

A Certification Case belongs to exactly one Workspace and one certifying Company, one Client Account, one Client Legal Entity of that Client (the organization to be certified) and one Project of the same Company and Client (the certification order). It never appears to another Company.

| Actor                  | Who                                                                                                                      |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Certification reader   | Company member allowed to consult the Company's Certification Cases                                                      |
| Programme manager      | Prepares the Case: application, review, duration, agreement, team proposal, audit plans                                  |
| Auditor                | Member of the approved audit team who records audit results, Findings and verification                                   |
| Certification approver | Approves the team, reviews the dossier and records the Certification Decision                                            |
| Client (external)      | Supplies the application, signs the agreement, answers Findings, confirms Certificate data; never a user in this journey |

Audit team members are recorded as durable persons with a role. A member may be linked to a Workspace Membership; external auditors and technical experts may be recorded by name without an account.

### 5.1 Representative Companies and acts on behalf of the certification body

A certifying Company can be the representative of a certification body whose own staff review applications, approve durations and teams, review dossiers, decide and sign Certificates. The representative records those acts: each one stores who acted on behalf of the certification body (name, function), the business date and, when attached to the Case, the signed form, while the recording member stays attributed in the history. Every act that must come from outside the audit team (team approval, dossier review, decision, Certificate) also carries the recording member's explicit attestation that the acting person is not a team member, stored with the act; the system additionally refuses a recording member linked to the team and an acting person named like a team member. A Stage report approved on behalf of the certification body follows the same name rule, and its approver cannot join a later team version; this is a conservative default until the certification body confirms it. No act on behalf of the certification body is dated after the latest calendar date already reached anywhere (UTC+14). Names alone never prove identity; a person register is a later contract.

## 6. Numbered user stories

1. As a programme manager, I open a Certification Case from a Project of my Company, for one Client Legal Entity, for ISO 22000:2018 initial certification, with the certification order reference.
2. As a programme manager, I record the client's application facts (organization, sites, scope requested, food chain category, headcount, shifts, HACCP studies, existing certifications, language) and attach the signed questionnaire.
3. As a programme manager, I correct an application fact with a reason and still see the earlier value.
4. As a programme manager, I review the application against each review criterion (scope and category can be certified, a competent team exists, a competent decision maker exists, impartiality and other risks are acceptable), answering each explicitly with a note, and accept the application or reject it with the reason given to the applicant.
5. As a programme manager, I obtain the duration proposal computed from the confirmed application facts, see each component, and confirm it or adjust it with a justification.
6. As a programme manager, I record the signed certification agreement with its date and exact PDF.
7. As a programme manager, I propose the audit team (one team leader, auditors, technical experts, observers), with each member's competence for the client's food chain category and explicit impartiality declarations (no consulting for, employment by or involvement in the client's management system within the last two years; confidentiality).
8. As a certification approver, I approve or return the proposed team; I cannot approve a team I belong to.
9. As a programme manager, I plan each Stage: dates, on-site and remote auditor-days, objectives, scope, the exact plan PDF and the date it was sent to the client.
10. As an auditor, I record the Stage 1 report: document review completed, conclusion on readiness for Stage 2, its Findings, the exact report and participant-list PDFs.
11. As a programme manager, I cannot plan Stage 2 while Stage 1 concludes "not ready" or a Stage 1 nonconformity is not verified as eliminated.
12. As an auditor, I record the Stage 2 report and its Findings; each Finding states the requirement clause, the process or area, the statement, its classification and, for a nonconformity, at least one exact evidence reference.
13. As anyone allowed to read the Case, I open the exact evidence of a Finding.
14. As an auditor, I record the client's correction, cause analysis and corrective-action plan for a nonconformity, the team leader's judgment of its adequacy, and the verification of its implementation.
15. As the team leader, I record the team recommendation: grant, do not grant, or additional audit needed.
16. As a certification approver, I review the dossier item by item and record each item as present, missing or not applicable, distinct from the document archive, and I may reclassify a Finding with a reason.
17. As a certification approver who is not on the audit team, I record the Certification Decision with its rationale once every precondition holds; otherwise I see which preconditions fail.
18. As a programme manager, I record the Certificate data agreed with the client (holder name, address, scope wording per Certificate language) with the exact signed agreement form.
19. As a certification approver, after a granting decision, I record the issued Certificate: its number, the exact Certificate PDF, and the validity computed from the decision date.
20. As any reader, I see the Case timeline: every version of every step, with actor, time and reason, and the derived deadlines (nonconformity responses, first surveillance).
21. As a Company administrator, I assign and revoke the four certification bundles; an unassigned member sees nothing.

## 7. Scope and exclusions

In scope: one initial certification Case per order, one standard (ISO 22000:2018), one site or several sites audited together without sampling, two Stages, Findings, nonconformity follow-up, recommendation, dossier review, decision, Certificate record, non-official generated dossier register.

Deferred, each requiring its own inventory and contract: surveillance and recertification audits and the three-year audit programme beyond the initial cycle dates; transfer of accredited certification; multi-site sampling; combined or integrated audits; special, additional and short-notice audits; suspension, withdrawal, reduction and extension of scope; Certificate reissue and public verification (QR); auditor qualification records and monitoring; complaint and appeal handling; outgoing client communications; generation of the certification body's own forms; dictaphone and AI assistance; fees and invoicing.

## 8. Domain concepts and minimal fields

| Concept                    | Meaning and minimal content                                                                                                                                                                                                                   |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Certification Case         | The initial certification of one Client Legal Entity by one Company against one Standard Edition; order reference unique within the Company; current step                                                                                     |
| Certification Application  | Versioned client facts: legal name and address as declared, sites, requested scope, food chain category and subcategory, headcount, shifts, HACCP studies, other certified systems, outsourced processes, languages, source Document Versions |
| Application Review         | Versioned explicit answers to the four review criteria with notes, and the outcome accepted or rejected with the reason communicated to the applicant                                                                                         |
| Duration Determination     | Rule version, input snapshot, computed components, proposed and confirmed auditor-days per Stage and for surveillance and recertification, adjustment and justification                                                                       |
| Certification Agreement    | Signature date and the exact signed Document Version                                                                                                                                                                                          |
| Audit Team                 | Versioned members: person, role, linked membership if any, competence for the category, impartiality declarations each confirmed, conflict or to verify, documented impartiality analysis; approval outcome                                   |
| Audit                      | One Stage of the Case: plan (dates, auditor-days on site and remote, objectives, scope, plan Document Version, date sent), report (date, document review completed, conclusion, report and participant-list Document Versions)                |
| Finding                    | A formal statement in one Audit: sequence, requirement clause, process or area, statement, classification, evidence references, classification history                                                                                        |
| Nonconformity Response     | For a nonconformity: correction, cause, corrective action and dates received, the team leader's adequacy judgment, verification outcome, method and date                                                                                      |
| Team Recommendation        | The team leader's recommendation (grant, do not grant, additional audit needed) and its basis                                                                                                                                                 |
| Dossier Review             | Versioned item answers present, missing or not applicable, with notes, and reclassifications with reasons                                                                                                                                     |
| Certification Decision     | Immutable decision granted or refused, rationale, additional information used, decision date, the decider and function, the signed form, the holder/address/scope texts it grants per language                                                |
| Certificate Data Agreement | Holder name, address and scope wording per Certificate language, as agreed with the client, with the exact signed form                                                                                                                        |
| Certificate                | Number unique within the Company, validity from the decision date to three years minus one day later, holder/address/scope per language equal to the decision, signatory, exact Certificate Document Version                                  |

Finding classifications for this journey: **major nonconformity**, **minor nonconformity**, **opportunity for improvement**, and, in Stage 1 only, **area of concern** (a problem area recorded at Stage 1). Classification is the team leader's judgment; the certification approver may reclassify with a reason. Every classification remains in the history.

## 9. Lifecycle, correction and history

Steps, in order:

1. `application` — recorded, correctable until the review is accepted.
2. `application_review` — accepted or rejected. Rejection closes the Case; a new application opens a new Case.
3. `duration` — confirmed determination; a correction after confirmation requires a reason.
4. `agreement` — recorded signed agreement.
5. `team` — proposed, then approved or returned; a later change re-opens approval.
6. `stage_1` — planned, then reported with the document review completed and a readiness conclusion.
7. `stage_2` — planned only after a Stage 1 conclusion "ready" and once every Stage 1 nonconformity is verified as eliminated; reported with Findings.
8. `findings_follow_up` — every nonconformity answered; major nonconformities implemented and verified; minor nonconformities with a plan judged adequate.
9. `recommendation` — recorded by the team leader.
10. `dossier_review` — completed by an approver.
11. `decision` — the first version fixes the outcome; a later version corrects only the granted texts and references, with a reason, until the Certificate is recorded ([#1152](https://github.com/Prisma-Prim/PRISMA-PRIM-Suite/issues/1152)).
12. `certificate` — data agreed with the client, then the Certificate recorded after a granting decision.

The [certification dossier control PRD](release-4-certification-dossier-control-prd.md), ready for product review, restates the decision rule and proposes the Certificate data before the dossier review, the Certificate release circuit and revisions after issuance.

Derived dates, displayed and never stored as decisions: the response due date of a nonconformity (two weeks after the last day of its Audit); the six-month limits of section 10; the Certificate expiry; the latest start of the first surveillance (twelve months after the decision). A Case that passes a six-month limit cannot continue in this journey; repeating a Stage or an additional audit belongs to a later contract.

Every step record is an immutable version with actor, time and, from the second version, a reason. The Case keeps a revision counter; every command states the revision it expects and is refused as stale otherwise. Commands are idempotent per idempotency key. Nothing is deleted.

## 10. Invariants and prohibited outcomes

- A Case, its records and evidence never cross Workspace or Company boundaries; hidden and missing Cases receive the same denial.
- A step cannot be recorded before its predecessors hold (section 9).
- No review criterion, dossier item or impartiality declaration is stored without an explicit answer; nothing defaults to compliant.
- An application is accepted only when every review criterion is answered positively.
- A team has exactly one team leader; at least one team leader, auditor or technical expert holds the client's food chain category; when the team leader does not hold it, a technical expert who holds it is a member. A team is approved only when every member declares no conflict. Technical experts and observers never reduce the confirmed duration.
- A Finding classified as a nonconformity has at least one evidence reference; every reference resolves to an exact preserved Document Version associated with the Case's Project.
- The team approver, the dossier reviewer and the decision maker are not linked to any member of the Case's audit team, in any version; acts recorded on behalf of the certification body carry the recording member's independence attestation; a person approving a Stage report on behalf of the certification body is not named like a team member; no act on behalf of the certification body is dated after today.
- A team is approved only when every impartiality declaration is confirmed; a declaration "to verify" blocks approval; when the application declares a consultant, the team carries a documented impartiality analysis.
- Stage 2 is not planned while Stage 1 is "not ready" or a Stage 1 nonconformity is unverified; a Stage 1 nonconformity unverified six months after Stage 1 stops the journey.
- The team leader cannot recommend "grant" while a major nonconformity is unverified; a major nonconformity unverified six months after the last Stage 2 day stops the journey.
- The Certification Decision is refused unless: application accepted, duration confirmed, agreement recorded, team approved, Stage 1 ready, Stage 2 reported, every major nonconformity verified, every minor nonconformity with a plan judged adequate, recommendation recorded, dossier review complete with no item missing. A grant contrary to the recommendation is refused in this journey.
- A Certificate is recorded only after a granting decision; it is valid from the decision date until three years minus one day later, computed and not editable; its holder, address and scope per language equal both the agreed Certificate data and the texts the decision granted; its number is unique within the Company.
- No automation records a review answer, classification, adequacy judgment, verification, recommendation, approval or decision.

## 11. Permission matrix

| Action                                                   | Reader | Programme manager | Auditor (on team) | Approver (not on team) |
| -------------------------------------------------------- | :----: | :---------------: | :---------------: | :--------------------: |
| Read Cases, timeline and evidence                        |   ✓    |         ✓         |         ✓         |           ✓            |
| Open Case, application, review, duration                 |        |         ✓         |                   |                        |
| Agreement, team proposal, Stage plans                    |        |         ✓         |                   |                        |
| Approve team                                             |        |                   |                   |           ✓            |
| Stage reports, Findings, responses, verification         |        |                   |         ✓         |                        |
| Classification, adequacy, recommendation (team leader)   |        |                   |         ✓         |                        |
| Dossier review, reclassification, Certification Decision |        |                   |                   |           ✓            |
| Certificate data agreed with the client                  |        |         ✓         |                   |                        |
| Issued Certificate                                       |        |                   |                   |           ✓            |

Each column is a separate captured Company role bundle (`company_certification_reader`, `company_certification_programme_manager`, `company_certification_auditor`, `company_certification_approver`), initially unassigned; every mutating bundle requires the reader bundle. The approver and auditor columns add the Case-level separation checks of section 10. Company or Workspace administration rights do not bypass them (DEC-089).

## 12. Documents, evidence and Activity

Signed originals and evidence use the existing Document Registry: a Document associated with the Case's Project, with an immutable PDF Version. A Case record stores the exact Version identifier it relies on; later Versions never replace it. Opening a reference uses the existing Document read authority in addition to Case read.

Each successful command records one Activity Log event in its transaction, with server-established actor, Company, Case and record version, and no free-text payload: `certification_case.opened`, `.application_recorded`, `.application_reviewed`, `.duration_confirmed`, `.agreement_recorded`, `.team_proposed`, `.team_decided`, `.stage_planned`, `.stage_reported`, `.finding_recorded`, `.finding_reclassified`, `.nonconformity_response_recorded`, `.nonconformity_plan_judged`, `.nonconformity_verified`, `.recommendation_recorded`, `.dossier_reviewed`, `.decision_recorded`, `.certificate_data_agreed`, `.certificate_recorded`. Refused, replayed and no-op commands record nothing.

The generated **dossier register** is a non-official PDF listing every step version and every referenced Document Version of a Case; it is never presented as a certification body form.

## 13. Configuration, localization and accessibility

All labels, including Stage names and classifications, are localized in ro, ru, fr and en. The food chain categories and requirement clauses are reference lists in code for ISO 22000:2018; adding another Standard Edition is a later contract. Forms follow the Prisme frame, keyboard operation and the 1440 px and 390 px layouts.

## 14. Source of truth and providers

The application is the source of truth for the Case facts it records; signed PDFs are the source of truth for what was signed. No external register, e-mail or e-signature provider is used.

## 15. Migration and compatibility

Additive schema with a reviewed Drizzle migration per implementation child. No existing record changes meaning. Historical dossiers are not imported; the private pilot is replayed through the public API (section 20.3).

## 16. Security, reliability and performance

Server-side authorization on every read and command, rechecked inside the transaction; idempotency keys and expected revisions; lists bounded and paged. Case content is confidential to the Company and excluded from logs and errors. Actual data waits for the verified backup restoration required by Product Vision §11.1.

## 17. UI states

A **Certification** tab in the Project workspace lists the Project's Cases and opens a Case page: a step rail with the state of each step, the current step form, the blocking preconditions in plain language, the timeline, and evidence links. Empty, loading, denied, stale (reload), uncertain (retry with the same key) and unavailable states are explicit.

## 18. Durable and reversible implementation choices

Durable: one Case per order; steps and invariants above; four bundles; exact Document Version references; immutable decision. Reversible, chosen by implementers: storage of step payloads (typed columns or validated JSON), the sequence of the step rail, the dossier register layout.

## 19. Testing decisions

- REST tests against PostgreSQL for every command: success, Company isolation, hidden-equals-missing, missing bundle, stale revision, idempotent replay, out-of-order step, separation-of-duties refusal, evidence outside the Project refused, and the Activity event inside the transaction.
- Pure-function tests for the duration rule with fictional vectors.
- App tests for the tab, step forms, blocking reasons and denied states; one Playwright acceptance journey runs a fictional Case from application to Certificate at 1440 px and 390 px.
- Migration test for each additive migration.

## 20. Acceptance journey and criteria

### 20.1 Fictional journey

A fictional dairy, "Lactis Demo SRL", applies for ISO 22000:2018 certification with one site, 40 employees, 2 HACCP studies and food chain category C. The programme manager opens the Case on the Project "Certification ISO 22000 — Lactis Demo", answers the four review criteria and accepts the application, confirms the computed duration, records the agreement and proposes a team of a team leader without category C and a technical expert holding it, both declaring no conflict. An approver outside the team approves it. Stage 1 is planned and reported "ready" with one area of concern. Stage 2 is planned and reported with one minor nonconformity supported by one PDF and one opportunity for improvement. The auditor records the client's plan, the team leader judges it adequate and recommends certification, the approver reviews the dossier and grants certification, the programme manager records the agreed Certificate data and the approver records the Certificate, valid for three years minus one day from the decision.

### 20.2 Negative criteria

The team is refused without the category or with a declared conflict; the decision is refused when the decider is a team member or when a major nonconformity is unverified; "grant" is refused against a "do not grant" recommendation; Stage 2 planning is refused after a "not ready" Stage 1 or with an unverified Stage 1 nonconformity; a nonconformity without evidence is refused; a Certificate whose scope differs from the agreed data is refused; another Company sees nothing.

### 20.3 Private pilot verification

The first tenant's real dossier is replayed through the public API in an isolated, disposable local database by a private test that Git ignores, reading a private dataset outside the repository; a private report compares each recorded fact with its signed source. Neither the test, the dataset nor the report enters Git, issues or CI. The first replay (2026-11-07) ran from application to Certificate without any rule blocking a step that really happened, reproduced the duration and validity exactly, and led to the representative and impartiality rules of §5.1 and §10.

## 21. Business evidence

The private dossier supplies the representative case. Open first-tenant questions, each with its conservative default already applied and recorded for the single consolidated e-mail:

- maximum interval between a "ready" Stage 1 and Stage 2 (the inspected procedure sets none; no limit is enforced, the interval is displayed);
- whether a Stage 1 area of concern blocks Stage 2 (it does not; it stays visible for Stage 2 planning);
- whether the commercial representative may also review the application or audit (no restriction is added; the actor of each step stays visible);
- whether the dossier reviewer and the decision maker may be the same person (allowed; both acts are recorded separately);
- who decides an additional audit (out of scope; a recommendation "additional audit needed" stops the journey before decision);
- which of two report-annex variants applies, and whether separate meeting forms exist (both received as PDFs; no template is generated);
- record retention periods (nothing is deleted).

## 22. Technical research and ADR dependencies

None blocking. The duration rule implements the basic method used by the certification body's calculator for ISO 22000 and records its rule version; it is a proposal, not accreditation authority.

## 23. Readiness and implementation children

Ordered vertical slices; each is a separate issue and pull request:

1. Case opening, application and application review, with the reader and programme manager bundles and the Project tab.
2. Duration determination.
3. Agreement and audit team with the approver bundle and independence check.
4. Stage 1 and Stage 2 planning and reports with the auditor bundle.
5. Findings with exact evidence and nonconformity follow-up.
6. Recommendation, dossier review, Certification Decision and Certificate.
7. Dossier register PDF and the fictional end-to-end acceptance journey.
8. Private pilot replay tool.

Slice 1 passes the twelve readiness gates of the specification standard: outcome, scope, actors and lifecycle are stated above; the fictional journey supplies examples; no blocker is open.
