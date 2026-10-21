# Spec review — #733, frozen source checkpoint

Fixed base: `4f693ccb3b09cb173cae578640005dd3ae0b48a6`. No authored commits: complete uncommitted WIP, including new files. Input: `complete-change.patch`, SHA-256 `dc363e28f6be884f0055864b3c70d308d809e0b6d716eea256d1cf1a418f6abe`; all 49 copied source hashes verified. Only the temporary acceptance-startup configuration is excluded.

Authorities: complete #733 body and three comments; canonical Company Ideas intake PRD, authorization/privacy references, AGENTS and issue-execution.

**Source findings: 0 concrete blocking defects; 0 demonstrated scope violations.** The change implements the bounded Idea/disposition aggregate, three independent captured grants, live authorization before replay, per-aggregate revision locking, atomic receipt/restricted-event writes, literal input boundaries, bounded count/page snapshots and nonprojection. The App retires scoped content/intents and aborts competing replies after rejection or authority-generation changes. Existing administration and narration owners carry grant events; private Idea events use separate restricted storage. No approval, conversion, Task creation or new provider is introduced.

**Known incomplete acceptance evidence: 2; delivery remains unqualified.**

1. #733 requires “Registered real App/PostgreSQL acceptance … at desktop1440 and narrow390 … inspect original screenshots.” `apps/web/e2e/ideas.acceptance.spec.ts:58` defines that journey; lines 70–74 retain original screenshots. The supplied evidence manifest contains no successful current desktop/narrow runs or inspected originals. Source inspection cannot establish rendering, keyboard/focus or complete live behavior. Complete these runs and visual inspection before publication.
2. #733 requires “Complete required exact-head CI and the single review round.” The packet is WIP and the complete sensitive integration gate has not run. The owner's local-verification transition is explicit, but Draft #749 is not activated or a qualifying full manifest. Targeted REST27/App19/Activity22, administration2/parser5, migration1/assignment6/registry94 and scoped type/static results must retain their actual source attribution; they cannot establish whole-gate success.

The assignment-only 120-second `beforeAll` adjustment does not change testcase/expect budgets or shared configuration. Earlier failed runs remain disclosed.

Disposition: source-contract review finds no correction to request; two existing evidence prerequisites remain open. This is neither a bot-review round nor approval to merge. No tests, services, source changes or publication performed.
