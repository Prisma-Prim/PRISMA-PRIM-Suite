# Prisme frame — issue #226

[Issue #226](https://github.com/Prisma-Prim/PRISMA-PRIM-Suite/issues/226) owns this slice of the [accepted direction #225](https://github.com/Prisma-Prim/PRISMA-PRIM-Suite/issues/225). The [UX PRD](../../../../../docs/product/ux-localization-configuration-prd.md) retains its existing status and business boundaries.

## Entry and composition

The production default for an admitted user is Prisme. `?frame=classic` is the explicit, reload-stable Classic rollback, while existing `?frame=prisme` links remain compatible. **Use classic frame** adds only `frame=classic`; **Try Prisme** removes only `frame`. Both controls preserve every other URL parameter, the current section, the URL fragment and opaque history state. In-frame links carry that state through pushState so the Workspace recovery hint from invitation acceptance survives navigation, Back/Forward and refresh when storage is unavailable; modified clicks keep native link behavior. The frame never interprets that state as authorization. The preference is presentation-only and is not persisted as account or Company data. Recognized fragments are `#overview`, `#documents`, `#clients`, `#projects`, `#access`, `#companies`, `#activity` and `#invitations`; only authorized sections are rendered as navigation.

`App` still owns `useProductionShellContext(identity)` and the existing permission gates, callbacks and feature keys. `ApplicationShell` receives real identity/context, the existing Company selector and an authorized section composition. Section panels remain mounted when hidden or when changing presentation, so drafts and idempotent retry commands survive navigation. Identity, session, Company and permission-version changes still use the existing feature keys and session owner. No API transport, authorization or business workflow is implemented by the frame.

The overview contains identity, active Company and available capability links. Administration panel interiors are intentionally retained; the delivered Client slices are described below. There are no synthesized records, KPI totals, Projects, Tasks or Documents. `/ui-baseline` remains the unchanged Atlas Blue snapshot. No invitation acceptance entry is added by this slice.

## Accepted visual source

The owner's supplied `prisma-prototype` is the source, specifically Dashboard A in `final-overview.jpg` and `final-mobile-overview.jpg`, with original fiber v3 detail/hero/mobile captures. The reference files were read only; the string-rendered application, global dispatcher and A/B/C comparison controls were not ported.

The composition keeps the 218px sidebar, 70px header, light `#f7f9fc` canvas, dark `#15233b` ink, fine `#e6eaf1` borders, violet actions, faceted SVG mark and spacious typography. The narrow layout uses a keyboard-operable navigation disclosure with context always visible in the header. Copy follows existing centralized English `.copy.ts` conventions. The native Company selector uses a short prompt; the full active name remains in the header, overview and selector title. A stronger white veil under mobile hero copy preserves readable text without modifying the ribbon material.

DM Sans body text and Manrope headings are served locally from `public/prisme/fonts`, with system fallbacks and `font-display: swap`. The unmodified variable TTFs and OFL notices come from [Google Fonts](https://github.com/google/fonts/tree/f2bd09badbc763d8757951d52deec29da27e85fb/ofl), commit `f2bd09badbc763d8757951d52deec29da27e85fb`:

| Local file    | Original source                    | SHA-256                                                            |
| ------------- | ---------------------------------- | ------------------------------------------------------------------ |
| `dm-sans.ttf` | `ofl/dmsans/DMSans[opsz,wght].ttf` | `8cd08d97e89c24d0aa92edd2f0f4c8ee6195eee9b7c9f154865a58b02f0c1c0d` |
| `manrope.ttf` | `ofl/manrope/Manrope[wght].ttf`    | `3ae11c49db0455a3cc33e37d380f20fdb8c7f8b41dc07625c177e3d87a9d6ae6` |

## Fiber boundary and provenance

`FiberMotion` accepts only an optional `light` or `dark` variant and owns rendering, loading, user pause and live reduced-motion preference. It loads `fiber-renderer` asynchronously, leaving the local fallback visible and forms usable. The overview uses the compact light variant. Dark assets/material remain available to the same presentation boundary without introducing a dark product theme.

`fiber-shaders.ts` retains the original vertex and fragment shader strings from prototype `wave.js` (SHA-256 `95b0a7d9a4884e8ea69081564606bbf357953196f618e7eca7790728a243660e`). The renderer retains `PlaneGeometry(1, 1, 64, 176)`, the three layers in order 2/1/0, a 35-degree camera at z=6, and original v3 uniforms/material coefficients. Lifecycle code replaces the prototype mount implementation; it does not substitute smooth v2 material or change the accepted fiber geometry.

One packaged Three.js runtime is pinned to `0.178.0`, with compatible `@types/three` `0.178.1`. No CDN graphics request is made. The supplied MIT notice is at `public/prisme/three-LICENSE.txt`. Four original local fallback PNGs were copied byte-for-byte:

| File in `public/prisme`  | SHA-256                                                            |
| ------------------------ | ------------------------------------------------------------------ |
| `wave-light-desktop.png` | `221d722bdaa7e6da92e0263fb9891738371c6b887edbeb6d8b47d1d76bd3c2b8` |
| `wave-light-mobile.png`  | `d3bac6b135d5a1176eeca2ecb3880b33fd5812aa39d0ae1b432a33a5bdb3ac8d` |
| `wave-dark-desktop.png`  | `3eee96fa6da87bff3c31506d7b534de5779146a56187cbf6d5c38687dabbd98d` |
| `wave-dark-mobile.png`   | `053e3edd9dbb624511cd88e27b82e341b90de858bf78abf9e469c1791299469f` |

Pause/resume preserves accumulated phase. Reduced motion, hidden documents and offscreen graphics stop animation frames; resume resets the frame clock instead of catching up elapsed wall time. Raster limits are 2.1 million pixels / DPR 1.75 on desktop and 1.05 million / DPR 1.5 at narrow widths. Missing/lost WebGL displays the original local fallback. Cleanup cancels frames, disconnects observers, removes listeners and disposes geometry, materials, renderer, context and the dedicated canvas. Deferred imports cannot mount after effect cleanup.

## Reproduce and inspect

With the usual authenticated frontend/API environment, run `pnpm --filter @prisma-prim/web dev --host 127.0.0.1 --port 5186` and open `http://127.0.0.1:5186/`. Authentication and API configuration remain the normal prerequisites. Use **Use classic frame** for the explicit rollback; `/?frame=prisme` remains a compatible Prisme entry.

For deterministic contract-backed evidence without a live backend:

```sh
pnpm --filter @prisma-prim/web test:browser e2e/prisme-frame.spec.ts e2e/prisme-access.spec.ts e2e/fiber-motion.spec.ts
```

The browser harness owns port 4173, builds in existing `local-demo` test mode and intercepts API responses. These tests are not a live Clerk/backend smoke. They exercise both 1440px and 390px, confirm local font loading, and save overview, Client, context-recovery, long-name, paused-fiber and no-WebGL screenshots via `testInfo.outputPath`. Static overview captures use reduced motion; animation tests compare phase behavior, not pixel equality. Generated screenshots stay in ignored test output and CI evidence artifacts.

## Client directory — issue #231

[Issue #231](https://github.com/Prisma-Prim/PRISMA-PRIM-Suite/issues/231) adapts the supplied `final-clients.jpg` and Client composition in `app.js`/`style.css` to the delivered identity and active-Company relationship projection. The directory has submitted name search and an authorized registration disclosure; it adds no prototype fields, filters or business permissions. The existing dossier, correction, duplicate-review and union panels remain available under their existing gates.

`ClientWorkspace` retains all drafts, requests, retry commands and callbacks. The shell supplies only its presentation value through `ApplicationPresentation`. Closing registration hides controls and returns focus without canceling the operation; App's existing Company, session and assignment/version keys still invalidate the owner. Classic presentation keeps its expanded form. `e2e/prisme-clients.spec.ts` proves the minimal/enriched journeys, attachment, uncertain retry and negative states at both viewports, saving screenshots through `testInfo.outputPath`. `App.clients.test.tsx` proves the authority boundaries through the real App composition. These are intercepted API fixtures, not a live Clerk/database smoke.

## Client dossier — issue #233

[Issue #233](https://github.com/Prisma-Prim/PRISMA-PRIM-Suite/issues/233) adapts the accepted prototype's `dossierPage` composition and fine borders into shared details and ordered Contacts, using only delivered Client fields. Correction is an explicit disclosure in Prisme; classic keeps its expanded editor. Duplicate and union interiors remain unchanged.

`ClientDossierPanel` remains the sole owner of the loaded dossier, correction draft, cancellation and retry command. Closing hides the editor without canceling a save; one feedback region stays outside it, near the heading when closed and near the editor when open. Asynchronous responses do not move focus or scroll. Reopening does not reload. The existing stale reload replaces the draft and retry command explicitly. The directory hands focus to the loaded heading only after an explicit opening while its trigger still has focus; hidden sections, presentation changes and background refreshes do not request focus.

`e2e/prisme-dossier.spec.ts` covers correction, uncertain retries, stale reload, validation, opaque duplicate feedback, missing values, denied/revoked access and keyboard behavior at 1440px and 390px. `App.client-corrections.test.tsx` proves correction-specific Client, Company, session and assignment/version invalidation through App, and membership replacement through the public ClientWorkspace owner. It also checks cancellation and late-response suppression. Evidence uses intercepted API fixtures, not live Clerk or backend data. Viewport screenshots preserve the actual reading/editing position; full-page screenshots start from the top to avoid scrolled capture artifacts. Originals remain in ignored test output for CI.

## Rejected Client proposal review — issue #236

[Issue #236](https://github.com/Prisma-Prim/PRISMA-PRIM-Suite/issues/236) adapts the delivered pending-review list and rejected-proposal comparison to the same Prisme typography, fine borders and action hierarchy. Rows remain generic until the server authorizes an explicit detail lookup. Proposed fields and the saved Client remain distinct read-only sources, with ordered Contacts, missing values and server-returned version and relationship information. Empty pages with continuation, list retries, unavailable details and remediation remain separate outcomes.

`ClientDuplicateReviewPanel` remains the sole list/detail/attachment request owner. A confirmed PUT reports only the Company attachment; subsequent refresh failures do not turn it into an unconfirmed mutation or claim durable review resolution. Company, identity, membership, assignment/version, attachment permission and reference invalidation clear local state and cancel pending requests. Section and frame navigation preserve the owner. Keyboard opening hands focus to the comparison only while the original trigger still has focus in a visible section. Correction proposals provide guidance without inventing a dossier link. Union, history and reversal remain unchanged.

`e2e/prisme-duplicate-review.spec.ts` proves the Prisme comparison, permission distinctions, explicit pagination, retries, attachment feedback and navigation at 1440px and 390px. `App.client-duplicate-reviews.test.tsx` proves true context invalidation and late-result suppression through App and the public ClientWorkspace membership boundary. The existing production-shell authority-upgrade journey still proves its mutation and access assertions. Screenshots use intercepted contract fixtures, originate from `testInfo.outputPath`, and remain outside Git; they are not a live Clerk/API smoke.

## Persisted Client comparison and confirmation — issue #241

[Issue #241](https://github.com/Prisma-Prim/PRISMA-PRIM-Suite/issues/241) presents the server-authorized comparison of two persisted Client dossiers with the accepted typography, fine borders and action hierarchy. Visible source numbers distinguish equal names and Contact values without exposing opaque identifiers. The comparison preserves dossier versions, missing values, ordered Contacts, all returned affected Companies, deliberate canonical and scalar-source choices, the written reason, acknowledgements and the existing 50-Contact limit. Each selected scalar source shows its actual saved value read-only below the choice, including absent values. The combined Contact count is neutral while the capacity guard prevents confirmation. Historical dossier presentation remains separate.

`ClientUnionPanel` remains the sole request and retry owner. Its `ClientUnionComparison` child retains choices under the same review-reference key across section and frame changes. Explicit opening may focus the comparison heading only while its trigger still has focus and the section is visible. Closing abandons the local request and clears choices/retry; it does not cancel a command already received by the server. An uncertain command retains the existing body and idempotency key for an explicit unchanged retry.

The panel reports confirmed union completion to `ClientWorkspace`, which keeps a notice for the selected canonical Client even when the returned Client replaces the panel. Existing context and authority keys still invalidate the owners; membership replacement and selected-Client changes clear the notice. A confirmed command remains distinct from later list or Activity Log refresh failures. Superseded-source, history/detail and reversal journeys retain their existing transport and presentation.

`App.client-unions.test.tsx` exercises the second-canonical retry journey and real context/authority invalidation; `ClientUnionPanel.test.tsx` covers validation, capacity, close/reopen, safe refusal, changed intention and late responses. `e2e/prisme-client-union.spec.ts` checks desktop 1440px and narrow 390px journeys with intercepted contract fixtures, including comparison, incomplete confirmation, uncertain retry, unavailable/remediation, capacity and confirmed completion. These are not live Clerk/backend smoke tests. Screenshots originate from `testInfo.outputPath`; viewport captures preserve reading position and full-page captures begin at the top. Stable evidence copies remain outside Git before further browser runs clear the output.

## Client union history and reversal — issue #248

[Issue #248](https://github.com/Prisma-Prim/PRISMA-PRIM-Suite/issues/248) adds the authorized history and deliberate reversal journey to the existing Client union owner. A user can discover server-filtered superseded sources without an active Client selection. Redacted history preserves server order and shows only the generic resolver, action and Company projection. A detail action exists only for a reference returned by the server.

The authorized detail presents the returned state, attribution, reason, two preserved dossier versions, six scalar fields, ordered Contacts, complete captured Company set, canonical Client and separate reversal attribution. Internal operation, actor and correlation metadata stay outside the presentation model. Missing values and source labels remain explicit. A reversal form appears only for a united operation with `canReverse: true`; it submits the existing projection reference, a reason of at most 2,000 characters and the complete fixed Company set.

`ClientUnionPanel` remains the sole request, view, failure and retry owner. An uncertain reversal retains the exact serialized body and idempotency key only for an explicit unchanged retry; changing the reason creates a new command. A stale conflict clears the form and requires a fresh authorized detail lookup. Confirmed reversal remains confirmed if later Client or Activity Log refresh fails. Closing clears local state and retry identity without claiming to cancel a server command. Existing Client, Company, identity, membership, assignment/version and permission boundaries abort late results.

`ClientUnionPanel.test.tsx` covers source states, redaction, attributable detail, validation, uncertainty, stale conflict, changed intention, Close and refresh failure. `client-union-contract.test.ts` keeps internal identifiers outside the view model. `e2e/prisme-client-union-history.spec.ts` proves the fresh no-selection discovery, detail, uncertain reversal, frame and section navigation, unchanged retry and confirmed refresh at 1440px and 390px. Its API responses are intercepted contract fixtures; this is not a live Clerk or backend smoke test. Screenshots use `testInfo.outputPath` and stable copies remain outside Git.

## Preparatory Projects and manual Tasks — issue #254

The Projects section remains available only when the active Company has `project.read`
and the existing Client-read authority. `ProjectWorkspace` remains the sole owner of
the real Project list, selection, Client choice, preparatory creation/reopen command
and its retry intent. In Prisme it adds a bounded operational heading, preparation
notice, Project cards and a responsive detail card; classic retains its existing
markup and behavior. The Project's original Client, active Company and preparation-only
meaning remain explicit. Document registration, correction and Project–Document
association behavior are unchanged by this presentation slice.

`ProjectTasks` and `TaskPresentation` continue to own the existing manual Task list,
detail, draft, mutation, reload and history contracts. Prisme adds only local cards,
fine borders, action hierarchy and visible focus treatment. It does not reinterpret
responsible members, dates, completion, retries or history. A presentation/section
change preserves the mounted Project/Task owners while authority is unchanged; their
existing Company, identity/session, membership, assignment/version and permission keys
continue to clear stale state and suppress late replies.

`e2e/projects.spec.ts` and `e2e/tasks.spec.ts` exercise the real App composition at
desktop and 390px with intercepted contracts: Project create/reopen; Task
create/edit/complete/reopen/history; uncertain exact retry; conflict/reload;
superseded-original read-only history; and denied state. Screenshots are written with
`testInfo.outputPath(...)`; these tests do not claim a live Clerk or backend smoke.

## Working Documents and Project attachments — issue #258

`DocumentWorkspace` remains the owner of the real working-reference list, registration,
detail, correction and retry contracts. Prisme adds a bounded registry heading, warning,
responsive cards and form treatment while Classic retains its existing markup. The
unverified mutable HTTPS-reference meaning, server-owned correction capability, original
Client and responsible Company identities, exact uncertain retry, conflict reload and
confirmed-versus-refresh-failure behavior are unchanged.

`ProjectDocuments` remains the owner of the existing attachment list, eligible selector,
link/removal commands and association refresh. Prisme adds only local cards, fine borders,
action hierarchy and visible focus. Separate organizer and reference-read permissions,
the stored original Client, association revision and exact retry continue to control the
journey; removal never deletes the Document.

`e2e/working-documents.spec.ts` and `e2e/project-documents.spec.ts` prove the real App
composition at desktop and 390px with intercepted authenticated contracts, including
safe external opening, correction, attach/remove, uncertain retry, conflict/reload,
read-only and denied states. Screenshots use `testInfo.outputPath(...)`; these are not
live Clerk, backend or external-provider smoke tests.

## Global Activity Log — issue #257

[Issue #257](https://github.com/Prisma-Prim/PRISMA-PRIM-Suite/issues/257) presents the existing global Activity Log as a compact Prisme ledger with fine dividers, restrained violet markers and readable desktop and narrow spacing. The real projection remains in server order with its existing action labels, target descriptions and timestamps. Loading, error and empty results remain distinct real states.

`App` and the production-shell session remain the data, Company-scope, refresh and request-lifecycle owners. This slice adds no filter, search, pagination, detail action, transport, permission or synthetic event. Classic retains its existing markup and styles because every visual rule is scoped under `.prisme-shell`. `e2e/prisme-activity-log.spec.ts` proves populated data, server order, frame switching and horizontal fit at 1440px and 390px. Its API responses are intercepted contract fixtures, not a live Clerk/backend smoke; screenshots originate from `testInfo.outputPath` and remain outside Git.

## Project detail navigation — issue #262

[Issue #262](https://github.com/Prisma-Prim/PRISMA-PRIM-Suite/issues/262) completes the Project detail delivered by #254 with Prisme-local Tasks and Working Documents tabs. The two existing owners remain mounted; the inactive panel is hidden with `hidden`. A tab or Classic/Prisme frame change does not issue a new Task or Document request, so drafts, conflicts, retry identities and separate permission states remain with their current owners. Classic keeps both sections expanded.

`e2e/prisme-projects.spec.ts` proves Project creation, both mounted panels, retained Task draft, unchanged request counts, Classic/Prisme continuity, focus on the selected tab, opaque-ID absence and horizontal fit at 1440px and 390px. Existing Projects, Tasks and Project Documents journeys remain the detailed permission and retry evidence. Their API responses are intercepted contract fixtures; this is not a live Clerk/backend smoke test. Screenshots originate from `testInfo.outputPath` and remain outside Git.

## Authenticated default promotion — issue #275

[Issue #275](https://github.com/Prisma-Prim/PRISMA-PRIM-Suite/issues/275) promotes Prisme only at the presentation selector. Signed-out welcome, invitation entry, Clerk composition, authorization, `/ui-baseline`, APIs and business owners are unchanged. Changing frame uses `replaceState` with the existing opaque state, keeps mounted section owners and therefore preserves drafts and exact-retry commands.

`application-presentation.test.ts` proves the URL selection and rewrite contract. `e2e/prisme-frame.spec.ts` proves the authenticated default, explicit Classic reload, legacy Prisme links, authorized MVP destinations, keyboard focus, narrow fit and state/draft/retry continuity at 1440px and 390px. Invitation acceptance coverage proves that the server-authorized Workspace reaches the same default frame and keeps recovery state.
