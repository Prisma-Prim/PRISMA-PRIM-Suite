# Candidate commercial models October 2026

- **Status:** Non-canonical preparation — operational Template and clause approval pending
- **Owner:** Dan Popescu; business/Template approval follows the owning PRDs
- **Delivery:** [#495](https://github.com/Prisma-Prim/PRISMA-PRIM-Suite/issues/495) under [#290](https://github.com/Prisma-Prim/PRISMA-PRIM-Suite/issues/290)
- **Sources:** [Controlled source catalogue and reconciliation](commercial-source-reconciliation-2026-10.md)
- **Mapping:** [commercial-candidate-models-2026-10.csv](commercial-candidate-models-2026-10.csv)
- **Review skeletons:** [Offer](commercial-candidate-offer-2026-10.md), [ordinary Contract and annex](commercial-candidate-contract-2026-10.md)

These two blank skeletons turn the primary received example into a reusable review structure. They preserve source section order and locate every slot without copying Client data, prices, clauses or Standard content. They are preparation artifacts, not product schemas, new mandatory fields, approved Templates or ready-to-send documents. The CSV owns slot meaning/provenance; the skeletons own review order. Owning PRDs retain all business behavior.

## 1. Reading and use

Start with the relevant skeleton, then look up its `{{PLACEHOLDER-ID}}` in the CSV. Each placeholder occurs once and has one stable row. A row may represent a grouped field, list or approved wording block; its `meaning` describes the contents to review, not a storage shape or validation contract. Source row numbers identify the received example only. Future corrections retain existing IDs for the same meaning and introduce new IDs for new meanings.

| Column                          | Meaning                                                                                                                                                                       |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `placeholder_id`                | Stable slot ID without braces; `OF-` for Offer, `CT-` for Contract                                                                                                            |
| `model`, `section`              | Candidate artifact and review section                                                                                                                                         |
| `meaning`                       | Information or approved wording intended for that empty slot                                                                                                                  |
| `basis`                         | `Source-derived` observed field/section, or `Proposal` preparation metadata absent from the source                                                                            |
| `placement_basis`               | `Source-derived` observed section position, or `Proposal` candidate placement; assessment inputs retain questionnaire provenance while their structured placement is proposed |
| `source_ids`, `source_location` | Controlled catalogue IDs and located reading evidence; empty for Proposal                                                                                                     |
| `evidence_state`                | `Observed field`, `Contradictory`, or `No source claim`; never approval of a value                                                                                            |
| `reuse_gate`                    | Unresolved review dependency listed below; not a new runtime gate                                                                                                             |
| `owner_link`                    | Existing authority that owns the applicable decision                                                                                                                          |

A reviewer can propose anonymous synthetic values in a private review copy, identify contradictory or unsupported values, and return exact slot IDs for correction. Keep all actual Client/business data and controlled originals outside Git. Do not replace a legal wording slot with received prose merely because the section exists. A future approved Template Version must record its own approval and scope under Governed Documents; merging these skeletons does not create it.

The review envelope is explicitly Proposal metadata outside the source document body. It keeps approval, variant, exact pricing/Offer provenance and unresolved decisions visible without inventing source fields. English labels are technical review labels; Romanian and Russian wording requires separately reviewed language variants.

## 2. Reuse dependencies and variant boundaries

The labels below point to existing decisions; they introduce no approval authority, permission, workflow state or product default. A blank slot remains unresolved even when another slot is validated.

| Gate label   | Review still needed                                                                                               | Authority                                                                                                                                                                                    |
| ------------ | ----------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| G-TEMPLATE   | Reusable structure, exact version and responsible Template owner                                                  | [Governed Documents §14](governed-documents-prd.md#14-evidence-dependencies)                                                                                                                 |
| G-VARIANT    | Issuing Company, legal identity, branding, language and service-specific wording                                  | [Governed Documents §8](governed-documents-prd.md#8-configuration-and-localization)                                                                                                          |
| G-IDENTITY   | Approved Company/Client Legal Entity data and representative context                                              | [Commercial Workflow §§18–19](release-3-commercial-18-offers.md#183-naming-the-client-legal-entity)                                                                                          |
| G-CLAUSES    | Approved legal/commercial wording and exact clause versions; no received clause automatically reused              | [Governed Documents §8](governed-documents-prd.md#8-configuration-and-localization)                                                                                                          |
| G-CONFLICT   | Intended dates, annex reference and Standard editions chosen by responsible owner                                 | [Commercial Workflow §22.3](release-3-commercial-22-controlled-evidence-2026-10.md#223-template-and-field-evidence)                                                                          |
| G-ASSESSMENT | Human-confirmed qualification inputs and rule-specific critical-field selection                                   | [Commercial Workflow §22.3](release-3-commercial-22-controlled-evidence-2026-10.md#223-template-and-field-evidence)                                                                          |
| G-PRICE      | Approved pricing source and Offer–Contract concordance; no historical calibration                                 | [Pricing substitution](release-3-illustrative-pricing-prd.md#16-migration-and-compatibility) and [Contract open questions](release-3-commercial-19-contracts.md#1915-open-product-questions) |
| G-COMMERCIAL | Approved real scope, validity, term, financial conditions and legitimate differences                              | [Offer](release-3-commercial-18-offers.md#1813-open-product-questions) and [Contract](release-3-commercial-19-contracts.md#1915-open-product-questions) open questions                       |
| G-NUMBERING  | Separate Offer/Contract format, allocation moment, yearly reset and cancelled-number handling per Company/kind    | [Commercial Workflow §22.2](release-3-commercial-22-controlled-evidence-2026-10.md#222-numbering-direction-without-an-invented-final-rule)                                                   |
| G-ACCEPTANCE | Real acceptance evidence, ordering, exact Offer Version and confirming authority; neither §22 option selected     | [Commercial Workflow §22.1](release-3-commercial-22-controlled-evidence-2026-10.md#221-case-specific-acceptance-and-the-c1-prerequisite)                                                     |
| G-SIGNATURE  | Mandate, full-signing confirmation and legal effect; signature areas alone prove none                             | [Contract open questions](release-3-commercial-19-contracts.md#1915-open-product-questions)                                                                                                  |
| G-ACTIVITIES | Candidate activities/results only; no mandatory Tasks, assignments, deadlines, completion or certification claims | [Project and Task §13](release-1-project-task-prd.md#13-business-evidence-at-the-current-audited-boundary)                                                                                   |

The primary Romanian consulting model supports this first preparation only. E09–E12 demonstrate comparison service families and Romanian/Russian representations, without supplying approved wording for these skeletons. Separate Company, language, integrated-system, existing-system integration, food-safety and accreditation-preparation variants need their own reviewed scope and evidence. A displayed provider label does not prove ability to perform, certification authority or multi-Company contracting authority. Precontract and Addendum structures are not inferred from the ordinary Contract.

## 3. Source boundaries and conversion proof

E04 supplies qualification inputs; E05 supplies the Offer's cover, introduction, profile, scope/objectives, inputs, methodology, deliverables, realization conditions, financial conditions, closing rationale and eighteen-stage annex. E06 supplies the Contract opening, sections I–IX and thirteen-row activity/result annex. E07 supports only observed signature areas; it supplies no verified signing status. Exact byte hashes remain owned by the source catalogue; originals were checked unchanged for this preparation.

The private legacy originals in E03 were converted with the bundled LibreOffice `soffice` from `.doc` to `.docx`, then rendered to PDF. The Offer rendered twelve pages and the Contract six, matching E05/E06 page counts. Normalized token comparisons across the PDFs and visual comparison of the Offer stage table on p. 9 and Contract annex on p. 6 support section/field preparation. Visible differences remain in fonts, wrapping, borders and row heights; the Offer table header wraps differently. Reading-order/split-header differences occur in extracted text. The PDF signature annotation in E06 is absent from the editable rendering. No substantive section or table-order loss was detected by those comparisons; that limited check does not prove full layout, editable/PDF or version equivalence, signature validity, mandate or legal effect. Derived files stay outside Git and do not become approved Representations or Templates.

The CSV preserves three contradictions without choosing a correction: `OF-DATE` locates the Offer filename/body year conflict; `CT-ANNEX-REFERENCE` locates the Contract/annex date conflict; `OF-STANDARDS` and `CT-STANDARDS` locate differing edition references. Owners must confirm intended reusable values. Originals and immutable illustrative outputs remain unchanged.

The Offer's eighteen stages and Contract annex's thirteen rows have separate IDs and source locations. No one-to-one conversion is specified. Proposed result cells are not completed-work evidence; certification and training outcomes require separate verification and approved wording. No price, staged payment shares, penalty rates, notice interval or legal clause from the received case is carried forward.

## 4. Preparation delivered; operational work remains separate

The received example remains controlled evidence. These files are candidate review structures. An approved Template Version is a later explicitly governed version, while an immutable historical illustrative output preserves the exact Template/data it originally used. A correcting candidate never rewrites either the received source or the illustrative output.

Operational generation needs a separately scoped issue after its actual readiness gates close. This preparation does not change O1–O8/C1–CP2, waive C1's acceptance prerequisite, select a direct-origin workaround, assign official numbers or approve real pricing. Import, upload, storage, sending, signatures, payment tracking, Project automation and operational Template/legal approval remain excluded. This documentation adds no functional MVP percentage gain.
