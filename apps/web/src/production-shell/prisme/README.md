# Prisme frame — issue #226

[Issue #226](https://github.com/Prisma-Prim/PRISMA-PRIM-Suite/issues/226) owns this slice of the [accepted direction #225](https://github.com/Prisma-Prim/PRISMA-PRIM-Suite/issues/225). The [UX PRD](../../../../../docs/product/ux-localization-configuration-prd.md) retains its existing status and business boundaries.

## Entry and composition

The production default is the classic frame. An admitted user can choose **Try Prisme**, or open `/?frame=prisme`. **Use classic frame** removes that query parameter. Both controls preserve the other URL parameters and current section. In-frame links carry the current opaque history state through pushState so the Workspace recovery hint from invitation acceptance survives navigation, Back/Forward and refresh when storage is unavailable; modified clicks keep native link behavior. The frame never interprets that state as authorization. The preference is presentation-only and is not persisted as account or Company data. Recognized fragments are `#overview`, `#clients`, `#access`, `#companies`, `#activity` and `#invitations`; only authorized sections are rendered as navigation.

`App` still owns `useProductionShellContext(identity)` and the existing permission gates, callbacks and feature keys. `ApplicationShell` receives real identity/context, the existing Company selector and an authorized section composition. Section panels remain mounted when hidden or when changing presentation, so drafts and idempotent retry commands survive navigation. Identity, session, Company and permission-version changes still use the existing feature keys and session owner. No API transport, authorization or business workflow is implemented by the frame.

The overview contains identity, active Company and available capability links. Union and administration panel interiors are intentionally retained; the delivered Client directory and dossier slices are described below. There are no synthesized records, KPI totals, Projects, Tasks or Documents. `/ui-baseline` remains the unchanged Atlas Blue snapshot. No invitation acceptance entry is added by this slice.

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

With the usual authenticated frontend/API environment, run `pnpm --filter @prisma-prim/web dev --host 127.0.0.1 --port 5186` and open `http://127.0.0.1:5186/?frame=prisme`. Authentication and API configuration remain the normal prerequisites. Use **Use classic frame** to return.

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
