# Synthetic AI source and citation preparation kit

**Status:** Non-canonical synthetic qualification inputs  
**Revision:** 1  
**Tracking:** [#989](https://github.com/Prisma-Prim/PRISMA-PRIM-Suite/issues/989), under [AI/Knowledge #57](https://github.com/Prisma-Prim/PRISMA-PRIM-Suite/issues/57)  
**Reading trigger:** prepare a future assisted Analysis or Cited Answer test with inspectable source content.

The [AI and Knowledge Governance PRD](../ai-knowledge-governance-prd.md#9-evaluation)
owns behaviour. This kit supplies fictional content and authored expectations for
its current/obsolete, contradiction, absence, multilingual, access and human-review
cases. It changes no product contract or runtime readiness.

## Contents and boundary

- [Source content](sources.md): literal passages, exact source/version/locator
  identities, simulated admission/status and four synthetic access profiles.
- [Expected cases](cases.md): 22 concrete questions with exact citations or explicit
  insufficiency, prohibited outcomes and separate fictional human dispositions.

Everything is invented for this technical exercise: source texts, titles,
Workspace/Company references, profiles, values, review actors and dates. The
`synthetic-approved` metadata is an authored precondition, never actual Knowledge
Source admission, source ownership, license, permitted provider use or an access
grant. No real Client source, paid Standard, legal clause, Tariff or certification
rule is reproduced. The kit contains no provider call, retriever, model output,
production fixture loader or application integration.

The entire candidate inventory and reference expectations belong to the test
operator. A future runner must supply only permitted content to the capability,
keeping the inaccessible titles, passages and expected answer out of its context.
Otherwise denial/leakage cases would be invalid before the answer is generated.
Local profiles model only these finite tests; they do not define application roles,
actual actors, permission bundles or source-sharing policy.

## Coverage route

| Cases   | Inspectable expectation                                                                                |
| ------- | ------------------------------------------------------------------------------------------------------ |
| K01–K03 | Current exact-version citations with Romanian, Russian and English questions                           |
| K04     | Explicit historical selection, with superseded status visible                                          |
| K05     | Two current conflicting sources; no invented precedence                                                |
| K06–K07 | Missing deadline or unsupported material; no invented answer                                           |
| K08–K10 | Different Company, different Workspace and restricted same-Company source excluded before retrieval    |
| K11–K12 | No capability authority, or permission for a different purpose; no source read                         |
| K13     | Inert source instruction remains data and grants no access authority                                   |
| K14–K17 | Source-supported proposal, additional inference, missing field and contradictory alternatives          |
| K18–K20 | Separately declared fictional human acceptance, correction and rejection with initial values preserved |
| K21     | Source access/current status cannot substitute for admission                                           |
| K22     | One allowed and one forbidden source; forbidden content cannot influence a supported answer            |

## Manual usage

1. Read the selected case and its referenced exact source Versions. Resolve its
   profile, requested purpose, current/historical mode and simulated admission
   before showing any content to a proposed capability. This is manual preparation;
   these files execute no access checks.
2. Inspect only the expected `retrievalRefs` as permitted content for this case.
   Retain exclusions as the operator's separate oracle. In a future authorized
   harness, inspect retrieval decisions as well as final text: a safe-looking
   answer alone cannot prove that forbidden content was never retrieved.
3. Compare a separately captured proposal against required properties and exact
   source/version/locator/quote tuples. Interpret questions in their declared
   language; preserve original-language quotes. An explicit supported fact may
   support an answer while its Analysis field remains an unconfirmed proposal.
4. For K18–K20, apply only the provided fictional human disposition as a declared
   fixture action. Preserve initial proposal, final value when supplied, reason,
   actor and event identity. These are examples, not a real human review or measured
   model accuracy. Do not fabricate an event for other cases.
5. Record future actual observations separately with source/corpus/case Versions
   and method provenance. Keep authored expectations separate from observed output;
   a mismatch is a case result, never a reason to silently rewrite the reference.

For data inspection, each of `sources.md` and `cases.md` contains one complete
`json` fenced block. Parse that block as UTF-8 JSON; the format identifiers are
local to this illustrative kit, not new public runtime schemas. Verify unique
profile and source/version identities, unique locators per Version and case IDs,
all candidate/selection references, quote equality at each cited locator, and the
profile/purpose/admission/mode exclusions. Markdown links and coverage rows provide
the human reading route. Content consistency does not test a future implementation.

## Relationship to offline pilot evaluation

The delivered [offline comparative evaluator](../ai-knowledge-governance-prd.md#17-bounded-offline-comparative-pilot-evaluation--957)
compares independently declared reference and manual/assisted observations. Its
existing mechanics examples deliberately use fictional source references and
metric literals; this kit instead provides actual fictional passage content and
qualitative source/access/disposition expectations.

These kit blocks are **not valid input** to that command's closed cases/runs schemas
and must not be passed unchanged. There is no adapter in this issue. A future
separately authorized adapter or manual recording step would need exact schema
mapping and separately captured observations; source text, access safety, meaning
and multilingual quality cannot be established by literal citation matching alone.
Existing §17 schemas, methodology, metrics and demonstration fixtures stay unchanged.

## Versioning and readiness

Source ID plus Version, locator and corpus revision bind these authored bytes in
Git. Changed passage bytes require a new source Version and corpus revision;
changed expectations require a new case Version and expectation-set revision.
Retain previous revisions through Git history and cite the exact commit when
reusing a fixture. Changing an access/admission precondition also changes the
corpus revision and every affected case Version. Never call revised bytes the
same frozen input.

The kit prepares deterministic examples, not representative first-tenant evidence,
expert ground truth, an observed pilot or a serious-error threshold. Its 22 cases
satisfy no historical real-case count or success target. It neither approves an AI
capability nor changes the [Release 7 readiness gates](../ai-knowledge-governance-prd.md#16-readiness).
Controlled useful questions, governed real-source inventory and permitted uses,
representative evaluation, legal/security/provider review and task-specific
promotion thresholds remain required by the owning PRD. No runtime child is
created or marked ready by this preparation.
