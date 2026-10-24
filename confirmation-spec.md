# Narrow Spec confirmation — #838

Confirmed clean source `2ad49b9a4f124404ff28397e59f38c54ca4b3b60`, tree `672f38cafb1c12fa94a061e0d495d87eeea7c424`, base `2833f0aad168bd002bc3eba1b4d3dcb8dca69cd6`.

Scope: only `git diff 5fc0e9ce1a1163fdf21ec513c1d04806d4809c35...2ad49b9a4f124404ff28397e59f38c54ca4b3b60`, two files, twelve additions and one deletion. This is the single permitted sensitive confirmation.

**Original P2 blocker resolved; no new blocking finding established within this correction.**

The migration now invokes the scoped position guard `BEFORE INSERT OR UPDATE`. Its existing function reads the proposed row's complete Workspace/Company/Project scope and enforces legacy positions0–3 versus pilot positions0–12. Therefore the widened outer CHECK can no longer admit the reported out-of-range legacy UPDATE. Existing pilot mapping immutability remains independently enforced.

The genuine76→77 test now attempts to move an existing legacy position3 to both4 and12, requires PostgreSQL23514 refusal, and then reopens the same public copied-plan endpoint and compares its result with the preserved pre-upgrade plan. This directly covers the mutation that the original INSERT-only proof missed and the resulting provenance-read regression, satisfying §28's requirement that new guards “must not weaken legacy four-row bounds.”

Limits: static confirmation of this narrow delta and inspection of the supplied test implementation; no edits, suite execution, provider trigger or CI action. Root reports an actual pre-fix RED and affected PostgreSQL GREEN proof; those runs remain root-supplied evidence. Full corrected broader verification and final complete integration remain root-owned and pending. No further independent review is requested.
