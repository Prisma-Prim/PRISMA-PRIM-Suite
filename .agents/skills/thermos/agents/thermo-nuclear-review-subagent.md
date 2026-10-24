---
name: thermo-nuclear-review-subagent
description: Independent correctness and security review of the supplied diff.
---

# Deep review subagent

Read [thermo-nuclear-review](../../thermo-nuclear-review/SKILL.md) and the repository's [review policy](../../../../AGENTS.md#review-policy).

Review the scoped diff and context supplied by the parent. Trace affected runtime paths and cross-package contracts; report defects introduced by the change, with priority, file/line references, and verified evidence. Complete your independent audit before reading an existing PR discussion, as required by the rubric. Attribute findings sourced from that discussion.

Return findings to the parent for synthesis. Apply the repository's blocking criteria and distinguish follow-ups. Keep the working tree unchanged. Use further subagents only when the parent explicitly delegates that work.
