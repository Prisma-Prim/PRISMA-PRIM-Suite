# Design lab extension convention

The lab is available only below `/design-lab`. Its index and placeholders are
lab infrastructure; they are not a product shell or a starting visual system.

Every direction receives the same `comparisonFixture` and supports these route
screens:

- `dashboard`
- `client-request`
- `analysis-review`

Desktop captures use 1440×900. Narrow captures use 390×844. The executable
values live in `comparisonViewports.ts` and in the Playwright projects.

## Add one direction

1. Create `concepts/<direction-id>/Concept.tsx` and a concept-owned stylesheet.
2. Implement the complete shell, navigation, page composition, and responsive
   behaviour inside that directory. Do not import components or styles from
   another concept.
3. Accept `ConceptProps`, render all three screen values, and read only the
   canonical fixture passed in `fixture`. Do not copy or alter fixture content.
4. Import the component in `directions.ts` and set `Concept` on that direction's
   existing registry entry. Do not edit another direction's directory or entry.
5. Exercise all three routes at both comparison viewports. Keep the lab index
   and normal application routes passing.

Concepts may share only neutral lab inputs: `comparisonFixture.ts`,
`comparisonViewports.ts`, and the types exported by `directions.ts`. A concept
must not inherit the lab placeholder markup or another concept's visual shell.
