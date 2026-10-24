# Independent Spec review — #838

Reviewed source: `5fc0e9ce1a1163fdf21ec513c1d04806d4809c35`.
Base: `2833f0aad168bd002bc3eba1b4d3dcb8dca69cd6`.
Tree: `54a34e0905a3accae639352317abeffba5004674`.

Disposition: **one P2 acceptance/data-integrity blocker**.

- **Preserve the legacy position bound on UPDATE as well as INSERT.**
  `apps/api/drizzle/0077_pilot_activity_plan.sql:44–46` installs the model-specific position guard only `BEFORE INSERT`, while line24 widens the unconditional CHECK from0–3 to0–12. For an existing legacy four-Task plan, changing its last mapping fromposition3 to4 now passes: the new pilot-only UPDATE guard atlines64–80 deliberately ignores legacy rows, and unchanged foreign/unique keys permit that position. Main's prior CHECK rejected the same mutation. The resulting0,1,2,4 mapping makes `ProjectTemplateService.readWithinTransaction` fail its contiguous-position check, rendering preserved legacy provenance unavailable.

  Project/Task PRD §28 explicitly requires: “New source positions and immutable guards must not weaken legacy four-row bounds.” Validate the scoped position invariant on UPDATE too and extend the genuine-upgrade proof to reject an out-of-range UPDATE of an existing legacy mapping; the current migration test checks only an INSERT atposition4.

No other missing/incorrect requirement or unrequested scope expansion was established in this initial review. The inspected implementation preserves the closed pilot1 identity and thirteen literal rows, independent capturedv1/v2 authority, ordinary Task/D4 separation, full-intent atomic/replay ownership, unsupported primary progression/publication, source preview/context retirement and the old four-Task journey, subject to the blocker above.

Limits: read-only static review of the pinned diff, canonical §28/preserved §§24,27, Authorization §8, Activity §7, relevant ADRs and public test implementations. No source edits, test execution, provider trigger, CI monitoring or publication. Root's final-source broader verification and final complete integration gate remain separate and pending; supplied earlier passing results are not independent execution evidence from this reviewer.
