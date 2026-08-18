# Repository knowledge and deliverable system

**Status:** Approved process  
**Version:** 1.0  
**Owner:** Dan Popescu  
**Applies to:** repository documentation, fresh-context agent work, reconciliation artifacts and external deliverables

## 1. Purpose and boundary

The repository must give a fresh agent enough durable context to execute one assigned issue without relying on private conversation history. It must also keep the reading route bounded so documentation supports delivery instead of becoming a parallel project.

This document owns discovery, storage and external-deliverable rules. The [Specification and Vertical Ticketing Standard](../product/specification-and-ticketing-standard.md) remains the authority for the product hierarchy and issue-readiness gates. [AI agent issue execution](issue-execution.md) remains the authority for executing one issue.

## 2. Core rules

1. **One owner.** Each fact has one authoritative artifact. Other artifacts link to it and state only their local consequence.
2. **Repository first.** Durable internal knowledge lives as reviewable text in GitHub. Private conversation is input until normalized into its owning artifact.
3. **Context-free issue.** An assigned issue supplies the observable outcome, blockers, exclusions, acceptance criteria and pointers needed by a fresh agent.
4. **Targeted reading.** An agent follows the assigned issue to the owning authorities and does not read unrelated documentation.
5. **Evidence, not declarations.** Implemented status requires a link to code, a public test seam, CI, a demonstration or another verifiable result.
6. **Prune with change.** A change that supersedes an instruction, status or pointer updates or removes the stale material in the same delivery slice.

## 3. Authority map

| Information | Authoritative owner |
| --- | --- |
| Always-applicable agent and engineering rules | `AGENTS.md` |
| Canonical domain vocabulary | `CONTEXT.md` |
| Approved observable product behaviour | Owning product PRD |
| Reconciliation rationale and approved product decisions | Consolidated product decision record |
| Durable, surprising and costly-to-reverse technical choice | ADR |
| Work scope, blockers, acceptance and current delivery state | GitHub issue |
| Implemented behaviour | Code through its stable public boundary |
| Verification | Tests, CI and deterministic demonstration evidence |
| Delivered diff, checks, risks and retrospective | Pull request |
| External email document | Generated snapshot of named repository authorities |

The environment is also an authority. Prefer package scripts, configuration and tool help over prose that merely copies discoverable commands or values.

## 4. Fresh-context reading route

Before editing, an agent:

1. reads every applicable `AGENTS.md`;
2. reads the complete assigned issue and comments, then confirms every blocker is closed;
3. follows only the issue's pointers to its owning PRD, cross-cutting PRDs, decision record sections, ADRs and evidence;
4. reads `CONTEXT.md` when domain language or business boundaries are involved;
5. inspects the current implementation and highest stable public test seam;
6. records the observable outcome, exclusions, authority owners, first test seam and any unresolved blocker in the execution note.

This route is complete when the agent can name the behaviour to deliver, the artifact that owns it, the decisions it may take, the decisions it must escalate, the proof required and the deliberately excluded work. If any of those is materially ambiguous, the issue is not implementation-ready.

## 5. Where new information goes

| Information produced | Destination |
| --- | --- |
| Raw business answer or source evidence | Evidence issue or controlled source referenced by the coverage matrix |
| Candidate interpretation or cross-source conflict | Clearly marked non-canonical reconciliation artifact |
| Approved business rule | Owning PRD and, when needed, `CONTEXT.md` |
| Approved technical decision | Code/configuration or ADR according to reversibility and cost |
| Delivery work and blockers | GitHub issue |
| Large requirement/evidence matrix | CSV plus a short Markdown guide when explanation is needed |
| Implementation proof | Tests, CI artifacts, PR body and linked demonstrations |
| Report intended for email | DOCX generated from named repository sources and revision |

Reconciliation artifacts preserve provenance and comparisons. They do not become a second product specification. Each normalized decision moves into its owning PRD, ADR, context or issue, while the reconciliation artifact retains the source mapping and resolution history.

## 6. Internal and external deliverables

Markdown in GitHub is the default durable source. Use CSV for large exact mappings that are easier to review or process as rows.

Create DOCX only when an external recipient or formal email workflow needs it. The DOCX must identify:

- its purpose and recipient;
- generation date and document version;
- the canonical repository files used;
- the source commit or pull request;
- whether it is a proposal, review copy or approved snapshot.

The repository source remains authoritative after the DOCX is sent. A later correction updates the repository first and generates a new snapshot. Generated DOCX binaries are not committed by default; commit one only when an issue explicitly requires the binary itself to be distributed from the repository. Real Client data, secrets and uncontrolled confidential sources never enter Git.

## 7. Documentation economy

Before creating a file, identify the existing owner. Update that owner when possible.

Create a new document only when the information has a distinct authority or reading trigger and will serve more than one delivery step. Split a document only when separate audiences or triggers would otherwise force unrelated agents to read it.

Every durable document declares a useful status such as `Draft`, `Approved`, `Non-canonical` or `Superseded`. A superseded document names its successor. Git history replaces archived copies such as `final-v2` or `latest-final`.

Do not create:

- a second handbook that restates `AGENTS.md`;
- one document per module when an owning PRD already exists;
- tracker bodies that copy their PRD;
- prose inventories of files, scripts or settings that an agent can inspect directly;
- generated reports presented as independent authorities.

## 8. Change and review rule

Documentation follows the same one-issue delivery discipline as code. A focused documentation PR names the owner being changed, preserves links from entry points, removes stale duplicates, and reviews the final diff first against repository Standards and then against its originating issue.

The minimum verification for a documentation-only change is the repository formatting check plus link and pointer inspection for every changed authority. Additional checks run when scripts, configuration or generated artifacts change.
