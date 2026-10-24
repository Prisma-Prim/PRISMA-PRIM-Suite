# Narrow Standards confirmation — #838

Reviewed source: `2ad49b9a4f124404ff28397e59f38c54ca4b3b60`  
Tree: `672f38cafb1c12fa94a061e0d495d87eeea7c424`  
Base: `2833f0aad168bd002bc3eba1b4d3dcb8dca69cd6`  
Correction delta only: `5fc0e9ce1a1163fdf21ec513c1d04806d4809c35...2ad49b9a4f124404ff28397e59f38c54ca4b3b60`.

**Original blocker resolved. No new blocking regression established within this correction.**

- `0077_pilot_activity_plan.sql:45` now registers the model-specific position guard for both INSERT and UPDATE. The existing function resolves the instance through NEW Workspace/Company/Project scope, so a legacy destination retains the0..3 bound on modifications as well as new links. Pilot immutability and scope FKs remain unchanged.
- `project-pilot-plan.migration.test.ts:175` adds genuine-upgrade assertions moving an existing legacy position3 to4 and12. Each must fail with23514; the subsequent public copied-plan read must equal its preserved source. A missing target row or a permissive UPDATE would fail these assertions.

The two-file correction introduces no additional TypeScript boundary, authority, tenancy or structural concern. The actual checkout was clean and matched the pinned source/tree.

Limits: static confirmation and inspection of the supplied focused RED/GREEN test change. No suites run, repository source edits, CI/provider calls or publication performed. Root's affected24-test passing result is supplied evidence; corrected broader verification and final integration CI remain pending. This is the one permitted sensitive confirmation, not another full review round.
