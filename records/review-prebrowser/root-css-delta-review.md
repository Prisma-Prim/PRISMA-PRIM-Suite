Status: prepublication correction review; real browser confirmation pending.

Root read the exact ideas-select-css-fix.patch after the real two-project run failed the unchanged shared Select appearance assertions. The correction changes only four Ideas-owned button selectors (base, hover, focus-visible and disabled), excluding the canonical shared-select trigger and option classes through :not(:where(...)). No declaration, shared Select, test helper, assertion or deadline changes.

Standards: no new blocking issue identified in this bounded delta. The zero-specificity exclusion preserves specificity for ordinary Ideas buttons and leaves shared Select styling with its canonical owner.

Spec: the correction addresses the observed desktop padding-right12px versus16px and narrow min-height48px versus44px mismatch, including the same override pattern for options/focus/disabled. The original design assertions remain the acceptance proof; both registered projects still require a successful current run.

Root inspected four unedited originals from the failed run: desktop/narrow failure captures and desktop/narrow full-page validation captures. The Ideas subtree uses the accepted violet/yellow direction, styled controls/error notices and wrapping of long mixed-language text at390px. No additional blocking defect in that subtree was established from those views. They do not establish the complete defer/reject/history journey or final visual approval.

API compilation and outputs may be reused only after explicit unchanged API/shared input, environment, dependency and output proof. The corrected web sources require a real new web build and a new frozen provenance packet; original manifest A472 and red evidence remain immutable. This review does not qualify a merge, replace the full integration gate or count as another automated review round.
