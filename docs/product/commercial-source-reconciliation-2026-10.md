# Controlled commercial source reconciliation October 2026

- **Status:** Non-canonical evidence mapping — no operational approval
- **Owner:** Dan Popescu
- **Delivery:** [#493](https://github.com/Prisma-Prim/PRISMA-PRIM-Suite/issues/493) under [#290](https://github.com/Prisma-Prim/PRISMA-PRIM-Suite/issues/290)
- **Baseline:** `8672f38673b07d6eeb0a16e3d3505f46d95c3107`
- **Matrix:** [commercial-source-reconciliation-2026-10.csv](commercial-source-reconciliation-2026-10.csv)

The October package supplies one primary commercial dossier and seven comparison dossiers. It supports preparation of representative questionnaire, Offer, Contract and Project models. Receipt establishes neither template approval nor an operational pricing, acceptance, signature or numbering policy. The matrix records source facts and gaps; owning PRDs alone define behavior.

## 1. Controlled provenance

Dan retains the source files and the mapping from opaque IDs to their original names outside Git. Hashes identify the exact received bytes, not their validity or legal effect. No Client identity, case amount, contact, bank detail, raw email, source attachment or licensed Standard content is reproduced here. `E` IDs designate evidence sources, never question-bank IDs or new product decisions.

| ID  | Controlled source                              | SHA-256                                                            | Reading location                                                                                          |
| --- | ---------------------------------------------- | ------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------- |
| E01 | Package-selection clarification                | `d0e32aedf686368ca7aef99b15773f49d8942d60aba4be82c0aa5fbee8c13568` | PDF p. 1, direct reply before quoted history                                                              |
| E02 | Acceptance and numbering clarification         | `6bacf53721c022ffd2090c2e7a451d26d0301929fe65a4ac8aca2e5276019368` | PDF p. 1, acceptance and numbering paragraphs                                                             |
| E03 | Complete project package                       | `67152f2a0c1f799dc90f71703fff86e1ae99797632cc14dc93fe18b79e36e9cc` | Eight nested dossier archives and pricing specification                                                   |
| E04 | Primary completed questionnaire                | `4382bc1279574604b098a23b550228d254df8e7fe9fb111716d3509d2cde4e68` | PDF pp. 1–10, sections I–XI                                                                               |
| E05 | Primary Offer                                  | `9419696c63b155069915ab8a0f9dfbca42ee2dfaf30c4c19a6c343f6dc8cc81e` | PDF p. 1 scope/date; p. 7 realization conditions; p. 8 payment conditions; pp. 9–11 implementation stages |
| E06 | Primary Contract PDF with signature annotation | `663b0e4f1536c72193622e5255945b19c9d7affd753e34d45ed7114f353f0b78` | PDF p. 1, §1.1; p. 3 financial terms; p. 5 signatures; p. 6 annex                                         |
| E07 | Primary final scanned Contract                 | `a0b48293e81d14935ec04e04e29c71d6975b9dd94d25bdf4c301565e73c656be` | PDF p. 5 signature areas, p. 6 annex; visual inspection                                                   |
| E08 | Pricing and profitability specification        | `4017d068401a40ab7112c86a0a55fd29adb21abd13776a172b87b69703499f63` | DOCX §§1–19; already normalized by #488/#489                                                              |
| E09 | Comparison integrated-system Offer             | `9ca620b7de4580664741d38966f6c36365232587c78e86cc8cf037a4e8e0a3bf` | PDF p. 1, framework set and scope                                                                         |
| E10 | Comparison energy-integration Offer            | `638f9d997b64c1351520511649f06859f604464616badc4fde092018f004356b` | PDF p. 1, language, issuing labels and scope                                                              |
| E11 | Comparison food-safety Offer                   | `48e9520f32785d35bd12012f1580d6f2a95286f7d1c7d4f85936d3fd99a75ee2` | PDF p. 1, language, scheme version and scope                                                              |
| E12 | Comparison accreditation-preparation Offer     | `b0d8cd04e8fe3dbef5dba45f2d499dd01aca7210c52cde3b58926ab8af2cbce8` | PDF p. 1, service family and scope                                                                        |

E01/E02 are faithfully paraphrased business replies. E04–E07 establish what the received documents state or visibly show; they do not independently verify the stated facts. The editable primary Offer and Contract are legacy `.doc` files inside E03. Extracted UTF-16 strings are indicative only; the corresponding PDFs and visual scan support this reconciliation. The [candidate-model guide](commercial-candidate-models-2026-10.md#3-source-boundaries-and-conversion-proof) records subsequent reliable conversion and its limited structural comparison; operational reuse still needs owner validation. Do not interpret a failed extraction as an empty file or certify editable/PDF equivalence.

The remaining three comparison dossiers are inventoried in E03 but their legacy editable material is not used to approve clauses or infer missing policy. E09–E12 suffice to demonstrate different framework sets, integration into an existing system, food-safety scheme versioning, accreditation-preparation scope and Romanian/Russian representations. A document displaying multiple provider labels does not authorize a multi-Company agreement or establish who may certify. Prices and claims in comparison cases are not tariffs or verified capability evidence.

## 2. Authority and substitutions

The [Commercial Workflow PRD §22](release-3-commercial-workflow-prd.md#22-controlled-commercial-evidence-october-2026-493) owns the consequence of the acceptance/numbering evidence and the unresolved alternatives. The [confirmed-cost Draft §3](release-3-confirmed-cost-profitability-estimate-prd.md#3-controlled-source-provenance-and-handling) owns pricing-source handling. The [Governed Documents PRD §14](governed-documents-prd.md#14-evidence-dependencies) owns the distinction between received examples and approved reusable Templates/clauses.

The [substitution register](first-tenant-substitution-register.md#october-2026-received-materials) records only the reduced material requests. Its `decision` and `decision_ref` remain unchanged: Iurie has not accepted or corrected the demonstration rows through the trial-decision protocol. No historical interview coverage status changes.

| Preparation now supported                        | Register rows                   | Still required before substitution                                                                                                   |
| ------------------------------------------------ | ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Questionnaire fields and service-specific inputs | SUB-PR-01, SUB-PR-03, SUB-PR-04 | Confirm which fields are critical for each approved rule; obtain actual worked calculations from a suitable different case           |
| Offer layout and section inventory               | SUB-OF-01, SUB-OF-07            | Correct contradictory metadata, approve reusable text and variants; two negotiated versions are still missing                        |
| Contract and annex inventory                     | SUB-CT-01, SUB-CT-02            | Approve reusable clauses, Template owner and variants; ordinary executed example does not supply Precontract/Addendum policy         |
| Acceptance/signature evidence design             | SUB-OF-06, SUB-CT-04            | Resolve §22's ordering and authority choices; preserve exact evidence without asserting signature validation or payment verification |
| Separate numbering configuration dimensions      | SUB-OF-02, SUB-CT-03            | Final assignment moment, format, annual reset and cancelled-number handling per issuing Company and applicable kind                  |
| Candidate Project activity/result model          | SUB-PJ-01                       | Approve category, mandatory/optional Tasks, responsible actors, timing and completion evidence                                       |
| Document-family/Representation inventory         | SUB-DO-01                       | Ownership, exact version relationships and official-designation authority; received formats grant no upload/import permission        |

The primary Contract annex contains thirteen activity/result rows. It supports a candidate template inventory, not executed Task status, assignment, deadlines, closure, accreditation or successful certification. Its financial schedule is case-specific and remains outside Git and outside this delivery scope.

## 3. Conflicts and unknowns

The matrix locates the primary Offer filename/content year conflict, Contract/annex date conflict and differing Standard edition references. Keep originals byte-for-byte. A future model correction requires the responsible business/template owner to choose the intended values; filename, body order or a signature annotation does not decide legal precedence.

E01 explicitly says the primary price preceded the formal method and no standardized calculation workbook existed for that case. Cost, effort, allocated overhead and historical margin remain unknown, rather than zero. Do not request that nonexistent workbook again, fit the engine to the historical price, or treat an unrelated energy-consumption spreadsheet as the missing price calculation. E08 is unchanged evidence already used by #489; it creates no second pricing specification or approval of that Draft.

E02 describes an Offer followed by Contract-detail submission, Contract signature and payment, with acceptance confirmed through progression to and signature of the Contract. The package does not supply the original Client acceptance message or payment proof. Sending legal details alone is not demonstrated final acceptance; the reported payment is not independently verified. Visual signature areas in E07 are observations, not cryptographic validity, signatory mandate or effective-date validation.

## 4. Delivered candidate preparation

The [candidate field/section mapping and review skeletons](commercial-candidate-models-2026-10.md), delivered under [#495](https://github.com/Prisma-Prim/PRISMA-PRIM-Suite/issues/495), now locate synthetic Offer and ordinary Contract/annex slots from E04–E07. The guide owns placeholder meaning, candidate reuse dependencies, distinct eighteen-stage/thirteen-row inventories and limited legacy-conversion comparison. It copies no received clauses or values and corrects no original.

These are non-canonical candidate structures, not approved operational Templates. Company/service/language variants, contradictory metadata, reusable clauses, acceptance ordering and official numbering remain subject to their existing owning PRDs. Operational generation needs a separate issue after its actual readiness gates close.

Excluded: O2/O7 code, calculator, Contract implementation, real generation, import, upload, stored bytes, external sending/signature, legal-clause approval, permission changes, payment tracking and Project Task automation. This reconciliation and candidate preparation deliver no functional MVP percentage gain. Existing illustrative slices remain independently executable under their approved contracts.
