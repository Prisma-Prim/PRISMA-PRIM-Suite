# PRD — Certification dossier control

**Status:** Approved — under delegated agent product review; the provisional choices are listed in section 21; runtime delivery is tracked by the implementation children of section 23  
**Version:** 1.0  
**Owner:** Dan Popescu  
**Tracker:** [#1279](https://github.com/Prisma-Prim/PRISMA-PRIM-Suite/issues/1279), written under [#1280](https://github.com/Prisma-Prim/PRISMA-PRIM-Suite/issues/1280)  
**Extends:** [Certification Case PRD](release-4-certification-case-prd.md)

## 1. Authority and downstream consumers

This capability PRD adds three controls to the [Certification Case](release-4-certification-case-prd.md) of an initial ISO 22000:2018 certification:

1. the **Dossier Consistency Check**, which compares the values recorded across the Case and lets a person resolve each Discrepancy;
2. the **exchange register**, which records what was received and sent, with the exact Document Version, counterpart, date and channel, the certification body's procedure deadlines and what to re-verify at the next Audit;
3. the **Certificate Release**, from the draft PDF through the client's opinion, approval and issuance to transmission, and the **Certificate Revision** that corrects an issued Certificate.

It owns only these dossier-specific rules. Authority owners remain:

- [Certification Case](release-4-certification-case-prd.md): the Case journey ([§9](release-4-certification-case-prd.md#9-lifecycle-correction-and-history)), its invariants ([§10](release-4-certification-case-prd.md#10-invariants-and-prohibited-outcomes)), its bundles ([§11](release-4-certification-case-prd.md#11-permission-matrix)), its Activity events ([§12](release-4-certification-case-prd.md#12-documents-evidence-and-activity)) and acts on behalf of the certification body ([§5.1](release-4-certification-case-prd.md#51-representative-companies-and-acts-on-behalf-of-the-certification-body));
- [Governed Documents](governed-documents-prd.md) and [Document Registry](release-1-document-registry-prd.md): Documents, immutable Versions and PDF content; transmission is a dimension separate from content ([Governed Documents §6](governed-documents-prd.md#6-lifecycle-dimensions));
- [Activity Log and Accountability](activity-log-accountability-prd.md): the event contract and its invariants;
- [Tenant, Company, Client and Authorization](tenant-company-client-authorization-prd.md): Workspace isolation, Company scope and the denial contract;
- [AI and Knowledge Governance](ai-knowledge-governance-prd.md#3-user-stories): AI contradiction detection, a later proposal layer over this deterministic check;
- [UX, Localization and Configuration](ux-localization-configuration-prd.md): Prisme presentation, ro/ru/fr/en copy and accessibility.

Its downstream consumers are the implementation tickets of section 23, the private pilot demonstration of section 20.3 and the certification-body profiles of [#1281](https://github.com/Prisma-Prim/PRISMA-PRIM-Suite/issues/1281).

### 1.1 Sources

| Source                                                                                                                                                                       | What it settles here                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Cahier des charges MASTER v1.1 (outside Git)                                                                                                                                 | §13 asks for "Validări automate înainte de aprobare", naming "contradicții între documente", and the document statuses Draft to Replaced. §2 ends the business chain with certificates and correspondence. §4 asks for "Control asupra termenelor de audit, certificare" and for correspondence integrated in the client dossier. §16 lists Certificate fields, status and QR. §23 maps "Audit finalizat" to action deadlines and the next-audit calculation. §24 keeps the certification decision human.                                                                                                                                                                                                                                                                                                                                                     |
| [Sarcina v1.0 traceability](sarcina-v1-traceability.csv)                                                                                                                     | `M17-R103` "Contradicțiile nu sunt ascunse" with an exception that has "motiv, autor, dată, versiune și aprobare identificabilă"; `M09-R104` and `M06-R104` "sistemul trebuie să prevină finalizarea când lipsesc datele sau dovezile obligatorii"; `M06-R103` "Versiunea oficială nu se suprascrie"; `M10-R105` and `M09-R105` "corectarea se face prin istoric nou, fără ascunderea valorii anterioare"; `M10-R104` "Certificatele au serie unică"; `M04-R103` "Versiunea semnată este blocată".                                                                                                                                                                                                                                                                                                                                                            |
| [Decision record](consolidated-product-decision-record.md)                                                                                                                   | [DEC-088](consolidated-product-decision-record.md#dec-088--certification-decision-is-separate-and-immutable), [DEC-089](consolidated-product-decision-record.md#dec-089--enforce-configurable-separation-of-duties-with-a-restrictive-default), [DEC-092](consolidated-product-decision-record.md#dec-092--never-reuse-credential-identity-and-preserve-reissues), [DEC-097](consolidated-product-decision-record.md#dec-097--automation-prepares-and-reminds-but-does-not-decide), [DEC-113](consolidated-product-decision-record.md#dec-113--offer-quality-checks-are-deterministic-and-versioned), [DEC-114](consolidated-product-decision-record.md#dec-114--internal-approval-transmission-and-client-response-are-distinct), [DEC-136](consolidated-product-decision-record.md#dec-136--separate-document-content-transmission-and-signature-evidence). |
| Owner direction, [#1279](https://github.com/Prisma-Prim/PRISMA-PRIM-Suite/issues/1279) and [#1280](https://github.com/Prisma-Prim/PRISMA-PRIM-Suite/issues/1280), 2026-11-11 | The three controls, the verdict levels, the closed channel list, the optional client opinion recorded when skipped, the visible revision and the proof requirement.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| [#1152](https://github.com/Prisma-Prim/PRISMA-PRIM-Suite/issues/1152), criterion 5                                                                                           | The decision fixes the texts it grants; a new decision version may correct them.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| Journey audit [#1288](https://github.com/Prisma-Prim/PRISMA-PRIM-Suite/issues/1288)                                                                                          | The two points section 9.3 settles.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| The certification body's procedure and the first tenant's pilot dossier (owner's private folder)                                                                             | Generic conclusions only, as in [Certification Case §1.1](release-4-certification-case-prd.md#11-source-qualification-dec-099-and-dec-139-for-this-journey). No name, number, date, address, form wording or procedure text enters this PRD. A certification body's internal dossier tool, shown to the first tenant, inspired the verdict levels and the lesson that an accepted remark must not come back; nothing is copied from it.                                                                                                                                                                                                                                                                                                                                                                                                                       |

### 1.2 What changes in the Certification Case

- The Certificate data are agreed before the dossier review, and a granting decision requires them (section 9.3).
- A Certification Decision keeps its outcome; later versions correct its texts ([#1152](https://github.com/Prisma-Prim/PRISMA-PRIM-Suite/issues/1152)), restated in section 9.3.
- The Certification Decision is also refused while a critical Discrepancy or an unaccepted error is open (section 9.1).
- The `certificate` step becomes the Certificate Release (section 9.4) and accepts later Certificate Revisions (section 9.5).
- Exchanges, Re-verification Items and Discrepancy resolutions can be recorded on a certified or refused Case, and revisions on a certified one.

## 2. Problem

A certification dossier repeats the same facts in many documents and versions, and nobody compares them all before the decision. The first tenant's pilot dossier, replayed privately, shows the pattern:

- an editable draft and the signed PDF of the same Stage report disagree on the Stage type;
- the on-site days differ between the Stage plan, the team's assignment notice and the dossier checklist;
- the dossier checklist marks documents absent while they are in the dossier;
- the house number of the address differs between the application and the Certificate data;
- the scope wording granted by the decision differs from the wording printed on the Certificate;
- the application's declarations (laboratory, consultant, HACCP studies, outsourced processes) differ from what the reports describe;
- an earlier Version of a notice carries a wrong internal reference and lacks the Stage objectives, and only the later signed Version is right;
- two cover letters carry the same outgoing reference on different dates.

Nothing records which Version of a document was sent to whom, when and through which channel, so a deadline of the certification body's procedure is checked from memory. The Certificate's release is recorded as one undivided act. In the pilot the client returned its signed Certificate-data form after the decision, and a corrected Certificate PDF was produced months after issuance, with the original issue date and no revision mark.

## 3. Outcomes and measurable value

1. Before the decision, an authorized member sees every disagreement between recorded values, its source Document Version and its verdict.
2. Each Discrepancy ends with a recorded human resolution, corrected or accepted with a reason, that does not come back while the values stay the same.
3. For each Case, the register answers what was received, which Version was sent, to whom, when and how, and which procedure deadline was missed.
4. The Certificate reaches the client through five dated and attributed steps, and a later correction is a visible revision.
5. As a target for the private demonstration of section 20.3, not a measurement, a rule raises every known discrepancy of the pilot dossier whose two values are recorded facts, and the others can be recorded as manual Discrepancies.

## 4. Solution and principles

- **Deterministic first.** The check is a fixed rule set over recorded facts. It never reads PDF content and never changes a record ([DEC-097](consolidated-product-decision-record.md#dec-097--automation-prepares-and-reminds-but-does-not-decide)). AI detection is a later proposal layer.
- **Like with like.** When one value comes from a rule, such as the duration, the check compares it with that rule's own result, caps and fixed reductions included, never with a value recomputed outside the rule.
- **A person resolves, once.** A correction or an acceptance with a reason closes a Discrepancy, and the acceptance holds while the compared values stay the same (`M17-R103`).
- **Declared exchanges, exact Versions.** An Exchange Record states a human declaration and points to the exact Document Versions exchanged ([DEC-136](consolidated-product-decision-record.md#dec-136--separate-document-content-transmission-and-signature-evidence)).
- **Deadlines inform.** Procedure deadlines produce states and alerts, never refusals; the six-month limits of the Case PRD stay its own rules.
- **Separate release steps.** Draft, client opinion, approval, issuance and transmission are distinct facts ([DEC-114](consolidated-product-decision-record.md#dec-114--internal-approval-transmission-and-client-response-are-distinct)).
- **Visible corrections.** A corrected Certificate keeps its number and validity and shows its revision ([DEC-092](consolidated-product-decision-record.md#dec-092--never-reuse-credential-identity-and-preserve-reissues), `M10-R105`).

## 5. Actors and ownership

Every record of this PRD belongs to exactly one Certification Case, hence to its Workspace, certifying Company, Client Account, Client Legal Entity and Project. The procedure deadline set belongs to one certifying Company. Nothing appears to another Company.

| Actor                  | New responsibilities                                                                                                                                                            |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Certification reader   | Reads the check, the register, the deadlines, the Re-verification Items, the release steps and the revisions                                                                    |
| Programme manager      | Records exchanges and manual Discrepancies, accepts "to clarify" Discrepancies, records the Certificate draft, the client opinion or its skip, and the transmission             |
| Auditor (on the team)  | Records manual Discrepancies and Re-verification Items                                                                                                                          |
| Certification approver | Accepts "error" and "to clarify" Discrepancies, corrects the decision's texts, approves the draft, records the issued Certificate and its revisions, adds Re-verification Items |
| Company administrator  | Configures the Company's procedure deadlines, as it already assigns the certification bundles                                                                                   |
| Client (external)      | Sends and receives exchanged documents; gives its opinion on the Certificate draft; never a user                                                                                |
| Certification body     | Receives the audit dossier; its staff act through the recorded acts on behalf of the Case PRD §5.1; never a user                                                                |

## 6. Numbered user stories

Dossier Consistency Check:

1. As a programme manager, I see every value pair the check compares, each value with its source record version and exact Document Version, so that I know where a disagreement comes from.
2. As a programme manager, I see each Discrepancy's verdict, critical, error or to clarify, and the act it blocks, in plain language.
3. As a programme manager, when I correct a record so that the values agree, I see the Discrepancy closed as corrected by that version, with its author, time and reason.
4. As a programme manager, I accept a "to clarify" Discrepancy with a written reason, and it does not come back while the compared values stay the same.
5. As a certification approver outside the audit team, I accept an "error" Discrepancy with a written reason, and the decision no longer lists it.
6. As a certification approver, I cannot accept a critical Discrepancy; I see that only a correction resolves it.
7. As a programme manager, auditor or approver, I record a manual Discrepancy I found by reading documents, with the two stated values, their exact Document Versions and locations, and a verdict.
8. As a programme manager or approver, I resolve a manual Discrepancy as corrected, naming the correcting record or Version, or as accepted with a reason.
9. As a certification approver, I see the Certification Decision refused while a critical or unaccepted error Discrepancy is open, each listed among the unmet preconditions.
10. As a programme manager, when a value changes after an acceptance, I see a new Discrepancy for the new values, and the earlier acceptance stays in the history.
11. As a programme manager, I see no Discrepancy for a value the duration rule produced within its caps or by a fixed reduction.
12. As a reader, I see open and resolved Discrepancies, with their history, on the Case page and in the dossier register PDF.
13. As the member who accepts a Discrepancy, I can mark it to re-verify at the next Audit, which adds a linked Re-verification Item.

Exchange register and deadlines:

14. As a programme manager, I record an item received: its kind, the exact Document Versions attached to the Case, the counterpart, the date, the channel, an optional reference and a note.
15. As a programme manager, I record an item sent with the same facts.
16. As a programme manager, I correct an Exchange Record with a reason and still see the earlier version.
17. As a programme manager, I must write a note when the channel is "other".
18. As a Company administrator, I set the value of each procedure deadline for my Company and see the history of its values.
19. As a reader, I see each deadline's due date and state (due, met, met late, overdue, sent too early) and the Exchange Record that met it.
20. As a reader, I see from a step which Version of its document was sent to whom, when and how.
21. As a programme manager, I see when the client received another Version than the one the Case relies on.
22. As a reader, I see the nonconformity response due dates and the latest start of the first surveillance, derived by the Case PRD, beside the procedure deadlines.
23. As a programme manager, auditor or approver, I add an item to re-verify at the next Audit, with its source.
24. As a reader, I see the Re-verification Items, including each minor nonconformity whose implementation remains to be verified.
25. As a programme manager, I withdraw a manual Re-verification Item recorded by mistake, with a reason; automatic items cannot be withdrawn.
26. As a programme manager, I keep recording exchanges after the decision and after issuance.

Certificate data and decision corrections:

27. As a programme manager, I record the Certificate data agreed with the client after the recommendation and before the dossier review, where the step rail now shows them.
28. As a certification approver, my granting decision is refused without recorded Certificate data, and its texts start from the latest agreed data.
29. As a certification approver outside the team, I record a new decision version that corrects the granted texts, with a reason, and the outcome cannot change.
30. As a reader, I see every decision version with its reason and which version the Certificate relies on.

Certificate Release:

31. As a programme manager, after a granting decision, I record the Certificate draft, its exact PDF Version and the Certificate number it shows.
32. As a programme manager, I send the draft to the client for its opinion and record the sending in the register.
33. As a programme manager, I record the client's opinion with the Exchange Record of its answer, agreed or changes requested with the requested change.
34. As a programme manager, I record that the client opinion is skipped, with the reason, the date and my name.
35. As a programme manager, after the client requests changes, I see what must be recorded again before approval.
36. As a certification approver outside the team, I approve the exact current draft with explicit confirmations, optionally on behalf of the certification body.
37. As a certification approver, I record the issued Certificate with its issue date and the approved draft's number.
38. As a programme manager, I record the Certificate's transmission to the client in the register, and the release shows it transmitted.
39. As a reader, I see the five release steps, each with its date and actor, or why the next one is blocked.
40. As a reader, I see how many days have passed since issuance while the Certificate is not transmitted.

Certificate Revision:

41. As a certification approver outside the team, I record a correction of an issued Certificate with its reason, its revision date, the corrected exact PDF Version and my answer whether it shows the revision index and date; the number and validity stay.
42. As a certification approver, when the correction changes a holder, address or scope text, I see that new Certificate data and a new decision version with the same texts come first.
43. As a reader, I see every revision of the Certificate, the current one marked and the earlier ones still readable.
44. As a programme manager, I record the transmission of each revision.

Common:

45. As a reader, I see all of the above and no command.
46. As a member of another Company, I receive for this Case's check, register and release the same denial as for a missing Case.
47. As any member, I use these regions in ro, ru, fr and en, by keyboard, at 1440 px and 390 px.

## 7. Scope and exclusions

The scope is one initial ISO 22000:2018 Certification Case as the Case PRD defines it, with the rule set of section 8.1 and manual Discrepancies, Exchange Records and the procedure deadlines of section 8.2, Re-verification Items, the Certificate Release and Certificate Revisions, and their sections in the dossier register PDF.

Excluded, each with its own owner or later contract:

- profiles of additional certification bodies, with their forms, deadlines and channels ([#1281](https://github.com/Prisma-Prim/PRISMA-PRIM-Suite/issues/1281));
- AI extraction of the questionnaire and AI contradiction detection ([AI and Knowledge Governance](ai-knowledge-governance-prd.md#3-user-stories));
- multi-site and multi-standard audits;
- reading or comparing PDF content, OCR, and comparing an editable draft with its signed PDF;
- generating the Certificate PDF or any certification body form ([Case PRD §7](release-4-certification-case-prd.md#7-scope-and-exclusions));
- sending e-mails or files from the Suite and any e-mail, platform or courier integration;
- QR codes and public verification; suspension, withdrawal, scope reduction or extension, and reissue after a change at the client;
- surveillance Audits, which close the Re-verification Items;
- a register of persons with identities across Companies.

## 8. Domain concepts and minimal fields

| Concept                    | Meaning and minimal content                                                                                                                                                                                             |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Dossier Consistency Check  | The rule set of section 8.1, with its rule-set version, evaluated over one Case                                                                                                                                         |
| Discrepancy                | Rule code, subject (the compared fields), the two values with their source record versions and Document Versions, verdict, state open or resolved, history                                                              |
| Discrepancy resolution     | Corrected (the record version that made the values agree, its author, time and reason) or accepted (reason, author, time, rule-set version, optional re-verification flag)                                              |
| Manual Discrepancy         | Recorder, two stated values each with an exact Document Version and a location such as a page, verdict, note                                                                                                            |
| Exchange Record            | Versioned: direction received or sent, item kind, one or more exact Document Versions attached to the Case, counterpart kind and name, business date, channel, optional reference, note, reason from the second version |
| Procedure deadline set     | Versioned Company configuration: a value in calendar days, or not configured, for each deadline kind of section 8.2                                                                                                     |
| Deadline state             | Derived on read for each deadline of a Case: due date, state, the Exchange Record that met it                                                                                                                           |
| Re-verification Item       | Automatic (a minor nonconformity with an adequate plan) or manual (text, source, author); state open or withdrawn                                                                                                       |
| Certificate Data Agreement | Unchanged from the Case PRD; now recorded before the dossier review                                                                                                                                                     |
| Certificate draft          | Versioned: exact PDF Version, the Certificate number it shows, the decision version and Certificate data version it states, business date                                                                               |
| Client opinion             | For one draft version: agreed or changes requested (requested change, the received Exchange Record), or skipped (reason, note, business date)                                                                           |
| Draft approval             | For one draft version: approver, business date, explicit confirmations, optional act on behalf of the certification body                                                                                                |
| Certificate                | Unchanged from the Case PRD, plus the issue date and the approved draft it issues                                                                                                                                       |
| Certificate Revision       | Revision index from 1, revision date, reason, corrected exact PDF Version, texts, answer on the visible revision, optional act on behalf of the certification body                                                      |

The examples below use the fictional Lactis Demo SRL Case of [Case PRD §20.1](release-4-certification-case-prd.md#201-fictional-journey). It has 40 employees, food chain subcategory CI, 2 HACCP studies and one site. Its confirmed duration is 3 on-site auditor-days, 1 for Stage 1 and 2 for Stage 2. Ion Popa leads the team with Expert Demo as technical expert, and the holder is "Lactis Demo SRL" at "Str. Exemplu 1, Demo City". S1 is the first day of Stage 1, S2 the last day of Stage 2 and D the decision date. Every value is fictional.

### 8.1 Consistency rules

| Rule | Compares                                                                                                                                                                                                                                                                                                                            | Verdict                                                                                      | Raised in the fictional Case when                                                                                               | Not raised when                                                                                                                                                                                         |
| ---- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R01  | The duration proposal recomputed from the current application facts with the confirmed duration's rule version and factors, against the confirmed duration's proposal                                                                                                                                                               | error                                                                                        | The headcount is corrected from 40 to 60 after the duration; the proposal moves to the next headcount band                      | A correction to 45 stays in the same band and yields the same proposal                                                                                                                                  |
| R02  | A prior-certification reduction in the duration, against the existing certifications the application declares                                                                                                                                                                                                                       | error                                                                                        | The duration applies the reduction while the application declares no existing certification                                     | A certification is declared and no reduction is applied, since reductions are optional; reductions at the rule's caps are never compared with a nominal value                                           |
| R03  | A Stage plan's on-site auditor-days, against that Stage's share in the latest confirmed duration                                                                                                                                                                                                                                    | error                                                                                        | The duration is confirmed again after the headcount correction; the Stage 2 plan's 2 days now differ from the new Stage 2 share | The plan justified its deviation against the same duration version, so it appears as accepted with that justification and never as open; a Stage 1 plan of 1 day follows the rule's fixed Stage 1 share |
| R04  | A Stage plan's on-site auditor-days, against its calendar days multiplied by the team leader and auditors on site; technical experts and observers do not count                                                                                                                                                                     | to clarify                                                                                   | The Stage 2 plan states 2 auditor-days over one calendar day with Ion Popa as the only auditor                                  | Two calendar days with one auditor                                                                                                                                                                      |
| R05  | Business dates in order. The agreement signature and a team approval on behalf fall on or before S1. Each Stage report falls on or after its Stage's last day. The Stage 2 report, the recommendation, the dossier review on behalf and the decision follow each other. A client opinion is received on or after its draft was sent | error; to clarify for a Stage report dated before its Stage's last day                       | The decision is dated one day before the dossier review's approval                                                              | Equal dates, or a date that is not recorded                                                                                                                                                             |
| R06  | A Stage plan's sending date, against the Stage's first day                                                                                                                                                                                                                                                                          | to clarify                                                                                   | The Stage 1 plan is sent on S1 + 1                                                                                              | Sent on S1 or before                                                                                                                                                                                    |
| R07  | A Stage plan's sending date and plan Version, against the sent Exchange Records of that plan to the client                                                                                                                                                                                                                          | error when no record has that date; to clarify when the client received only another Version | The plan says sent on S1 − 14; the register's only sending of it is dated S1 − 12                                               | No sending is recorded yet, since the deadline state shows it                                                                                                                                           |
| R08  | Each dossier review item answered present, against the record or attachment it stands for at the review's revision                                                                                                                                                                                                                  | critical                                                                                     | "Certificate data" is answered present while no Certificate Data Agreement is recorded                                          | The record exists                                                                                                                                                                                       |
| R09  | Each item answered missing or not applicable, against the same record                                                                                                                                                                                                                                                               | to clarify                                                                                   | "Stage 1 plan" is answered missing while the plan and its PDF are recorded                                                      | The record does not exist                                                                                                                                                                               |
| R10  | The version of each record a dossier item stands for, against the version the latest dossier review saw, until the decision                                                                                                                                                                                                         | error                                                                                        | The Stage 2 report is corrected after the dossier review                                                                        | A new dossier review version covers the change                                                                                                                                                          |
| R11  | The latest decision's granted holder, address and scope per language, against the latest Certificate Data Agreement, compared as the Certificate rule compares them                                                                                                                                                                 | critical                                                                                     | The decision grants "Str. Exemplu 1, Demo City" and the agreed data read "Str. Exemplu 1A, Demo City"                           | Identical texts in the same languages                                                                                                                                                                   |
| R12  | House numbers and postal codes, read as digit groups with an optional one-letter suffix after case and Latin–Cyrillic look-alike folding, in each agreed address and in the application's declared address                                                                                                                          | to clarify                                                                                   | The application declares "Str. Exemplu 1A, Demo City" and the agreed Romanian address reads "Str. Exemplu 1, Demo City"         | An English text "1A Example Street, Demo City" keeps the same numbers                                                                                                                                   |
| R13  | The number a Certificate draft shows, against the issued Certificates of the Company                                                                                                                                                                                                                                                | critical                                                                                     | The draft shows DEMO-0001, already issued in another Case                                                                       | The number is not issued                                                                                                                                                                                |
| R14  | The Document Version a record relies on, against a later Version of the same Document attached to the Case and used by no record                                                                                                                                                                                                    | to clarify                                                                                   | The Stage 1 plan relies on plan Version 1, and Version 2 with corrected objectives is attached unused                           | A new plan version relies on Version 2                                                                                                                                                                  |
| R15  | The reference of each sent Exchange Record, against the other sent records                                                                                                                                                                                                                                                          | to clarify                                                                                   | Both Stage plan cover letters carry the reference OUT-7 on different dates                                                      | One record sends several Versions together                                                                                                                                                              |
| R16  | A sent Exchange Record, against a "not before" procedure deadline of section 8.2; while the anchor is not recorded, every such sending is early                                                                                                                                                                                     | error                                                                                        | The Stage 2 report is sent to the client before the decision is recorded                                                        | The deadline is not configured, or the sending is on or after D                                                                                                                                         |

A manual Discrepancy carries the verdict its recorder chooses. In the fictional Case, the editable Stage 2 report draft states Stage 1 while its signed PDF states Stage 2. The auditor records it "to clarify", and the approver accepts it with the reason "The signed PDF prevails; the editable draft is not part of the dossier".

### 8.2 Procedure deadlines

Each certifying Company configures the deadlines of the certification body's procedure it works under. No value is seeded, and a kind without a value produces no state. The first tenant's real values are configured in its own Workspace, never in Git.

| Deadline kind                                       | Anchor and direction                  | Met by                                                                                                              | Fictional value         |
| --------------------------------------------------- | ------------------------------------- | ------------------------------------------------------------------------------------------------------------------- | ----------------------- |
| Stage plan sent to the client                       | Before the Stage's first day          | A sent Exchange Record of a Version of that Stage's plan to the client                                              | At least 10 days before |
| Audit dossier transmitted to the certification body | After S2                              | A sent Exchange Record of kind audit dossier to the certification body                                              | Within 20 days          |
| Stage 2 report released to the client               | Not before the Certification Decision | Breached by a sent Exchange Record of a Stage 2 report Version dated before D, or recorded while no decision exists | Not before D            |

The register also shows, without owning them, the nonconformity response due dates and the latest start of the first surveillance that the [Case PRD §9](release-4-certification-case-prd.md#9-lifecycle-correction-and-history) derives.

### 8.3 Item kinds, counterparts and channels

- Item kinds: application, agreement, team notice, Stage plan, Stage report, participant list, nonconformity response, client data confirmation, audit dossier, Certificate data form, Certificate draft, client opinion, decision form, Certificate, other.
- Counterpart kinds: client, certification body, audit team member, other. A free name of at most 200 characters identifies the person or office, for example "Lactis Demo SRL, quality manager".
- Channels, a closed list: e-mail, platform, courier, hand delivery, other. "Other" requires a note.
- New Case attachment roles: Certificate draft, client opinion, correspondence (cover letters, transmittal lists, saved messages).

## 9. Lifecycle, correction and history

### 9.1 Discrepancy lifecycle

The check is evaluated over the Case's current records each time the Case is read, and the Certification Decision and the draft approval evaluate it again inside their transactions. A Discrepancy is open from the first Case revision that produces it.

- **Corrected.** A command that records a new version and makes the values agree closes the Discrepancy as corrected by that version; the command's own reason and Activity event document it. A manual Discrepancy is closed as corrected by a resolution command that names the correcting record version or Document Version.
- **Accepted.** A resolution command records the reason. A "to clarify" Discrepancy is accepted by a programme manager or an approver; an "error" only by an approver outside the audit team; a critical Discrepancy only by correction.
- **Persistence.** An acceptance covers one rule, one subject and the exact compared values. It holds across new versions that keep those values and across later rule-set versions that raise the same rule on the same values. When a value changes, the new values form a new Discrepancy; when values return to an accepted pair, the acceptance applies again.
- **Gates.** An open critical Discrepancy or an unaccepted error blocks the next gate not yet passed, first the Certification Decision and then the draft approval. After issuance it blocks nothing; it stays listed and, when it concerns the Certificate, calls for a Certificate Revision.
- A "to clarify" Discrepancy never blocks and stays listed until resolved. Resolutions can still be recorded after issuance.

### 9.2 Exchange Records and deadline states

An Exchange Record is a versioned human declaration. A correction creates a new version with a reason; nothing is deleted. Its business date is not later than the latest calendar date already reached anywhere (UTC+14), as for acts on behalf in the Case PRD. Exchanges can be recorded on an open, refused or certified Case.

For each configured deadline, the due date is its anchor plus or minus its value. The state is derived on read:

- **due**: no meeting record, and the due date has not passed;
- **met**: a meeting record dated on or before the due date;
- **met late**: the earliest meeting record is dated after the due date;
- **overdue**: no meeting record, and the due date has passed (from the next calendar day, UTC);
- **sent too early**: a "not before" deadline breached, which also raises R16.

A state never refuses a command. A change of the deadline set applies to the next read of every Case and shows the set's version.

### 9.3 Certificate data timing and decision corrections

**(a) When the Certificate data are agreed.** The Certificate Data Agreement is recorded after the Stage 2 report and before the dossier review; the step rail shows it right after the recommendation. The certification body's procedure counts the client-confirmed Certificate data and the draft Certificate model among the dossier contents its reviewer checks before deciding, and its decision states the holder, address and scope per language. In the pilot, the client confirmed its data at the end of the audit, before the decision, and returned a signed Certificate-data form after the decision. These are two acts, the Certificate Data Agreement before the dossier review and the client opinion on the draft after the decision (section 9.4). The command already accepts the data after the Stage 2 report, so only the step rail order and one precondition change. A granting Certification Decision is refused without a recorded Certificate Data Agreement, and the decision form starts from its latest texts. The [Case PRD §9](release-4-certification-case-prd.md#9-lifecycle-correction-and-history) placed the data after the decision, and the journey audit [#1288](https://github.com/Prisma-Prim/PRISMA-PRIM-Suite/issues/1288) found the rail showing them as the next step from the start; this order replaces both.

**(b) Decision corrections, restating [#1152](https://github.com/Prisma-Prim/PRISMA-PRIM-Suite/issues/1152) criterion 5.** The first decision version fixes the outcome, granted or refused, and the outcome never changes. A later version, recorded with a reason by an approver outside the audit team, may correct the granted texts per language and the references (decision form, decider, function, decision date). Independence and the preconditions are checked again. Before issuance such a version may be recorded at any time. After issuance the outcome and the decision date are fixed and only the texts may change, through section 9.5.

### 9.4 Certificate Release

After a granting decision, the release runs in this order. Each step has a business date and a recording actor. As in [Case PRD §5.1](release-4-certification-case-prd.md#51-representative-companies-and-acts-on-behalf-of-the-certification-body), the approval, the issuance and a revision may be recorded on behalf of the certification body, with the independence attestation.

1. **Draft.** The programme manager records the exact PDF Version of the draft, attached to the Case with the role Certificate draft, and the Certificate number it shows. The draft states the latest decision version and Certificate data version; a later version of either makes the draft outdated, and a new draft version follows.
2. **Client opinion, optional.** The programme manager sends the draft outside the Suite and records the sending. The client's answer is a received Exchange Record; the opinion references it and states agreed or changes requested, with the requested change. Instead, the programme manager may record the opinion as skipped, with a reason from a closed list (texts already agreed in the Certificate Data Agreement, no answer from the client, other with a note). After "changes requested", a new draft version follows; when the texts change, a new Certificate data version and a new decision version come first (section 9.3).
3. **Approval.** An approver outside the team approves the current draft version. The approver confirms explicitly, with no default, that the draft states exactly the granted texts per language, the number and the validity computed from the decision date.
4. **Issuance.** The approver records the issued Certificate as in the Case PRD, with its issue date, not earlier than the decision date nor later than today. Its number is the approved draft's number. Its exact PDF Version may be the signed form of the approved draft.
5. **Transmission.** The programme manager records a sent Exchange Record of kind Certificate, with the issued Version, to the client. Until then the release shows the days since issuance.

### 9.5 Certificate Revision

An approver outside the team corrects an issued Certificate by recording a revision with its reason, revision date, the corrected exact PDF Version (attached with the role Certificate and different from every earlier one) and an explicit answer, with no default, whether the PDF shows the revision index and the revision date. A "no" does not block the revision: it is recorded, and the Case page and the dossier register show "revision not marked on the Certificate" beside it, because the certification body, not the Suite, produces the PDF. The server assigns the index; the issuance is revision 0.

- The number, the Client Legal Entity, the decision date and the validity never change.
- By default the texts stay. When a holder, address or scope text must change because it was wrong, a new Certificate data version and a new decision version with the same texts come first, and the Certificate shows "revision required" until the revision applies them. A change caused by a change at the client is not a revision; it belongs to the deferred scope-change and reissue contract.
- Earlier revisions stay readable and are marked superseded. Each revision's transmission is a separate Exchange Record.

In the fictional Case, revision 1 of DEMO-0001 corrects the English page, which misspelt the city of the recorded address; its PDF shows "Revision 1" and the revision date.

### 9.6 Re-verification Items

Re-verification Items collect what to verify at the next Audit of the same Client Legal Entity. Each minor nonconformity whose plan was judged adequate adds an automatic item, because its implementation is verified later. A programme manager, auditor or approver adds manual items, with an optional source (Finding, Discrepancy, Exchange Record or Document Version); accepting a Discrepancy with the re-verification flag adds one. A programme manager withdraws a manual item with a reason. Items are closed by the surveillance contract, which is deferred; until then they stay open and appear with the latest start of the first surveillance.

## 10. Invariants and prohibited outcomes

- Every record of this PRD stays inside its Case's Workspace and Company; hidden and missing Cases receive the same denial.
- The check never creates, changes or hides a record; a rule result is never stored as a human resolution.
- No rule compares a value produced by a rule with a value recomputed outside that rule, its caps or its fixed reductions.
- A critical Discrepancy is resolved only by correction; an error is accepted only by an approver outside the audit team; every acceptance has a reason.
- The Certification Decision is refused while a critical Discrepancy or an unaccepted error is open; a granting decision is refused without a recorded Certificate Data Agreement.
- A decision version never changes the outcome; after issuance it never changes the decision date.
- The draft approval is refused unless the draft is current, its client opinion is agreed or skipped, the granted texts equal the agreed Certificate data and no critical Discrepancy or unaccepted error is open.
- The issued Certificate requires an approved draft with the same number.
- A Certificate Revision never changes the number, the holder entity, the decision date or the validity; its texts equal the latest decision version and Certificate data.
- An Exchange Record references at least one exact Document Version attached to its Case; channel "other" has a note; no business date is later than today (UTC+14).
- A procedure deadline never refuses a command.
- An automatic Re-verification Item cannot be withdrawn; a manual one is withdrawn only with a reason.
- Nothing is deleted; every correction is a new version with a reason.

## 11. Permission matrix

| Action                                                                         | Reader | Programme manager | Auditor (on team) | Approver (not on team) |
| ------------------------------------------------------------------------------ | :----: | :---------------: | :---------------: | :--------------------: |
| Read the check, register, deadlines, Re-verification Items, release, revisions |   ✓    |         ✓         |         ✓         |           ✓            |
| Record a manual Discrepancy                                                    |        |         ✓         |         ✓         |           ✓            |
| Accept a "to clarify" Discrepancy; resolve a manual one as corrected           |        |         ✓         |                   |           ✓            |
| Accept an "error" Discrepancy                                                  |        |                   |                   |           ✓            |
| Record or correct an Exchange Record                                           |        |         ✓         |                   |                        |
| Add a Re-verification Item                                                     |        |         ✓         |         ✓         |           ✓            |
| Withdraw a manual Re-verification Item                                         |        |         ✓         |                   |                        |
| Record the Certificate draft and the client opinion or its skip                |        |         ✓         |                   |                        |
| Correct the decision's texts, approve the draft, issue, revise                 |        |                   |                   |           ✓            |

The four bundles are those of the [Case PRD §11](release-4-certification-case-prd.md#11-permission-matrix), with their Case-level separation checks; Company or Workspace administration does not bypass them. The procedure deadline set is configured by a member holding the Company administration right that assigns the certification bundles.

## 12. Documents, evidence and Activity

Every exchanged, draft, opinion and revised PDF is a Document Version attached to the Case through the existing Case attachment, with its Document read authority. A record stores the exact Version it relies on; a later Version never replaces it.

Each successful command records one Activity Log event in its transaction, with server-established actor, Company, Case and record version, and metadata limited to closed codes (rule code, verdict, resolution kind, direction, item kind, channel, counterpart kind, opinion outcome, revision index):

- `certification_case.discrepancy_recorded` (manual) and `certification_case.discrepancy_resolved`;
- `certification_case.exchange_recorded`, also for a correction, with its record version;
- `certification_case.reverification_item_added` and `certification_case.reverification_item_withdrawn`;
- `certification_case.certificate_draft_recorded`, `certification_case.client_opinion_recorded`, `certification_case.certificate_draft_approved` and `certification_case.certificate_revised`;
- the existing `certification_case.certificate_data_agreed`, `certification_case.decision_recorded` and `certification_case.certificate_recorded`, for new versions and issuance;
- `certification_procedure.deadlines_configured`, at Company scope, with the set's version.

Reasons, notes, counterpart names, stated values and references never enter event metadata. Refused, replayed and no-op commands record nothing. The Case timeline is the read side of these events, as for the other certification events.

The non-official dossier register PDF gains the open and resolved Discrepancies, the Exchange Records with the deadline states at generation time, the Re-verification Items, the release steps and the revisions.

## 13. Configuration, localization and accessibility

- The rule set is code with a version shown beside the results. Item kinds, counterpart kinds, channels and skip reasons are closed lists in code.
- The procedure deadline set is a versioned Company configuration in whole calendar days from 0 to 365 per kind, or not configured. Its history shows each value, actor and time.
- Every label, verdict, rule title, state and channel is localized in ro, ru, fr and en.
- A verdict or a deadline state is conveyed by text and icon, never by colour alone. Forms work by keyboard and at 1440 px and 390 px in the Prisme frame.

## 14. Source of truth and providers

The Suite is the source of truth for the declarations it records. Signed PDFs remain the truth of what was signed ([Case PRD §14](release-4-certification-case-prd.md#14-source-of-truth-and-providers)). No e-mail, platform, courier or e-signature provider is used; a later e-mail integration may propose Exchange Records, never record them alone. The check reads recorded facts only.

## 15. Migration and compatibility

Additive schema with a reviewed Drizzle migration per ticket. Old payloads decode. Cases recorded earlier are checked on read, and the gates apply only to commands after deployment. A Certificate recorded before the release circuit shows its issuance as recorded before the circuit, with its recording time and no issue date; its transmission and revisions can be recorded. Certificate data recorded after a decision in an earlier Case stay valid. No existing Activity event changes.

## 16. Security, reliability and performance

Server-side authorization on every read and command, rechecked inside the transaction; expected Case revisions and idempotency keys as in the Case PRD. Reasons, notes, counterpart names and stated values are confidential Case content, excluded from logs, errors and event metadata. R13 reveals only that the number is already issued in the Company. The check reads one Case's records and, for R13, the Company's issued numbers; the register and the Discrepancy history are paged.

## 17. UI states

The Case page gains three regions:

- **Dossier consistency**: counts per verdict, then the open Discrepancies with both values, their sources and the act each blocks, the acceptance and manual-Discrepancy forms, and the resolved list with its history. The decision's unmet-preconditions list names the blocking Discrepancies.
- **Exchanges and deadlines**: the register with filters by direction and kind, the deadline states and the Re-verification Items. A step shows the sendings of its document.
- **Certificate release**: five steps with date and actor, the blocking reasons in plain language, the days since issuance while not transmitted, and the revisions with the current one marked.

The empty ("No Discrepancy found by rule set …", "No exchange recorded", "No procedure deadline configured"), loading, denied, stale (reload), uncertain (retry with the same key) and unavailable states are explicit, and a reader sees every region read-only.

## 18. Durable and reversible implementation choices

Durable choices are the verdict levels and gates, an acceptance bound to rule, subject and values, the closed channel list, deadlines as states and never refusals, the release order, a revision that keeps the number and validity, and the decision outcome fixed by its first version.

Implementers choose, reversibly, how open and corrected Discrepancies are computed and stored, provided their history is exact and a rule-set change never rewrites an acceptance. They also choose the rule titles, the digit-group reading of R12, the time zone of the overdue state and the layout of the regions and of the register PDF sections.

## 19. Testing decisions

- Pure-function tests for the rule set over fictional Case snapshots: each rule raised and each "not raised" vector of section 8.1, including the headcount band, the Stage share and the justified deviation. The duration rule tests are the prior art.
- Pure-function tests for the deadline states with a fixed clock: due, met, met late, overdue and sent too early.
- REST tests against PostgreSQL for every new command: success, Company isolation, hidden equals missing, missing bundle, separation of duties, stale revision, idempotent replay, refusals of section 10, the Activity event inside the transaction and nothing recorded on refusal. The decision REST tests are the prior art.
- App tests for the three regions, their states, verdict labels and the reader's view.
- The `certification-journey` acceptance journey extended per ticket at 1440 px and 390 px.
- A migration test for each additive migration and a decoding test for earlier payloads.

## 20. Acceptance journey and criteria

### 20.1 Fictional journey extension

The [Case PRD §20.1](release-4-certification-case-prd.md#201-fictional-journey) journey continues for Lactis Demo SRL. The Company administrator sets the fictional deadlines of section 8.2. The programme manager records the questionnaire received by e-mail, the Stage 1 plan sent by e-mail on S1 − 12 (met) and the Stage 2 plan sent 7 days before its first day (met late). After the duration, the headcount is corrected to 60, and R01 blocks the decision until the programme manager confirms a new duration, which closes it as corrected. The Stage 2 plan states 2 auditor-days over one calendar day, and the programme manager accepts R04 with a reason; it stays resolved after a reload. The auditor records a manual Discrepancy between the editable draft and the signed Stage 2 report, which the approver accepts. The programme manager records the Stage 2 report sent to the client before any decision; R16 blocks the decision until the approver accepts it with a reason. The programme manager records the Certificate data after the recommendation; the approver reviews the dossier and grants certification. The minor nonconformity appears among the Re-verification Items, with a manual item added by the auditor. The audit dossier, not recorded as sent, turns overdue after S2 + 20.

The programme manager records draft Version 1 showing DEMO-0001 and sends it; the client answers by e-mail asking to add the English text. The programme manager records Certificate data version 2 with the English text, the approver records decision version 2 with the same texts and an unchanged outcome, and the programme manager records draft Version 2 with the opinion skipped because the texts are already agreed. The approver approves the draft and records the issued Certificate; the programme manager records its transmission by courier. Later the approver records revision 1, which corrects a misspelt city on the English page; its transmission by e-mail is recorded. The reader and a member of another Company see the same pages as in the Case PRD journey, with no command for the reader and the same denial for the other Company.

### 20.2 Negative criteria

A critical Discrepancy cannot be accepted; an error accepted by the programme manager or by an approver on the team is refused; the decision is refused while R01 is open; a granting decision is refused without Certificate data; a decision version that changes the outcome is refused; the approval is refused for an outdated draft, without a client opinion or skip, after "changes requested" with no new draft, and while R11 is open; issuance with another number than the approved draft is refused; a revision that changes the number or validity, has no reason or lacks the revision confirmation is refused; an Exchange Record with channel "other" and no note, with a Version not attached to the Case, or dated after today is refused; another Company receives the missing-Case denial.

### 20.3 Private pilot demonstration

Each ticket ends with a private local journey audit, using the journey-audit skill of [#1277](https://github.com/Prisma-Prim/PRISMA-PRIM-Suite/issues/1277), on the first tenant's pilot dossier replayed in an isolated, disposable local database, as in [Case PRD §20.3](release-4-certification-case-prd.md#203-private-pilot-verification). Its private report lists each known discrepancy of the pilot dossier and the rule and verdict that raised it, or the manual Discrepancy that records it. It replays the Certificate-data form returned after the decision as the client opinion and the later corrected Certificate as a revision. The test, the dataset and the report stay in the owner's private folder, outside Git, issues and CI.

## 21. Business evidence and provisional choices

Each open business detail was resolved under [standard §9.1](specification-and-ticketing-standard.md#91-open-business-details). Every choice below is provisional and reversible.

| Detail                          | Choice                                                                                                                            | Source                                                                                                                                                                                                                    |
| ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Verdicts and what they block    | Critical by correction only, error accepted by an approver, to clarify never blocks; gates are the decision, then the approval    | MASTER §13 "Validări automate înainte de aprobare"; `M17-R103` exception with "aprobare identificabilă"; `M09-R104`; DEC-113                                                                                              |
| Who accepts                     | Approver outside the team for errors; programme manager or approver for "to clarify"                                              | `M17-R103`; DEC-089                                                                                                                                                                                                       |
| Persistence of a resolution     | Bound to rule, subject and values                                                                                                 | Owner direction in #1279; `M06-R105`                                                                                                                                                                                      |
| Deadline kinds and their nature | Three configurable kinds of section 8.2, states only                                                                              | MASTER §4 "Control asupra termenelor de audit, certificare"; the certification body's procedure presents the sending and dossier delays as indicative or general rules and releases the Stage 2 report after the decision |
| Overdue time zone               | From the next calendar day, UTC                                                                                                   | Conservative MVP default                                                                                                                                                                                                  |
| Who records exchanges           | Programme manager                                                                                                                 | Conservative MVP default, least privilege                                                                                                                                                                                 |
| What to re-verify               | Automatic items for minor nonconformities with an adequate plan, plus manual items                                                | MASTER §23 "Audit finalizat" with action deadlines and the next-audit calculation; the procedure accepts a minor nonconformity at decision on an adequate plan                                                            |
| Timing of the Certificate data  | Before the dossier review; client opinion on the draft after the decision                                                         | The procedure's dossier contents and decision, and the pilot's two acts (section 9.3)                                                                                                                                     |
| Decision corrections            | Texts and references; the outcome is fixed; after issuance texts only, through a revision                                         | #1152 criterion 5; DEC-092; `M06-R103`                                                                                                                                                                                    |
| Draft PDF                       | An attached exact Version, not generated                                                                                          | Case PRD §7 defers generation of certification body forms                                                                                                                                                                 |
| Client opinion                  | Optional; a skip is recorded with its reason                                                                                      | Owner direction in #1279 and #1280                                                                                                                                                                                        |
| Issue date                      | Required, between the decision date and today                                                                                     | MASTER §16 lists the issue date among the Certificate fields                                                                                                                                                              |
| Revision                        | Same number and validity, server index, explicit answer on the visible revision (a missing mark is shown, never blocking), reason | Owner direction in #1280; DEC-092; `M10-R105`; `M10-R104`                                                                                                                                                                 |
| Address comparison              | Digit groups only, "to clarify"                                                                                                   | Conservative MVP default; full-text comparison across languages would raise false Discrepancies                                                                                                                           |

One question goes to the first tenant, with the default above already applied. It asks whether the certification body's corrected Certificate can show a revision index and date. If it cannot, the revision is still recorded with the answer "no" and shown as not marked on the Certificate; the answer only tells whether that notice will be the rule or the exception.

## 22. Technical research and ADR dependencies

None blocking. No choice here is costly to reverse, so no ADR is needed. The R12 reading is checked on the pilot during the private demonstration.

## 23. Readiness and implementation children

The tickets below are created after this PRD merges, per [#1280](https://github.com/Prisma-Prim/PRISMA-PRIM-Suite/issues/1280) criterion 3, and listed on [#1279](https://github.com/Prisma-Prim/PRISMA-PRIM-Suite/issues/1279). Child 3 of the tracker splits into tickets 3a and 3b to fit one fresh session each. The outlines share sections to stay short; each created issue states them in full, so that it is context-free. Each ticket meets gates 1 to 11 of [standard §8](specification-and-ticketing-standard.md#8-ready-for-agent-gates) through the sections above; gate 12 holds once its blocker is merged, and only then does it receive `ready-for-agent`.

Every ticket carries the same proof requirement: extend the `certification-journey` acceptance journey; cite functional and visual proof per criterion in the pull request's [Acceptance proof](../agents/acceptance-proof.md) section; run the private local journey audit of section 20.3 for the real-pilot demonstration and keep its report in the owner's private folder.

### Ticket 1 — Check a Certification Case's dossier consistency, with verdicts and human resolution

- **Parent:** #1279; this PRD §§8.1, 9.1, 10–12.
- **What to build:** the rule set R01 to R05, R08 to R12 and R14, manual Discrepancies, their resolution and the decision gate, shown on the Case page and in the register PDF.
- **Acceptance criteria:**
  1. REST and PostgreSQL: the Case read returns open and resolved Discrepancies with verdicts, values and sources for every "raised" vector of §8.1, and none for every "not raised" vector.
  2. The acceptance rules of §9.1 hold. A programme manager or approver accepts "to clarify", only an approver outside the team accepts an error, a critical Discrepancy cannot be accepted, and a reason is required. An acceptance survives reloads and new versions with the same values, and changed values raise a new Discrepancy.
  3. A manual Discrepancy is recorded and resolved as corrected or accepted.
  4. The decision is refused while a critical Discrepancy or an unaccepted error is open, and its unmet preconditions list them. After the decision, the recording of the Certificate is refused in the same way until ticket 3a moves this gate to the draft approval.
  5. The events of §12 are recorded in the transaction; refusals and replays record nothing; another Company receives the missing-Case denial.
  6. The Dossier consistency region shows the states of §17 in ro, ru, fr and en; the reader sees no command.
  7. The register PDF lists open and resolved Discrepancies.
  8. The acceptance journey covers the consistency part of §20.1 at desktop and narrow widths.
- **Blocked by:** the merge of this PRD.
- **Module and public interface:** one pure consistency module inside the certification module, taking one Case snapshot and returning Discrepancies with stable identities; two commands, record a manual Discrepancy and resolve a Discrepancy; a section of the Case read; the decision precondition reads the module.
- **Test seam:** red first on the R01 headcount-band vectors in the pure module, then each rule, then the REST resolution and gate tests, then the app tests and the journey.
- **Demonstration:** the fictional Case with one Discrepancy per verdict and each resolution, then the private pilot audit.
- **Exclusions:** R06, R07, R13, R15, R16 and the release gate of tickets 2 and 3a; AI; PDF content.
- **Required verification:** format, lint, typecheck, focused REST tests on PostgreSQL, web tests, the acceptance journey in CI, the migration test, `node scripts/validate-repository-docs.mjs`.
- **Delivery protocol and retrospective:** [issue execution](../agents/issue-execution.md), with the proof requirement above and the cost record.

### Ticket 2 — Record a Certification Case's exchanges, procedure deadlines and what to re-verify

- **Parent:** #1279; this PRD §§8.2, 8.3, 9.2, 9.6.
- **What to build:** Exchange Records and their corrections, the Company procedure deadline set, the derived deadline states, rules R06, R07, R15 and R16, and the Re-verification Items.
- **Acceptance criteria:**
  1. REST and PostgreSQL: Exchange Records with every field of §8, corrections with a reason, the refusals of §10, recording on certified and refused Cases.
  2. The Company administrator sets and changes the deadline set; its history is readable; a kind without a value produces no state.
  3. The deadline states of §9.2 for the fictional values, with a fixed clock.
  4. R06, R07, R15 and R16 raised and not raised per §8.1.
  5. Automatic and manual Re-verification Items, withdrawal with a reason, and an item added from an accepted Discrepancy.
  6. Events, isolation, the Exchanges and deadlines region, the register PDF and the journey, as in ticket 1.
- **Blocked by:** ticket 1.
- **Module and public interface:** an exchange register inside the certification module with record and correct commands; a pure deadline-state function taking the Case dates, the Exchange Records, the deadline set and today; a Company configuration command; add and withdraw commands for Re-verification Items.
- **Test seam:** red first on the deadline-state function, then the REST commands, then the rules, then the app and the journey.
- **Demonstration:** the fictional register with met, late and overdue deadlines, then the private pilot audit replaying the pilot's sendings.
- **Exclusions:** sending from the Suite; e-mail integration; certification-body profiles (#1281); closing items at surveillance.
- **Required verification and delivery protocol:** as in ticket 1.

### Ticket 3a — Release the Certificate from draft to transmission

- **Parent:** #1279; this PRD §§9.3, 9.4.
- **What to build:** the Certificate data before the dossier review, the granting precondition, decision text corrections in the interface, the draft, the client opinion or its skip, the approval, issuance with its issue date, transmission and rule R13.
- **Acceptance criteria:**
  1. The step rail shows the Certificate data after the recommendation; a granting decision is refused without them and starts from their texts.
  2. A decision version corrects texts with a reason and keeps the outcome.
  3. Draft, opinion agreed, changes requested, skipped, approval and issuance follow §9.4, with the refusals of §§10 and 20.2.
  4. The transmission is a sent Exchange Record; the release shows the days since issuance until it exists.
  5. R13 raised and not raised; the approval gate of §9.1.
  6. Events, isolation, the Certificate release region, the register PDF and the journey, as in ticket 1.
- **Blocked by:** ticket 2.
- **Module and public interface:** draft, opinion and approval commands in the certification module; the existing Certificate command gains the issue date and the approved-draft check.
- **Test seam:** red first on the granting precondition, then each release command, then the app and the journey.
- **Demonstration:** the fictional release of §20.1, then the private pilot audit replaying the form returned after the decision as the client opinion.
- **Exclusions:** revisions (ticket 3b); generating the Certificate PDF; QR.
- **Required verification and delivery protocol:** as in ticket 1.

### Ticket 3b — Correct an issued Certificate with a visible revision

- **Parent:** #1279; this PRD §9.5.
- **What to build:** Certificate Revisions, the text-correction path after issuance and the transmission of each revision.
- **Acceptance criteria:**
  1. A revision with reason, date, corrected PDF Version and the explicit visible-revision answer; the number and validity unchanged; the index assigned by the server. A "no" answer records the revision and shows "revision not marked on the Certificate" on the Case page and in the register.
  2. After issuance, a decision version changes texts only, requires matching Certificate data, and leaves "revision required" until the revision.
  3. Earlier revisions readable and marked superseded; each revision's transmission recorded.
  4. Events, isolation, the region, the register PDF and the journey, as in ticket 1.
- **Blocked by:** ticket 3a.
- **Module and public interface:** a revision command in the certification module and the decision command's post-issuance branch.
- **Test seam:** red first on the unchanged number and validity, then the text path, then the app and the journey.
- **Demonstration:** revision 1 of the fictional Certificate, then the private pilot audit replaying the corrected Certificate as revision 1.
- **Exclusions:** reissue after a change at the client; suspension and withdrawal; QR.
- **Required verification and delivery protocol:** as in ticket 1.
