# Clarté interface

[#1530](https://github.com/Prisma-Prim/PRISMA-PRIM-Suite/issues/1530) lays the foundation of the Clarté interface chosen in [#1528](https://github.com/Prisma-Prim/PRISMA-PRIM-Suite/issues/1528): the tester switch, the design tokens and base components, and the frame that reaches every existing section. [ADR 0011](../../../../docs/adr/0011-clarte-interface-replaces-prisme-lumiere.md) records the decision. The current interface stays the default until the switch-over [#1548](https://github.com/Prisma-Prim/PRISMA-PRIM-Suite/issues/1548).

## Rules for every Clarté slice

- Import nothing from `src/production-shell/prisme/` or `public/prisme/`. Clarté owns its fonts, tokens, mark and components, so the switch-over can delete Prisme.
- Light background only. Scope every selector under `.clarte-frame` or a `clarte-` class; the current interface must render exactly as before.
- Every text lives in a `*.copy.ts` catalogue with Romanian, Russian, French and English; the catalogue coverage tests find it by file name.
- App keeps the permission gates, keys, drafts and callbacks. A Clarté screen reuses the existing transports and never decides authority.

## The switch

`interface-preference.ts` reads, sets and clears the browser choice (`prisma-prim.interface`); unavailable storage means the current interface. `InterfacePreferenceProvider` (mounted by `ApplicationRoot`) applies `?interface=clarte` or `?interface=current` once, removes the parameter and gives App the preference. App renders `ClarteFrame` instead of the current shell with the same composition. The frame's user menu offers the interface language and "Leave the Clarté interface"; the floating language selector steps aside while the frame is mounted.

## Replace a tab renderer

`clarte-entries.ts` maps each App section to one entry and tab. Until a slice migrates it, a tab uses `renderCurrentScreen`, which shows the current component. To migrate your tab:

1. Build the screen under `src/clarte/<area>/` with the base components below.
2. In `App.tsx`, give the section a `clarteContent` next to its unchanged `content`, composed with the same gates, key and callbacks:

   ```tsx
   sections.push({
     id: 'clients',
     ...prismeCopy.sections.clients,
     content: <ClientWorkspace key={key} {...props} />,
     clarteContent: <ClarteClients key={key} {...props} />,
   });
   ```

3. In `clarte-entries.ts`, change only your own tab: `{ destination: 'clients', render: renderClarteScreen }`. Do not touch `ClarteFrame.tsx` or another slice's tab.

Today is not an App section: pass your screen as `clarteOverview` to `ClarteFrame` in App, then set the `overview` tab to `renderClarteScreen`.

A view that exists only in Clarté, such as Finance › Payment proofs (#1544), is a section App pushes only while the preference is `clarte`, with `content: null`, its own id in `ApplicationSection['id']` and a tab in its entry. The current interface never receives it.

The frame keeps the screen title, the row of views, mounting (hidden sections stay mounted, `mountWhenSelected` and `retainAfterSelection` as today), focus on the destination, Escape, the jump list and the protected-write hold. The section's `id` is the URL fragment and the focus destination, as in the current shell.

## Render App in Clarté in a test

`src/test/app-interface.tsx` renders App through the real preference provider:

```tsx
import { appInterfaces, renderInInterface } from './test/app-interface';

describe.each(appInterfaces)('Clients in the %s interface', (appInterface) => {
  it('registers a Client', async () => {
    renderInInterface(appInterface, <App identity={identity} />);
  });
});
```

Until the switch-over, an App-level test of your functions runs in both interfaces; the switch-over removes `current` from `appInterfaces`. What differs in Clarté: the left menu `Primary navigation` lists entries, not sections; a screen with several views has a `<Entry> views` navigation; "Sign out" and the interface language (a group of four radio buttons, not the floating Select) are inside the `User menu` disclosure; the jump list opens with Ctrl K and is a dialog named "Go to a screen". A URL fragment (`/#clients`) selects a section in both interfaces.

## Open Clarté in a Playwright journey

`e2e/clarte.fixture.ts` opens a path with the opt-in parameter and waits for the frame:

```ts
import { isPhoneLayout, openClarte, openClarteEntry } from './clarte.fixture';

await openClarte(page, '/#clients');
await openClarteEntry(page, 'Tasks'); // left menu, or bottom bar and More on phone
```

Intercept every API read with `page.route('**/api/**', …)` and fictional data. Save screenshots through `test.info().outputPath(...)` and inspect the 1440 px and 390 px ones. `clarte-frame.acceptance.spec.ts` holds the frame journey; add your area's journey as `e2e/clarte-<area>.acceptance.spec.ts` so parallel slices never edit one spec file.

## Tokens and base components

`clarte-tokens.css` defines the tokens on `.clarte-frame`: surfaces and ink (`--clarte-bg`, `--clarte-surface`, `--clarte-ink`, `--clarte-muted`, `--clarte-line`), the single accent (`--clarte-accent`, `--clarte-accent-soft`, `--clarte-accent-text` for text on soft accent), status tones (`--clarte-success`, `--clarte-warning`, `--clarte-danger`, `--clarte-info` and their `-soft`), radii, shadows, `--clarte-touch-target` (44 px on phone) and the fonts `--clarte-font-body` and `--clarte-font-heading`. The prism sequence `--clarte-stage-1` to `--clarte-stage-7` is reserved for the seven affaire stages.

| Need                      | Use                                                                                  |
| ------------------------- | ------------------------------------------------------------------------------------ |
| Buttons                   | `ClarteButton` (`primary` only for the main action, `secondary`, `quiet`, `danger`)  |
| Fields                    | `ClarteField` with `className="clarte-input"`; the shared `Select` takes the same id |
| Chips and status badges   | `ClarteBadge` with a `tone`; the text states the status                              |
| Cards                     | `ClarteCard`; with a `title` it is a named region                                    |
| Lists and tables          | `ul.clarte-list`, `table.clarte-table` inside `div.clarte-table-wrap`                |
| Views of one screen       | `ClarteTabs` (links with their own URL)                                              |
| Side panel                | `ClarteSidePanel`: modal, Escape closes, focus returns to the opener                 |
| Confirmation              | `ClarteConfirmDialog`: starts on Cancel, the confirm button names the action         |
| Empty, loading and errors | `ClarteEmptyState`, `ClarteLoadingState` (`status`), `ClarteErrorState` (`alert`)    |

Screens not migrated yet keep their own markup; zero-specificity rules in `clarte-frame.css` give their plain controls a quiet Clarté look until their slice replaces them.

## Screens outside the frame

The public welcome, the access states, the invitation entry and the ChatGPT callback window ([#1531](https://github.com/Prisma-Prim/PRISMA-PRIM-Suite/issues/1531)) come before the frame. Their owners keep the behaviour (`ApplicationRoot`, App's access states, `access-composition.tsx`, `WorkspaceInvitationEntry`, `WorkspaceInvitationAcceptance`, `ChatGptCallback`) and choose the `entry/` renderer when the preference is `clarte`. Each renders inside `ClartePage`: one card on a light page whose root carries `clarte-frame` for the tokens and base components and `clarte-page` instead of the frame's layout. The page offers the four interface languages and claims the language control, so the floating selector steps aside. `src/test/entry-interface.tsx` holds the steps that differ between the two interfaces on these screens.

## Fonts

DM Sans and Manrope are served from `public/clarte/fonts` under the Clarté-owned families `Clarte DM Sans` and `Clarte Manrope`, with their SIL Open Font License notices. They are byte-identical copies of the unmodified variable fonts from [Google Fonts](https://github.com/google/fonts/tree/f2bd09badbc763d8757951d52deec29da27e85fb/ofl), commit `f2bd09badbc763d8757951d52deec29da27e85fb`:

| Local file    | Original source                    | SHA-256                                                            |
| ------------- | ---------------------------------- | ------------------------------------------------------------------ |
| `dm-sans.ttf` | `ofl/dmsans/DMSans[opsz,wght].ttf` | `8cd08d97e89c24d0aa92edd2f0f4c8ee6195eee9b7c9f154865a58b02f0c1c0d` |
| `manrope.ttf` | `ofl/manrope/Manrope[wght].ttf`    | `3ae11c49db0455a3cc33e37d380f20fdb8c7f8b41dc07625c177e3d87a9d6ae6` |
