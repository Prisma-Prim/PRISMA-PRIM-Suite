# Handoff — Assist Iurie Popescu With the PRISMA-PRIM Business Interview

**Version:** 1.1  
**Audience:** the Codex agent assisting Iurie Popescu  
**Operating mode:** read-only business interview and evidence recovery support  
**Companion questionnaire:** `docs/product/iurie-business-question-bank-ro.md`  
**Coverage authority:** `docs/product/iurie-business-answer-coverage.md`

## 1. Your mandate

Help Iurie explain the real work of PRISMA-PRIM, BIC and ECG and the user-visible results the application should enable. Preserve his answers faithfully and keep technical/product-design decisions with Dan and his agents.

Your job is to:

1. read the repository authorities listed below before asking anything;
2. check the audited coverage matrix and already collected evidence before every new follow-up;
3. explain business questions to Iurie in plain Romanian, or Russian if he prefers;
4. replace internal product terminology with recognizable work situations;
5. ask only short targeted follow-ups when a material business gap actually remains;
6. request concrete examples, exceptions, responsible people and safe evidence descriptions;
7. record Iurie's answers faithfully, including uncertainty, contradiction and delegated decisions;
8. preserve evidence provenance so Dan and his agents can reconcile it into canonical PRDs and decisions.

Your mandate ends with structured business evidence and an evidence index.

You must not:

- implement code, open or modify pull requests, create implementation tickets or change repository files other than publishing authorized evidence comments in issue #81;
- ask Iurie to design entities, APIs, database schemas, permission mechanisms, provider scopes, synchronization, encryption or infrastructure;
- ask Iurie to approve the repository's internal model or choose among technical solutions;
- infer legal, accounting, accreditation or certification authority from a Company name;
- convert an incomplete answer into an invented business rule;
- treat currently implemented behaviour as proof of desired future behaviour;
- reconstruct missing evidence from memory, Sarcina text or agent interpretation;
- remap independently numbered evidence to official `Sxx-Qxx` IDs on your own;
- commit raw interview notes, personal data, Client data, secrets or confidential evidence to the repository.

Dan and his agents own PRDs, product modelling, architecture, technical research, semantic reconciliation, implementation, testing and delivery. Iurie owns the description of current business reality and the result he wants the application to produce.

## 2. People and decision authority

| Person                                               | Role in this interview                   | What the person decides                                                                                     |
| ---------------------------------------------------- | ---------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Iurie Popescu                                        | Founder, Product Owner and domain expert | Current practice, desired user-visible behaviour, real roles, exceptions, priorities and available evidence |
| Dan Popescu                                          | Product and engineering lead             | Product synthesis, PRDs, scope, technical design, delivery order and acceptance criteria                    |
| Dan's agents                                         | Product/engineering collaborators        | Reconciliation, technical research, PRD drafting, implementation and verification with Dan                  |
| Iurie's agent                                        | Interview interpreter and recorder       | How to explain questions, what narrow follow-up is needed and how to structure Iurie's answers              |
| Valentin / administrators / accountant / specialists | Evidence owners when relevant            | Facts about systems or regulated practice that Iurie cannot reliably confirm                                |

`Nu știu` is a valid answer. Record who probably knows or what evidence could resolve it. Do not pressure Iurie into making a technical or regulated guess.

## 3. Read these repository sources before interviewing

Read them in this order. Do not rely on README or existing code alone.

| Order | Source | How to use it |
| --- | --- | --- |
| 1 | `AGENTS.md` | Understand repository boundaries, decision authority and the difference between evidence, product authority and implementation. Ignore the delivery workflow because this mandate is read-only. |
| 2 | `docs/product/iurie-business-answer-coverage.md` | **Primary starting point for any new question.** It contains the complete 278-question semantic audit, blocker delta, decision-sufficiency protocol and prioritized completion packages. |
| 3 | `docs/product/evidence/iurie-business-interview-issue-81-comments.jsonl` | Fixed verbatim snapshot of the first 104 source comments. Use it only for provenance and exact wording; it is evidence-only and non-canonical. |
| 4 | `docs/product/iurie-business-question-bank-ro.md` | Official Romanian question bank. It is a coverage instrument, not a script. |
| 5 | `docs/product/consolidated-product-decision-record.md` | Approved reconciliation rationale. Do not silently override its approved decisions with raw evidence. |
| 6 | `CONTEXT.md` | Current canonical vocabulary. Use it to understand terms, not to make Iurie validate technical modelling. |
| 7 | `docs/product/prd-index.md` and relevant PRDs | PRD navigation and current product authorities. Read the owning PRD when a follow-up is intended to close one concrete blocker. |
| 8 | `README.md`, `docs/adr/`, `apps/api/`, `apps/web/`, `/ui-baseline` | Technical/current-state context only. Existing code or mockups do not prove desired future behaviour. |

Important reconciliation facts:

- the delivered code is still a foundation, not the complete operational product;
- one Workspace is the tenant boundary and Companies operate inside it;
- a shared Client dossier does not make Company-confidential activity visible to everyone;
- structured, auditable operations come before AI automation;
- the approved decision register is `DEC-001` through `DEC-212`;
- evidence may configure or refine a product decision, but does not become a product rule by itself.

## 4. Current evidence boundary after PR #111

The semantic audit is complete for all **278 official questions** against the fixed corpus of **104 issue #81 comments** at source boundary `2026-08-18T20:40:09Z`.

Current audited totals are:

- `36 Full`;
- `118 Partial`;
- `1 Not covered`;
- `123 Not mapped`.

These are evidence classifications only. They do not approve product readiness, permissions, legal classification, enforcement behaviour or implementation scope.

The currently addressable independent sequence reaches item **525**. No atomic source is present in issue #81 or the fixed snapshot for the previously referenced items **526–765**.

### 4.1 Immediate operating priority

Before asking Iurie any new question:

1. check whether your own conversation/history/context still contains the original material numbered `526–765`;
2. if it exists, recover it faithfully rather than interviewing Iurie again;
3. preserve original numbering, question/proposition, Iurie answer, examples, exceptions, uncertainty and evidence authority;
4. publish recovered evidence in issue #81 as structured evidence comments;
5. do **not** remap it to official `Sxx-Qxx` IDs, modify PRDs or infer product rules;
6. stop after recovery and hand the material back to Dan for semantic reconciliation.

If `526–765` cannot be recovered, state that clearly. Do not reconstruct it from memory and do not ask Iurie to repeat hundreds of answers merely to recreate provenance.

No general questionnaire may restart while this recovery attempt is unresolved.

## 5. How to use code without confusing Iurie

The code may answer what exists today. It cannot answer what Iurie wants the future application to do.

Before asking Iurie a question:

1. check the audited coverage matrix and cited source evidence;
2. check the consolidated record and owning PRD;
3. decide whether the missing component is actually material to a current product decision;
4. use code only to distinguish current implementation from planned behaviour;
5. remove implementation details from the wording;
6. explain why the answer matters in terms of work, risk or a visible result.

If code and Iurie's desired behaviour differ, record them separately:

- **Current implementation observed**;
- **Desired business behaviour**;
- **Gap for Dan**, without prescribing the technical fix.

## 6. Decide whether a follow-up is actually needed

Question-bank completeness is an audit measure, not a requirement to ask every question mechanically.

For every missing component choose one disposition:

- `SUFFICIENT` — current evidence is enough for the intended decision;
- `SUFFICIENT_REVERSIBLE_ASSUMPTION` — a low-risk reversible choice can proceed with an explicit assumption and confidence;
- `INTERVIEWER_CLARIFICATION` — clarify wording, split a compound question or request an example;
- `IURIE_FOLLOW_UP_REQUIRED` — ask a targeted question because the gap affects a business rule, exception, authorization, legal/financial effect, blocking automation or a difficult-to-reverse decision;
- `DAN_TECHNICAL_DECISION` — route product-design or technical mechanism decisions to Dan and the technical agents.

Never ask the same broad question again merely because its official row is `Partial` or `Not mapped`.

## 7. Prioritized completion packages

Use these only **after** the `526–765` recovery attempt is closed and Dan has reconciled any recovered material.

### P0 — Cross-Company confidentiality boundary

Already understood: ordinary Company users must not automatically see another Company's operational activity.

Minimal Romanian follow-up:

> „Pentru un utilizator care lucrează numai la PRISMA-PRIM, ce categorii concrete de informații despre activitatea BIC trebuie să fie complet invizibile și există vreo excepție?”

Neutral examples if needed: Contract, preț, factură/plată, audit, certificat, numele Proiectului. Ask Iurie to correct the list rather than accept it wholesale.

Closure condition: identify hidden categories, whether harmless shared metadata remains visible, and who may authorize an exception.

### P0 — Business actions requiring attributable history

Already understood: technical intervention and changes must retain actor and time.

Minimal Romanian follow-up:

> „În afară de intervențiile tehnice, care acțiuni de business trebuie să păstreze obligatoriu cine le-a făcut, în ce dosar și când?”

Neutral examples if needed: Offer/Contract approval, price change, official Document correction, Project closure, access change.

Closure condition: identify material business action families and actions that explicitly do not require business audit history.

### P0 — Initial Project categories

Already understood: each real job is tracked as its own Project record.

Minimal Romanian follow-up:

> „Care sunt tipurile de proiect pe care trebuie să le poată crea prima versiune pentru PRISMA-PRIM, BIC și ECG?”

Ask for current team terminology and one representative anonymized case per category. Do not propose a final taxonomy.

Closure condition: bounded first-release list, responsible Company and one representative example per category.

### P1 — Official numbering lifecycle

Already understood: Contracts, reports, Certificates and minutes may require governed unique numbering.

Minimal Romanian follow-up:

> „Pentru fiecare document numerotat, în ce moment se atribuie numărul și cum se marchează un număr rezervat care nu mai este folosit?”

Closure condition: assignment moment, disposition, reuse policy and required reason/history.

Do not invent additional completion packages on your own when the matrix or Dan has not identified a material blocker.

## 8. Language and follow-up style

- Start in Romanian; switch to Russian only if Iurie asks or comprehension improves.
- Ask one targeted question at a time unless Iurie explicitly prefers a written batch.
- Begin by reminding him what is already understood so he does not repeat himself.
- Summarize the answer in plain language and ask him to correct the summary.
- Stop when concentration or evidence availability drops.

Prefer recognizable situations. Avoid internal terms such as `Opportunity`, `DocumentVersion`, OAuth scopes, database cardinality or RBAC matrices unless they are first translated into a concrete work situation.

## 9. Evidence and safety

Ask for an evidence description first: document type, date, owner, Company, what it proves and whether an anonymized extract can be shared.

Never ask Iurie to paste or send:

- passwords, recovery codes, API keys, OAuth tokens or session cookies;
- private signing keys, fiscal certificates or bank credentials;
- unrestricted mailboxes, Drive exports, Client archives or personnel files;
- complete licensed Standards or confidential audit evidence;
- unnecessary sensitive personal, banking or Client data.

When an example is useful, ask for an anonymized or synthetic copy. Record evidence availability and owner rather than collecting sensitive material in the transcript.

## 10. Evidence authority

Distinguish evidence authority in every record:

- `DIRECT_IURIE` — direct or faithfully paraphrased Iurie answer;
- `AGENT_PROPOSAL_ACCEPTED` — the agent proposed a concrete formulation and Iurie explicitly accepted it;
- `AGENT_INTERPRETATION` — analysis by the interviewer without Iurie's explicit acceptance; never a business requirement;
- `DELEGATED_TO_DAN_AGENT` — Iurie delegated a product or technical decision; it remains undecided behaviour until the responsible authority is updated.

Never resolve contradiction by choosing the answer that is more convenient.

## 11. Required record for a new targeted question

Use this structure where applicable:

```yaml
question_id: S00-Q01
question_ro: 'Exact Romanian question asked'
answer_ro: "Iurie's answer, faithfully summarized"
evidence_authority: DIRECT_IURIE
source_declared_status: CONFIRMED
semantic_coverage: FULL
confidence: HIGH
current_practice: 'What happens today'
desired_behaviour: 'What Iurie wants the application to enable'
actors_and_approvals: []
company_scope: []
normal_case: null
exceptions: []
example: null
evidence:
  available: false
  owner: null
  safe_extract_possible: false
open_points: []
follow_up_owner: null
```

Use `null` or an empty list when a field does not apply. Do not invent content to fill the template.

For independently numbered recovered evidence, preserve its original number and wording instead of inventing an official question ID.

## 12. Session handoff to Dan

At the end of any authorized new session, provide:

1. confirmed business evidence;
2. desired application behaviour in Iurie's words;
3. roles and visibility;
4. exceptions and risks;
5. anonymized examples;
6. evidence index;
7. unknowns and contradictions;
8. questions not asked or deferred;
9. product gaps observed without proposing implementation;
10. the closure status of the specific completion package.

Do not write a PRD, select architecture or convert the answer into an implementation ticket.

## 13. Lightweight coverage check

If an official question is narrowed or split, record:

1. what was asked;
2. what remains not asked or deferred;
3. whether another follow-up is genuinely needed now.

After a short answer or `Da` to a compound formulation, check material components and ask at most one neutral follow-up when a currently necessary component is missing. Do not mark the whole official ID resolved unless all material components are answered or explicitly out of scope.

Optimize for decision usefulness and minimal burden on Iurie.

## 14. Opening message for a future authorized follow-up

Do not use this message until the `526–765` recovery attempt is closed and Dan has authorized a targeted completion package.

> Bună ziua, Iurie. Avem deja majoritatea informațiilor pe care ni le-ați oferit și nu reluăm chestionarul. A rămas un singur punct concret care blochează o decizie de produs. Vă voi spune mai întâi ce am înțeles deja, apoi vă voi adresa o întrebare scurtă despre partea care lipsește. Nu trebuie să decideți soluția tehnică.
