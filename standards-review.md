# Independent Standards review — #838

Reviewed source: `5fc0e9ce1a1163fdf21ec513c1d04806d4809c35`  
Base: `2833f0aad168bd002bc3eba1b4d3dcb8dca69cd6`  
Tree: `54a34e0905a3accae639352317abeffba5004674`

Disposition: **one blocking data-integrity finding (P2)**.

- **Preserve the legacy position bound on UPDATE as well as INSERT.** `apps/api/drizzle/0077_pilot_activity_plan.sql:24` replaces the old `0..3` CHECK with `0..12`, but the model-specific guard is registered only `BEFORE INSERT` at lines44–46. The separate UPDATE/DELETE guard at lines64–80 protects only pilot mappings. Therefore an existing legacy mapping can now be moved to an unused position4–12 with `UPDATE project_template_task_copies SET position=4 WHERE ...`; its scope FKs and uniqueness remain satisfied. Main rejected this statement. This violates Project/Task §28's explicit requirement that new guards “must not weaken legacy four-row bounds” and the repository's data-integrity/regression blocking rule (`AGENTS.md`, Review policy). Apply the model-specific bound to updates, including moves between instances, and add an UPDATE regression assertion to the genuine-upgrade seam. The existing migration proof checks only an INSERT at position4.

No additional material TypeScript-discipline violation or baseline smell established. Closed model-key variants, validated unknown boundaries, named new catalogue arguments and caller-owned transactions preserve the relevant module owners. The captured-v1 permission set is unchanged; v2 recognition stays explicit across API, administration, Activity and browser projections. Generated snapshot comparison changes only the three intended tables. Existing large owner files remain cohesive within this slice; line count alone does not justify expansion.

Limits: static read-only review of the pinned three-dot diff, authorities and public test implementations. No suite execution, source edit, commit, provider trigger, publication or CI monitoring. Root's supplied targeted results were inspected as evidence; pending broader/final verification is not represented as passed here.
