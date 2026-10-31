# PRD — Release 3 Commercial Workflow, section 33: exact non-official PDF download

**Status:** Approved — bounded exact non-official PDF download\
**Owner:** Dan Popescu\
**Contract issue:** [#955](https://github.com/Prisma-Prim/PRISMA-PRIM-Suite/issues/955) under [#290](https://github.com/Prisma-Prim/PRISMA-PRIM-Suite/issues/290)\
**Authority:** [Owner-selected bounded lot and delegated delivery](https://github.com/Prisma-Prim/PRISMA-PRIM-Suite/issues/51#issuecomment-6478554347), 2026-10-28

The separately qualified illustrative Offer v1 extension in [§33.13](#3313-exact-illustrative-offer-v1-extension-987)
is **Approved** under [#987](https://github.com/Prisma-Prim/PRISMA-PRIM-Suite/issues/987).
It does not change the approval or delivered runtime scope of the original contract.

## 33.1 Purpose, authority and outcome

A commercial reader can already reopen the full frozen Romanian model Offer or
ordinary Contract/annex, or the English illustrative Offer under [§18.7](release-3-commercial-18-offers.md#187-illustrative-representation),
and download its HTML. They need a portable, readable PDF of that exact content,
including an older Version, without reconstructing it from today's mutable data
or confusing a download with issuance, signing or permission to use it.

This section solely owns the bounded PDF projection. [§28](release-3-commercial-28-model-offer-generation.md)
and [§30](release-3-commercial-30-model-contract-generation.md) retain commercial
model content, provenance, Versions and decisions; §18.7 retains the existing
illustrative Template and immutable inputs. [Authorization §8](tenant-company-client-authorization-prd.md#8-initial-permission-families),
[Governed Documents §§4–10](governed-documents-prd.md#4-domain-model),
[UX §§5–7](ux-localization-configuration-prd.md#5-required-ui-states),
[Platform §§4–12](platform-security-reliability-operations-prd.md#4-security-boundaries)
and ADRs [0003](../adr/0003-nestjs-owns-business-decisions.md),
[0006](../adr/0006-workspace-tenancy-and-company-scoped-authorization.md) and
[0008](../adr/0008-bounded-document-content-storage.md) retain their boundaries.
DEC-112, DEC-125, DEC-128–136, DEC-138, DEC-177, DEC-181, DEC-183, DEC-198–201 and
DEC-207 explain the inherited exactness, isolation and presentation requirements.

The outcome is an authenticated production-App download of one complete derived
PDF, with an unmistakable non-official notice and exact source identity. Success
means the browser received and offered those bytes; it does not attest that the
user saved or read them. Measurable acceptance is complete source content and
identity, zero unauthorized bytes and an actual desktop/narrow download journey.
These are reversible agent product/technical choices under the cited delegation,
not new Iurie evidence, a numbered decision or delivered runtime.

## 33.2 Complete user stories

1. An existing commercial reader downloads the selected exact Offer Version.
2. An existing Contract reader downloads its complete Contract and thirteen-row
   annex without separately obtaining Offer, model, cost or Document access.
3. A reader deliberately opens an older Version and receives its own full content,
   rather than the current head, current model or a summary.
4. A reviewer can identify the source record, Version, source HTML digest and
   distinct PDF renderer/digest, and sees that no official number is allocated.
5. A reader retains all clauses, issuer/recipient details, literal Unicode,
   financial strings, ordered rows, blank signature areas and provenance.
6. A reader follows long paragraphs and split table rows across clearly identified
   pages without clipping, missing cells or silently shortened text.
7. A user retries a failed read without losing an independent draft or command;
   locale changes preserve its exact target and never translate frozen content.
8. A revoked or wrong-scope user receives a safe refusal, including when authority
   disappears during rendering; late replies cannot trigger a retired download.
9. A user receives an explicit unsupported-content or resource-limit explanation
   while retaining independently authorized exact HTML consultation/download.
10. An existing user retains every original byte, history, decision, assignment,
    received PDF, signature declaration and unrelated pending operation.

## 33.3 Supported sources, lifecycle and exclusions

Only these complete existing formats are supported in this first runtime journey:

| Owner    | Exact supported binding                                                                                                                                                                                                                           |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Offer    | Version provenance `COMPANY_MODEL_ESTIMATE`, eligibility `NON_OFFICIAL_REHEARSAL`, frozen renderer `OFFER_COMPANY_CONSULTING_RO` v1, fixed model family `INTEGRATED_MANAGEMENT_CONSULTING_RO`, language `ro`                                      |
| Contract | Kind `CONTRACT`, origin and Version provenance `COMPANY_MODEL_OFFER`, eligibility `NON_OFFICIAL_REHEARSAL`, frozen renderer `COMPANY_CONSULTING_CONTRACT_RO` v1, fixed model family `INTEGRATED_MANAGEMENT_CONSULTING_CONTRACT_RO`, language `ro` |

The additional illustrative Offer tuple is specified separately in §33.13. Its
admission is conditional on that extension's actual approval, canonical merge and
separate runtime delivery; this preparation does not enable another source kind.

Both `ILLUSTRATIVE` and `COMPANY_SUPPLIED` copied model source kinds qualify, with
their different literal notices preserved. Company-supplied is a source
declaration, not operational/legal approval. A Contract retains its copied Offer
model/economic provenance; PDF projection grants no live source read.

Every currently readable exact supported Version qualifies: current or historical,
pending/approved/rejected, superseded, expired, transmitted/responded, or bearing
a later reported-signing declaration. Those dimensions do not change the frozen
body or require a new approval to download. Model replacement/withdrawal, later
economic Versions and loss of model/cost/Offer-source grants do not invalidate
independently readable frozen commercial content. Current target-read authority
still applies; historical does not mean publicly accessible.

Legacy `ILLUSTRATIVE` Snapshot Offers/Contracts, `APPROVED_ESTIMATE_INTERNAL_DRAFT`
Offers, direct/pending-Offer legacy origins, Precontracts and Addenda are explicitly
unsupported by the delivered model-only PDF renderer. §33.13 conditionally
supersedes only the unadjusted `OFFER_ILLUSTRATIVE` v1 Offer exclusion after its
approval; every other exclusion remains. Their existing reads and representations remain
available under their owners; no fallback relabels them as model-generated. An
internal draft has no representation to convert. Unknown future provenance,
renderer/version, family, language or kind fails closed until separately qualified.

Excluded: DOCX, arbitrary uploaded/caller-supplied HTML, a general export/Template
framework, current-model regeneration, new business inputs, permission/grant or
model-lifetime changes, official numbering, real sending, signing/acceptance,
operational use, Registry registration/storage/designation, provider activation,
deployment, attachments, images, remote resources and external transmission.

## 33.4 Live permission intersection and loss

| Operation                               | Required current authority                                                                                                                                                                                                          |
| --------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Offer PDF                               | Established active Internal User and Workspace Membership, server-authorized active Company context, `commercial.offer.read` and the owning Opportunity's complete current `commercial.opportunity.read` boundary under §18.6/§28.5 |
| Contract PDF                            | The same active actor/context boundary, `commercial.contract.read` and its owning Opportunity's complete current read boundary under §19.6/§30.5                                                                                    |
| Open a live source or received original | Its independent existing owner authorization; PDF access supplies none                                                                                                                                                              |

Use each commercial owner's exact read, including its existing Client-resolution
and visibility fences. Do not add a live Client, economic, configuration, Offer,
Document Content Reader, Activity, preparation, approval, signature or export
permission to copied content reads. Do not bypass an existing target prerequisite
or reproduce Access-table/role-name logic in the PDF controller. Existing captured
assignments, unknown-version refusal and same-Workspace/Company isolation remain
unchanged. Ownership, responsibility, a Director title and an old successful read
are no substitute for this intersection.

Read and validate the exact source through its owner before rendering. Render
outside authorization/database locks. Immediately before releasing any bytes,
re-establish the same live target-read intersection and exact source tuple/digest.
A revocation that wins this final check prevents the response. A successful read
linearizes at the final authorized check; it cannot recall bytes already released
or files already saved. No partial stream, shared cache or durable public URL may
escape before this check. The browser also suppresses replies whose owning
scope/session/target/read authority has been retired.

## 33.5 Public read, identity and truthful errors

Each existing commercial Version owner exposes one bounded exact-PDF read. The
request identifies the Opportunity and exact Offer/Contract Version and supplies
the source HTML SHA-256 observed on that selected Version. It accepts no source
content, model selection, URL, locale, approval flag or caller-chosen renderer.
The server resolves the root and validates the full Workspace/Company/Opportunity/
root/Version relationship. Neither a current-head selector nor root revision is a
substitute: a later head must not make a historical exact read stale.

The response binds the following distinct identities:

- source Workspace, Company, Opportunity, Offer/Contract id, internal reference,
  exact Version id/number, provenance, language and frozen creation instant;
- source HTML renderer code/version and exact source HTML SHA-256: stored HTML
  for the original model bindings, or the exact owner-derived immutable v1 HTML
  under the conditional §33.13 extension;
- the qualified PDF renderer/version and the SHA-256 of the actual PDF bytes:
  `COMMERCIAL_MODEL_PDF` v1 for the existing Romanian bindings, or the distinct
  conditional binding in §33.13, never selected by a caller's locale or flag.

The complete tuple and source digest appear in a readable PDF provenance block.
Every page repeats non-official status, kind/internal reference/Version and page
number, with the source digest in a readable reserved footer. Renderer/font
identities are recorded in PDF metadata; they imply no signature or authenticity
certification. The PDF checksum is carried by the response, never recursively
printed as a checksum of itself. Generated bytes are distinct from source HTML,
received PDFs and any previously approved representation checksum.

Return `application/pdf`, nonempty exact `Content-Length`, attachment disposition,
a server-generated ASCII name such as `offer-7-v3-non-official-ro.pdf`,
`Cache-Control: private, no-store` and `X-Content-Type-Options: nosniff`. Safe names
use only the fixed kind and validated internal reference/number, never Client prose
or an official-number convention. Response metadata exposes the exact root/Version,
source HTML digest, source/PDF renderer versions and PDF digest to the authenticated
browser through the API's existing bounded CORS boundary. The browser verifies
identity, media type, size and actual byte digest before offering a Blob download;
it rejects mismatched, empty, truncated, oversized or malformed successful replies.
Source and output digests must have different explicit names; neither is reused as
the other's ETag or approval evidence. No idempotency key or mutation receipt is
needed for this read. Repeated valid requests may regenerate a derived file; the
actual output digest always identifies the bytes returned.

| Condition                                                             | Observable refusal, with no PDF bytes                                                                     |
| --------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Missing verified identity                                             | Existing `401`                                                                                            |
| Invalid/revoked actor, Company context or required grant              | Existing safe `403`, before source-specific disclosures                                                   |
| Unknown, foreign, inaccessible or wrongly bound exact target          | One uniform safe `404`; no filename, hash, kind, count or hidden identifier                               |
| Malformed identifier/digest or unsupported request field              | Safe `400`; no caller content echoed                                                                      |
| Observed source digest differs from the authorized exact source       | `409 PDF_SOURCE_MISMATCH`; refresh that exact Version, never silently select head                         |
| Readable but unsupported source binding                               | `422 PDF_SOURCE_UNSUPPORTED`; explain that the existing representation remains the supported route        |
| Unsupported character/script/control/glyph or unrenderable layout     | `422 PDF_TEXT_UNSUPPORTED` or `PDF_LAYOUT_UNSUPPORTED`; no replacement glyph, omission or partial success |
| Explicit source/page/output bound exceeded                            | `422 PDF_CONTENT_LIMIT`; no shortened document                                                            |
| Invalid/incoherent frozen content or stored hash                      | Existing owner's safe stored-content failure; never repair or regenerate from current data                |
| Rendering, missing/corrupt bundled asset or transient service failure | Safe retryable `503 PDF_RENDER_UNAVAILABLE`; retain exact target and independently readable source        |

Content-specific errors are disclosed only after ordinary target-read authority
and complete source qualification. Diagnostics use safe codes, never submitted or
stored text, raw parser/font errors or hidden source metadata.

## 33.6 Complete content contract

The exact existing immutable HTML is the body authority. Decode entities once and
preserve every visible text node, block order and table row/cell order from its
qualified fixed format. A bounded reader may use the owner's validated frozen
structured snapshot to verify that binding, but cannot rebuild commercial content
from current Company, Client, model, economic, translation or workflow state.
Existing frozen-format validation may reproduce expected HTML from frozen inputs
to establish integrity; it returns the preserved source rather than replacing it.
The original model bindings continue to use their preserved stored HTML. The
conditional illustrative v1 extension has no stored HTML and follows only the
exact immutable-input source authority in §33.13.2, not current-model regeneration.

| Source area                    | Content that must remain complete                                                                                                                                                                         |
| ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Both banners                   | Literal non-official/no-official-number limits, source-kind notice and all source disclaimers                                                                                                             |
| Offer identity/parties         | Service title; complete declared issuer legal name/tax id/address/contact; internal reference/Version; frozen recipient name/tax id/address; creation and validity instants; explicit absent-value labels |
| Offer framework/body           | All ordered framework name/edition pairs and all ten narrative sections, including payment/realization/closing text                                                                                       |
| Offer conditions/finance       | Scope note and commercial conditions; financial declaration notice, exact net/tax label/tax/gross/currency strings and their labels                                                                       |
| Offer annex/provenance         | All eighteen ordered title/activity/intended-result cells; intended-work notice; exact printed model/economic Version/approval stamps, renderer and eligibility footer                                    |
| Contract identity/provider     | Title, internal reference/Version, declared place/document date, service, issuer fields/contact and complete provider-requisites prose                                                                    |
| Contract Client/framework/body | Client introduction, frozen structured recipient, complete entered requisites, all framework editions and all nine sections I–IX                                                                          |
| Contract case/finance          | Declared optional term dates, copied scope/conditions, added conditions, exact net/tax label/tax/gross/currency and no-payment/no-verified-tax notice                                                     |
| Contract signatures/annex      | Both main blank signature-area texts; full annex title/reference wording; all thirteen ordered title/activity/result cells; intended-work notice and both annex blank signature-area texts                |
| Contract provenance            | Exact source Offer reference/Version/id/HTML digest, copied Contract model/approval and economic-approval references, creation instant and all literal limits                                             |

Source-description prose, tax-declaration basis, concordance/review basis, decision
notes, costs, margin, live source catalogues and received-PDF/signing evidence that
the source HTML deliberately excludes remain excluded. This follows the source's
existing public representation boundary, not an abridgement of its visible body.
Do not append current approval/execution/response state inside the frozen copy.
For example, a later reported-signing declaration does not erase the preparation
HTML's original `nesemnat` notice; the App continues to show current facts outside
that immutable preparation representation.

No translation, Unicode normalization, decimal recalculation, inferred date,
replacement clause, automatic Standard edition or eighteen-to-thirteen mapping
is permitted. Escaped markup such as `<script>` remains literal readable text.
The PDF has a fixed print layout; it promises content/identity conservation, not
pixel equivalence to browser CSS, a received original, PDF/A or tagged-PDF conformance.
The accessible semantic HTML remains available beside it.

## 33.7 Qualified renderer, fonts, layout and resource bounds

Use the existing API `pdf-lib` **1.17.1** first. Its standard Helvetica fails even
Romanian `Ș` (`U+0218`); standard fonts are insufficient. The bounded qualified
choice adds pinned API runtime **`@pdf-lib/fontkit` 1.1.1** (MIT) and explicitly
declares **`parse5` 8.0.1** (MIT, already present in the repository lock transitively)
for correct entity/tree reading. This is a closed reader for the identified
qualified frozen HTML formats, not an arbitrary HTML/CSS converter. Validate the supported
tree/content shape and binding; unexpected meaningful nodes/attributes/structure
refuse rather than disappear. Known fixed head/style metadata is not body text.
Never evaluate scripts, CSS URLs, links, includes or template expressions.

Bundle unmodified **DejaVu Sans 2.37 Regular and Bold** as tracked runtime assets,
with their Bitstream Vera copyright/trademark/permission notice and public-domain
DejaVu additions. Redistribution/embedding is permitted subject to that notice;
do not claim these assets are OFL or distribute Debian packaging as font source.
The qualified TTF SHA-256 values are:

- Regular: `57f73e11f51999432bf7ab22ce55b6f945d5eca1bf824404cfa9ec2e3718c84e`.
- Bold: `a4c5bc453ca281d90ea079e596da7ae0dfeb5777497c29ec254e76d97ff6f890`.

Use full font embedding with ligatures disabled as qualified; do not introduce
unproven subsetting or silent host-font fallback. Assets and notice must be copied
by the Nest build into its compiled output and included in the actual production
package, with module-relative asset resolution independent of working directory.
The packaging smoke proves rendering from that package with system fonts and
network resources unavailable. Missing assets fail the package check and rendering;
installation supplies no approved commercial model or content. No Chromium,
LibreOffice, OS font installation, browser print service, external provider,
filesystem persistence or container/runtime change is required.

The qualified text repertoire is left-to-right Latin/Cyrillic plus Common and
Inherited Unicode characters actually supported by the bundled fonts and shaping
path. It covers Romanian, Russian, French and English, decomposed accents and the
existing `☀️` sequence, including its variation selector. Preflight the complete
document, including headings/provenance, for malformed Unicode, missing glyphs,
unsupported scripts, shaping or conflicting glyph-to-Unicode mappings. Preflight
the complete font/run mapping so two different source sequences cannot collapse
into one extracted sequence. For example, this library/font combination loses a
variation selector when plain `☀` and `☀️` share a glyph mapping in the same PDF;
that combination must refuse with `PDF_TEXT_UNSUPPORTED`, preserving the full HTML
fallback. Supporting `☀️` alone does not prove every mixed sequence. Refuse
control/format characters except CR/LF and
tab; bidi overrides, zero-width formatting and unsupported complex-script text are
not stripped. Han text and an unavailable glyph also refuse explicitly. A source
can therefore remain valid/readable HTML while PDF is unavailable. Never change
the source validation, normalize it, replace it with `?`/tofu, or render only its
supported portions. Any expansion of this repertoire requires qualification.

Preserve literal whitespace as layout: spaces and explicit line breaks remain,
CRLF is one line break, and tabs use fixed eight-column stops. Wrap on grapheme
boundaries without splitting combining/variation sequences; break long unbroken
strings when needed without hyphenating/changing their text. Use A4 portrait,
readable body text at least 9 points and reserved header/footer areas. Repeat table
column headings on every table page, keep row/cell order, and split a row that is
taller than a page with a visible same-row continuation marker. Empty continuation
cells never stand for omitted content. Keep headings with following content where
possible; never overlap, clip, shrink to unreadability or silently discard a row.

Reversible technical bounds are **1 MiB source HTML**, **256 A4 pages** and
**16 MiB completed PDF** per request. Check input before parsing, bound layout and
output allocation, and release owned buffers on completion/cancellation/failure.
These bounds permit the complete first journey and reject pathological input;
they do not change accepted commercial data or create a storage/upload limit.
No successful partial response, stored cache, queue, durable job or production
latency SLA is introduced. Measure complete accepted near-bound fixtures in the
runtime qualification and keep work finite under existing request/process limits.

## 33.8 Production entry, independent asynchronous work and localization

Add a deliberately labelled **Download non-official PDF** action beside the
selected model-based Offer/Contract's existing HTML preview/download in the actual
Prisme Request/Opportunity detail. Exact history and existing Activity/Client
continuations reach that same selected Version; no UUID entry or new navigation
system is needed. Retain current workflow labels outside the frozen bytes.
With no selected Version, retain the existing empty state and issue no PDF request.

The PDF request owns only its exact actor/Workspace/Company/Opportunity/root/
Version/source-digest tuple and local idle/pending/failed/download-offered state.
Prevent duplicate clicks on that pending action. It must not take over an economic
or model selection, command idempotency key, uncertain mutation, draft, quality run,
signing declaration, received-PDF request or another independently authorized read.
Downloading is permitted while an independent mutation is pending when the selected
frozen source remains readable. No new write exclusion is imposed on siblings.

Show delayed pending, unavailable/unsupported, denied, malformed response, retryable
failure and offered-download outcomes distinctly. Failure preserves the exact
target; explicit retry makes a new authorized read of the same tuple. No automatic
retry or uncertain-write protocol is needed. Navigating to another Version retires
that view's pending download; an old reply cannot save under the new selection.
Scope/session/consumed-read loss cancels and clears protected PDF state/Blob URLs
and suppresses late replies. Loss of an unrelated editing/model/economic grant
does not retire an independently authorized PDF. Revalidate with existing owning
Access handlers; this slice neither changes the actor reader nor cancels shell
access revalidation on child unmount. Revoke temporary Blob URLs after use/retirement.

Use shared accessible Prisme controls, visible focus, keyboard activation and
associated status/error text; fit actual desktop **1440** and narrow **390** views.
All action/status/error/accessible copy exists in **ro/ru/fr/en** under the UX owner.
Changing locale preserves the same in-flight target and outcome and creates no
locale-only download/read. PDF labels, literal source wording and non-official
notices remain Romanian as frozen; interface language never becomes document
language. Existing exact HTML is the recovery path after a PDF-specific failure.

## 33.9 Conservation, security, Activity and compatibility

This is a bounded read-derived attachment, not stored Document content. It creates
no schema row, commercial/Document Version, counter, allocation, receipt, decision,
grant, Location, Registry designation, transmission or business Activity event.
The original HTML bytes/digests, models, received originals, checks/decisions,
history, signing declarations and legacy generated bytes remain unchanged. No
migration/backfill or new human evidence is required. ADR 0008's preserved uploaded
originals and malware-scan requirements remain with their owner; this text-only
projection uploads/scans/stores no new received file.

Treat literal data as data throughout parsing, layout, filename and metadata.
No external resource or content reaches a provider; optional-provider outages do
not affect the PDF journey. Diagnostic telemetry may record safe correlation,
fixed error/renderer code, bounded page/byte counts and elapsed processing time,
without raw business prose, financial/party values, document bytes, source bases,
font/parser stacks, credentials or inaccessible identifiers. Existing platform
diagnostic access/retention applies. Do not add download counts or content to a
commercial Activity projection. Refusal leaves every owning record unchanged.

The renderer must integrate through existing exact commercial readers and local
download controls. It does not refactor the active actor-reader or model-access
lifetime work, Task/mission work or broader authorization. Refresh those public
interfaces against actual main before a later runtime author claims the issue;
concurrent tracker state does not itself grant permission to edit their scope.

## 33.10 Required public proof and complete acceptance

| Acceptance                      | Highest stable seam and required observations                                                                                                                                                                                                                                                                                                                             |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A1 — Complete Offer             | Authenticated real-PostgreSQL exact PDF read: all ten sections, eighteen rows/all cells, issuer/recipient, frameworks, validity, scope/conditions, literal amounts, source notices and full provenance                                                                                                                                                                    |
| A2 — Complete ordinary Contract | The same public seam: all nine sections, provider/Client requisites, all thirteen rows/all cells, title/reference wording, dates/conditions, financials and four blank signature areas; no internal basis/cost/signing-source leakage                                                                                                                                     |
| A3 — Source/output identity     | Response tuple/digests agree with stored exact HTML and actual downloaded bytes; wrong observed hash refuses; a newly advanced head never retargets an older exact download; restart and mixed supported/unsupported histories preserve originals                                                                                                                         |
| A4 — Unicode and pagination     | Complete source-shaped examples near the 64 KiB model-content bound, Romanian comma-below/diacritics, Russian Cyrillic, French/English, decomposed accents, `☀️`, escaped markup, repeated cell values, long unbroken text, blank lines and a legal over-page row; no dropped/reordered text, clipping or overlap; headings/notices/source identity on every page         |
| A5 — All read intersections     | Each required permission/context independently absent/revoked/unknown, inactive actor/membership/Company, no Opportunity read, foreign Company and second Workspace/same Internal User; no bytes or hidden metadata; lost model/economic/Offer-source grants retain otherwise authorized copied reads                                                                     |
| A6 — Races/stale/malformed      | Deterministic renderer-boundary barriers with real authorization in both revocation/final-check orders; superseded exact Version, expected-hash mismatch, invalid source/hash/binding, unknown formats, unsupported glyph/control/script or conflicting Unicode mapping, all three resource bounds and rendering failure; no head fallback, source repair or partial file |
| A7 — Actual App download        | Registered owning App/API/PostgreSQL journey at 1440/390: open current and historical selected Versions, download both real endpoint files, inspect offered filename/media type/identity/hash/content, then reload/restart; do not replace this with a mocked Blob or intercepted successful binary response                                                              |
| A8 — Async/locale continuity    | Delayed/error/retry/malformed response, held old reply after target/scope/read loss, unrelated grant loss, independent pending/uncertain mutation preserved and ro/ru/fr/en continuity; rejected/stale bytes never initiate a browser download                                                                                                                            |
| A9 — Conservation/packaging     | Before/after source bytes, all earlier Versions/decisions/receipts/grants, received originals and legacy representations unchanged; frozen dependency install/build and actual production package include the exact font assets/license and render without system fonts/network                                                                                           |

Automated content proof must independently inspect **every downloaded PDF page**.
Use pinned test-only **`pdfjs-dist` 6.4.299** (Apache-2.0, compatible with repository
Node 24) through its local Node module/worker. Its frozen lock includes the ordinary
platform optional **`@napi-rs/canvas` 1.0.13** package needed by its Node entry;
normal frozen installation supplies it, with no host executable/font installation.
This parser is a development/test dependency and introduces no production canvas
or browser-rendering service. Disable evaluation, system fonts, worker resource
fetch and text normalization; close the task and release each page. No OS
`pdftotext`, `pdftoppm`, native browser or unregistered CI provisioning is assumed.
Local Poppler/visual evidence may corroborate the automated seam.

Compare the complete independently extracted glyph sequence and ordered per-row/
per-cell content with the qualified source, allowing only explicitly recorded
layout whitespace and repeated pagination labels. Use unique cell/section
sentinels plus repeated literal-cell cases so set membership cannot hide loss or
duplication. Check exact decoded source strings, including whitespace/codepoints,
at the bounded source-projection seam; PDF extraction alone does not prove exact
whitespace or visual placement. Inspect synthetic rasterized actual files for
first/continuation/final pages, combining marks, clipping and table geometry,
alongside actual App desktop/narrow screenshots. Source and output checksum
assertions alone never prove complete readable content. Verify malformed binary
reply handling separately from the real successful download journey.

## 33.11 Bounded feasibility evidence and technical disposition

A private feasibility experiment on actual main
`5338244eedf2ed74de852dfdf51475a33cc44933` exercised the existing
[Offer renderer](https://github.com/Prisma-Prim/PRISMA-PRIM-Suite/blob/5338244eedf2ed74de852dfdf51475a33cc44933/apps/api/src/offer/model-offer-representation.ts)
and [Contract renderer](https://github.com/Prisma-Prim/PRISMA-PRIM-Suite/blob/5338244eedf2ed74de852dfdf51475a33cc44933/apps/api/src/contract/model-contract-representation.ts)
with complete synthetic source-shaped inputs, each model JSON **65,530 bytes**
within the existing 64 KiB cap and field/row limits. It used the pinned libraries
and full fonts above, no network rendering and no source/production edits.

| Fixture       | Result                                                                         | Exact HTML SHA-256                                                 | Derived PDF SHA-256                                                |
| ------------- | ------------------------------------------------------------------------------ | ------------------------------------------------------------------ | ------------------------------------------------------------------ |
| Full Offer    | 27 pages; 1,020,577 bytes; all 10 sections/18 rows; 11 split-row continuations | `006cefb3f2a94b7802f5c9bde7f40de79a2f3fd2006e50f0e474bce7478206ee` | `cf357947f20e58a25f50fe4f0d906f9f0e9a2287f409457d9c35ce3a7e853f41` |
| Full Contract | 25 pages; 1,027,442 bytes; all 9 sections/13 rows; 12 split-row continuations  | `83919c5a53049383c805607d30678a916a7ff2f9feb4a84a27654e93d250c432` | `6f9e5659b247b71a7267c347f5ccedbe60d2d24a84ba04266efcf984e9e25695` |

The bounded reader conserved every visible source text node. Both independent
PDF.js 6.4.299 and local Poppler extraction matched every emitted glyph sequence,
including decomposed accents and the sun/variation-selector sequence, after only
layout-whitespace normalization. Geometry checks bounded every drawn line;
repeated table headings and a 100-line cell below its 1,000-character input limit
exercised row continuation. Standard Helvetica refused `Ș`; missing Han glyph,
control U+0001, bidi override U+202E and Arabic text refused explicitly. Protected
internal descriptions/bases were absent. Selected raster pages were inspected;
the private prototype's table-padding correction remains feasibility work.
An additional independent mapping probe found the mixed plain-sun/variation-sun
loss described in §33.7; its deliberate complete refusal is part of qualification,
not permission to normalize either source sequence.

This is self-reported private feasibility, not production authorization/download,
CI, accessibility certification, a benchmark/SLA or implementation delivery.
The original #955 documentation PR owns publication of its selected script/manifest/source and
synthetic PDF/extraction/visual evidence and their hashes; private paths alone
are not delivery proof. The future runtime must independently reproduce A1–A9 in
registered tests. These bounded reversible dependency/layout choices require no
new ADR; changing storage, external rendering or authority would need new scope.

## 33.12 Readiness, evidence dependencies and separate runtime child

No Iurie question, actual Client clause, fiscal value, font provider configuration
or unresolved renderer decision blocks this non-official read contract. Official
numbering remains separate Company policy and allocation; a filename/reference or
derived PDF cannot satisfy it. [MISSION-CLOSE-01](release-1-mission-obligations-prd.md#mission-close-01--consulting-completion-before-certification)
remains solely in the mission owner's consolidated-email register: this read
declares no performed work, fulfillment, certificate, waiver or closure. Neither
answer is a prerequisite for reproducing an already readable frozen Version.

| Ticketing-standard gate           | Preparation evidence                                                                                                                               |
| --------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1 Outcome                         | Exact complete non-official file from one selected frozen source, A1–A4                                                                            |
| 2 Scope                           | Same Workspace/Company/Opportunity/root/Version binding, §33.5                                                                                     |
| 3 Actors/permissions              | Existing read intersections and live final check, §33.4                                                                                            |
| 4 Lifecycle/history               | All readable current/historical supported states; no mutation, §33.3/§33.9                                                                         |
| 5 Source/provider                 | Exact immutable HTML; closed local renderer, no provider, §33.6–§33.7                                                                              |
| 6 Examples                        | Complete near-bound synthetic models, Unicode/annex and exact hashes, §33.11                                                                       |
| 7 Failure/empty/access            | Explicit no-source/unsupported/denied/stale/failure and independent retry, §33.5/§33.8                                                             |
| 8 Security/Activity/observability | No new grant/event/content log/cache; existing authority preserved, §33.4/§33.9                                                                    |
| 9 Dependencies/migration          | Pinned renderer/parser/fonts/test extractor; build/package assets; no data migration, §33.7/§33.10                                                 |
| 10 External acceptance            | A1–A9, real REST/PDF extraction/registered actual-App download, §33.10                                                                             |
| 11 Fresh-session fit              | One shared bounded private projection composed by two existing Version owners plus their download controls; no broader model/access/framework work |
| 12 Closed blockers                | No material contract-preparation blocker; actual approval and canonical merge still precede runtime ticket readiness                               |

Ordered independent **Standards then Spec** preparation passed with zero findings.
The coordinator [approved this bounded contract](https://github.com/Prisma-Prim/PRISMA-PRIM-Suite/issues/955#issuecomment-6479686845)
on 2026-10-28 under delegated product authority. The author cannot self-approve it.
The original two-binding runtime is delivered by [#965 / PR #970](https://github.com/Prisma-Prim/PRISMA-PRIM-Suite/pull/970).
The additional §33.13 tuple's separately recorded approval leaves its
canonical-merge gate in place before root requalifies current source seams,
ownership, dependencies and all twelve
ticketing gates for one distinct fresh-author runtime child. That child must
deliver the complete new source-shaped download, production packaging and the
full inherited read/failure contract while retaining A1–A9 as regressions. If
fresh fit evidence fails, split only at another complete usable outcome before
claim. Contract preparation, private feasibility and a drafted ticket confer no
runtime or whole-MVP delivery credit.

## 33.13 Exact illustrative Offer v1 extension (#987)

### 33.13.1 Status, closed tuple and inherited scope

**Status:** Approved — [#987](https://github.com/Prisma-Prim/PRISMA-PRIM-Suite/issues/987).
Ordered independent **Standards then Spec** preparation passed with zero findings
and follow-ups. The coordinator [approved the complete bounded tuple](https://github.com/Prisma-Prim/PRISMA-PRIM-Suite/issues/987#issuecomment-6499422361)
on 2026-10-29 under delegated technical delivery authority. This is contract
approval after #955 and delivered #965, not implementation delivery or a permission
change. Canonical merge and the fresh-child gate in §33.13.6 remain required.

The sole additional tuple is an existing Offer Version with provenance
`ILLUSTRATIVE`, Template code `OFFER_ILLUSTRATIVE`, Template Version `1`, an
unadjusted immutable Pricing Snapshot and source language `en`. Every Snapshot
line must be unadjusted. It needs no fictional model family, copied model
eligibility or stored model HTML. Current and historical Versions qualify only
when the complete owning Offer read remains authorized, as in §18.6 and §33.4.
Pending, approved/rejected, superseded, expired or simulated transmission/response
state neither changes its frozen body nor creates another PDF approval gate.

The original two Romanian model bindings, source kinds, wire identities and all
their content/authority rules remain unchanged. Illustrative adjusted Template
v2, legacy Contracts, internal drafts, arbitrary HTML and every other unsupported
tuple remain excluded. This format introduces no business/legal/pricing rule,
source grant, migration/backfill, storage, event, official number, signature,
transmission, provider, font or dependency change. It is no whole-capability credit.

### 33.13.2 Exact source authority and closed body grammar

The existing Offer owner reads the requested exact Version and its recorded
immutable input/Snapshot tuple, then uses the existing §18.7 v1 Template to obtain
its deterministic HTML and SHA-256. Those exact returned bytes and digest are
authoritative. There is no legacy stored HTML file to adopt or model snapshot to
invent. Do not use today's Company/Client/catalogue/pricing data, recalculate any
amount, change an original input, or substitute another Version/head.

For this tuple only, the following §18.7 inventory replaces §33.6's model-specific
content inventory; it adds no model requisites, clauses, annex or second source
notice to legacy content. The original Romanian formats retain their full
§33.6 inventory and stored-HTML rules unchanged.

Qualify only that fixed English `lang="en"` document, including its exact
meta/CSP/title/style head and the single `article`. The article has one header,
five sections in order (`Offer details`, `Services`, `Totals`, `Scope note`,
`Commercial conditions`) and its footer. Preserve the existing v1 head/style
literally as qualification input; never evaluate CSS, script, links or resources.
The header's original notice remains verbatim:
“Provisional illustrative document — cannot be accepted — no legal effect — no official number”.

Keep the complete existing issuer/recipient identity copy, absent-value marker
`Not recorded`, reference/Version, dates, scope/conditions, totals/currency and
Template/Snapshot/provenance footer. The Services table has exactly these seven
ordered columns: `Service name`, `Quantity`, `Unit`, `Unit amount`, `Line net`,
`Tax label`, `Line tax`; its 1–20 rows follow immutable Snapshot order. Preserve
every literal cell and stored decimal/currency string; do not reconstruct a model
annex, derive an adjustment or silently shorten content.

Use the existing parser's one entity-decoding pass and standard HTML CRLF-to-LF
handling. §33.7's explicit-line-break, fixed-eight-column-tab and grapheme rules
apply to the captured text nodes. V1 browser CSS pixel equivalence is not claimed;
its literal source text is not replaced by a summary or ad hoc normalization.
Unknown meaningful nodes, attributes, structure or text refuse rather than
disappear. Existing text/mapping/control and resource-limit refusals remain.

### 33.13.3 Distinct PDF identity, exact response and English print labels

The additional derived PDF binding is `COMMERCIAL_ILLUSTRATIVE_OFFER_PDF/1`.
The original `COMMERCIAL_MODEL_PDF/1` remains paired only with its existing
Romanian model tuples. The server chooses from the fully qualified source tuple;
no request renderer/language/approval flag or current interface choice selects it.

Reuse the existing exact Offer-Version PDF endpoint and its sole
`sourceHtmlSha256` query field. `X-Commercial-Pdf-Source` retains the bounded exact
source identity keys from §33.5, with `kind: offer`, `provenance: ILLUSTRATIVE`,
`language: en`, `sourceRendererCode: OFFER_ILLUSTRATIVE`,
`sourceRendererVersion: 1` and the digest of the exact derived v1 HTML. Include
the actual Workspace, Company, Opportunity, Offer id/reference, exact Version
id/number and creation instant; omit raw HTML. Template/Snapshot identities stay
visible in the original complete source footer. Invent no model-source identity.

Return `X-Commercial-Pdf-Renderer: COMMERCIAL_ILLUSTRATIVE_OFFER_PDF/1` and
`X-Commercial-Pdf-Sha256` for the actual completed PDF. Retain `application/pdf`,
the exact nonempty `Content-Length`, `Cache-Control: private, no-store` and
`X-Content-Type-Options: nosniff`. The exact attachment filename is
`offer-REFERENCE-vVERSION-non-official-en.pdf`, generated only from the validated
internal reference and Version number. Expose only the existing bounded response
metadata through CORS. The browser validates this exact closed source/PDF pairing,
filename, media type, length, parseability, page/byte bounds and actual digest
before offering a Blob; accepting either renderer for any tuple is forbidden.

New technical print labels are English: `NON-OFFICIAL PDF COPY — no official number or legal effect`,
`Offer REFERENCE / version VERSION`, `Page N`, `Row N — continuation` and
`SHA-256 HTML: SOURCE_DIGEST`. The provenance heading is
`Exact provenance of this non-official PDF copy`; the block names the complete
§33.5 identity, English source language, Template v1/source digest, this distinct
PDF binding and exact existing font identity. These labels neither translate
frozen source content nor change its original notice or legal meaning.

### 33.13.4 Seven-column layout and finite native qualification

Reuse exactly §33.7's pinned native libraries, complete licensed fonts, glyph/run
preflight, A4 portrait and source/page/output limits. The seven widths in source
column order are **120, 57, 38, 80, 70, 76, 70.28 points** (511.28 total), with
5-point inner side padding. Body/table text is 9.5 points; no text is below
9 points. Retain reserved header/footer space, repeated complete table headings,
ordered cells and a visible same-row continuation marker. No new clipping,
shrinking, host fonts, remote resources or renderer fallback is allowed.

A self-reported private native feasibility experiment used actual source
`86845ecabb24fa11231dabae88b1b7762891287a`, its existing v1 HTML renderer,
the pinned libraries/full fonts and independent PDF.js 6.4.299 inspection. The
existing PDF reader correctly refused the same v1 inputs; a private throwaway
closed-v1 projection/layout treatment produced these finite observations:

| Complete source-shaped vector                                                                                                        | Observed pages | PDF bytes |
| ------------------------------------------------------------------------------------------------------------------------------------ | -------------: | --------: |
| Existing one-row v1 golden source                                                                                                    |              2 |   933,085 |
| 20 rows, 2,000-character scope and 4,000-character conditions                                                                        |              8 |   966,804 |
| A multi-page row and many-line maximum notes                                                                                         |             80 | 1,147,467 |
| Literal double spaces, tab and CRLF/blank line                                                                                       |              2 |   933,174 |
| All 20 rows with maximum interior LF in 160/24/60-character name/unit/tax cells, plus 2,000/4,000-character notes with nonblank ends |            227 | 1,617,523 |

All source blocks and ordered cells survived independent extraction, every
page/cell stayed within its qualified geometry and minimum size was 9 points.
Native positions separately checked literal spaces/tab/blank lines. Existing
unsupported script/control and conflicting-glyph-mapping examples refused.
The initial width choice wrapped two headings mid-word; only the seven widths
changed before the final complete-heading observations above. Original and
corrective artifacts remain retained privately, with first/continuation/final
rasters inspected. No original HTML/input/font byte or product source was edited.

This is finite feasibility, not a universal worst case, benchmark/SLA, production
package, real authorization/download, public evidence attestation or runtime
delivery. Other valid inputs can still require the inherited text/layout/limit
refusal; do not raise a limit or return partial output to call them supported.
This documentation preparation authorizes no evidence upload. The runtime must
independently reproduce the complete result and refusals through its public seams.

### 33.13.5 Inherited authorization, App journey and complete runtime proof

§33.4's full owner reads apply before rendering and immediately before releasing
any metadata/PDF bytes, including current Client-resolution and Opportunity
visibility fences. Render outside those authorization/database locks. Repeat the
exact immutable-source tuple/digest check at the final authorized boundary.
Revocation that wins that check returns no PDF; a completed read cannot recall
already released bytes. Do not add source/Snapshot/model/Document access or use
role names, earlier success or a job title as authority. Every §33.5 safe refusal
continues to apply, including source mismatch and no supported-format fallback.

Extend only the actual selected-Version Offer HTML consultation's PDF action.
Current and historical v1 Versions, reload and authorized history continuations
reach the same exact target without a UUID entry screen. Inherit §33.8's
independent state, delayed/error/unsupported/denied/malformed outcomes, explicit
same-target retry, retirement/cancellation, Blob cleanup and pending/uncertain
command preservation. Empty/unsupported selection makes no speculative PDF call.
All action/status/error/accessible UI copy follows ro/ru/fr/en; locale changes
preserve the in-flight tuple/outcome and issue zero locale-only I/O. Frozen source
and English PDF labels never follow interface locale. Keep Prisme keyboard/focus
and actual desktop 1440/narrow 390 fit.

The fresh runtime child must prove all of the following, not only a parser or
mocked successful Blob:

- Real REST/PostgreSQL exact current/historical v1 reads, source tuple/digests,
  unchanged HTML/inputs/decisions/receipts and unsupported adjusted/legacy tuples.
- Every independent live authority and cross-Company/Workspace fence, both
  deterministic revocation/final-check orders, no hidden metadata or partial bytes.
- Complete fixed v1 grammar/content, golden/20-row/max-note/long-row/Unicode and
  extreme-line-break cases, unknown meaningful source rejection, all limits,
  missing/corrupt assets and rendering failure, with truthful HTML recovery.
- Independent all-page source/cell extraction and geometry, explicit whitespace
  checks, real file rasters and malformed-binary tests under §33.10's existing
  test-only extractor; checksums alone cannot prove readable completeness.
- Registered actual App/API/PostgreSQL downloads at 1440/390, current/history,
  reload/restart, observed exact filenames/metadata/hashes/content, four locales,
  delayed/error/retry and retired replies while independent work stays intact.
- Actual production packaging with the exact font assets/license, module-relative
  resolution and rendering without system fonts/network. This private native
  experiment does not supply that check. Retain original A1–A9 as regressions.

### 33.13.6 Approval and fresh-child gate

No new Iurie/business/price/licence/provider fact was needed to prepare this
technical extension. Ordered independent Standards then Spec preparation and
the coordinator's actual delegated technical approval are complete as recorded
in §33.13.1. Only after approved canonical merge may root
refresh all twelve ticketing gates, actual main/source seams, ownership and
single-session fit and create one separate fresh-author end-to-end runtime child.
No claim, ready label, contract preparation, retained private proof or prior
model-PDF CI substitutes for the fresh readiness decision or the new child's exact
final proof.
