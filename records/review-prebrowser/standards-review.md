# Standards review — immutable #733 source input

Status: source review only; browser evidence, complete local integration verification and publication remain pending.

Reviewed the complete 49-file untracked-inclusive patch against `4f693ccb3b09cb173cae578640005dd3ae0b48a6`; authored commit list is empty. Verified patch SHA256 `dc363e28f6be884f0055864b3c70d308d809e0b6d716eea256d1cf1a418f6abe` and every frozen source hash. No source edits or runtime checks were performed by this reviewer.

## Documented standards

One grouped **nonblocking** TypeScript discipline violation: `docs/agents/typescript-discipline.md`, “Use object arguments when parameter ordering is ambiguous or several values share a type.” The new `revokeIdeasReader`, `revokeIdeasRecorder` and `revokeIdeasReviewer` interfaces accept adjacent `workspaceMembershipId: unknown, companyId: unknown` (`apps/api/src/access/company-context-assignment.service.ts:840`, `:870`, `:900`). New private `findIdea` and `receipt` helpers similarly transport multiple positional string identifiers (`apps/api/src/ideas/ideas.service.ts:398`, `:454`). Named object arguments would remove this ambiguity. Existing canonical assignment methods use the same older convention, but that does not constitute a documented exception. Current call sites pass the correct arguments; no acceptance failure, authorization defect or regression is established, so repository review policy makes this follow-up work rather than a merge blocker.

No other material TypeScript discipline violation was found: unknown HTTP/receipt boundaries are validated, captured versions fail closed, disposition results use discriminated unions, and no new unchecked cast or `any` manufactures evidence.

## Structural judgement

No additional actionable structural finding. The 1,840-line new REST suite merits the documented size exception: one real Nest/PostgreSQL bootstrap, clearly separated public contracts and expensive historical migration initialization. Existing large authorization/accountability owners remain canonical; this slice does not justify a parallel permission engine or broad extraction. The feature owner, transaction/receipt boundary and restricted event storage remain explicit.

Counts: **0 blocking findings; 1 grouped nonblocking documented-standard finding; 0 additional smell findings.** This is not final-head or delivery approval.
