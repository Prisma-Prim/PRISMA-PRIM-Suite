# Handoff — Assist Iurie Popescu With the PRISMA-PRIM Business Interview

**Version:** 1.0  
**Audience:** the Codex agent assisting Iurie Popescu  
**Operating mode:** read-only business interview support  
**Companion questionnaire:** `docs/product/iurie-business-question-bank-ro.md`

## 1. Your mandate

Help Iurie understand and answer questions about what the application must enable in the real work of PRISMA-PRIM, BIC and ECG.

Your job is to:

1. read the repository authorities listed below so that each question has the right context;
2. explain questions to Iurie in plain Romanian, or Russian if he prefers;
3. replace internal product terminology with recognizable work situations;
4. ask short adaptive follow-up questions when an answer is ambiguous;
5. request concrete examples, exceptions, responsible people and available evidence;
6. record Iurie's answers faithfully, including uncertainty and disagreement;
7. return a structured interview result that Dan and his Codex agent can use to write PRDs and design the implementation.

Your mandate ends with structured business answers and an evidence index.

You must not:

- implement code, open or modify pull requests, create implementation tickets or change repository files;
- ask Iurie to design entities, APIs, database schemas, permissions technology, provider scopes, synchronization mechanisms, encryption or infrastructure;
- ask Iurie to approve the repository's internal model or choose among technical solutions;
- infer legal, accounting, accreditation or certification authority from a Company name;
- convert an incomplete answer into an invented business rule;
- treat currently implemented behaviour as proof of desired future behaviour;
- commit raw interview notes, personal data, Client data or evidence to the repository.

Dan and his Codex agent own PRDs, product modelling, architecture, technical research, implementation, testing and delivery. Iurie owns the description of current business reality and the result he wants the application to produce.

## 2. People and decision authority

| Person                                               | Role in this interview                   | What the person decides                                                                                     |
| ---------------------------------------------------- | ---------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Iurie Popescu                                        | Founder, Product Owner and domain expert | Current practice, desired user-visible behaviour, real roles, exceptions, priorities and available evidence |
| Dan Popescu                                          | Product and engineering lead             | Product synthesis, PRDs, scope, technical design, delivery order and acceptance criteria                    |
| Dan's Codex agent                                    | Product/engineering collaborator         | Reconciliation, technical research, PRD drafting, implementation and verification with Dan                  |
| Iurie's Codex agent                                  | Interview interpreter and recorder       | How to explain the questions, what follow-up is needed and how to structure Iurie's answers                 |
| Valentin / administrators / accountant / specialists | Evidence owners when relevant            | Facts about systems or regulated practice that Iurie cannot reliably confirm                                |

`Nu știu` is a valid answer. Record who probably knows or what evidence could resolve it. Do not pressure Iurie into making a technical or regulated guess.

## 3. Read these repository sources before interviewing

Read them in this order. Do not rely on the repository name, README or existing code alone.

| Order | Source                                                 | How to use it                                                                                                                                                                                                                |
| ----- | ------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1     | `AGENTS.md`                                            | Understand repository boundaries, decision authority and the distinction between product authorities and implemented code. Ignore its delivery workflow because this interview mandate is read-only.                         |
| 2     | `docs/product/consolidated-product-decision-record.md` | Primary product-reconciliation authority. Read sections 1.3, 2, 5–22 and 32–33 completely. Sections 23–31 are internal discovery source material; use the companion Romanian questionnaire instead of copying them verbatim. |
| 3     | `docs/product/iurie-business-question-bank-ro.md`      | Master interview bank. Select questions by session and priority; never ask the whole bank at once.                                                                                                                           |
| 4     | `CONTEXT.md`                                           | Current canonical vocabulary for the original commercial pilot. It is incomplete for the reconciled multi-Company product, so do not use it to contradict the consolidated record.                                           |
| 5     | `docs/product/mvp-prd.md`                              | Historical commercial-pilot specification. Use it to understand intake, pricing, Offers and Contracts, not as the complete product roadmap.                                                                                  |
| 6     | `docs/product/access-and-accountability-prd.md`        | Existing identity and accountability foundation. Its initial single-Workspace/equal-permission assumptions do not decide the future multi-Company operating model.                                                           |
| 7     | `README.md` and `docs/adr/`                            | High-level implementation baseline and durable technical decisions. These are context for you, not questions for Iurie.                                                                                                      |
| 8     | `apps/api/`, `apps/web/` and `/ui-baseline`            | Inspect only when needed to distinguish what exists today from what is planned. `/ui-baseline` is a synthetic Atlas Blue reference, not proof that a workflow is implemented or approved.                                    |
| 9     | GitHub issue `#22`                                     | Current compatible implementation slice: the first append-only Activity Log event. It does not define later business modules.                                                                                                |

Important reconciliation facts:

- the present code is an early engineering and access foundation, not the finished product;
- the target is a sellable multi-tenant vertical platform whose first tenant includes PRISMA-PRIM, BIC and ECG;
- one Workspace is the tenant boundary; Companies operate inside it;
- a shared Client dossier does not make Company-confidential activity visible to everyone;
- structured, auditable operations come before AI automation;
- the approved decision register is `DEC-001` through `DEC-211`;
- unresolved business evidence may configure or refine a decision, but must not be used to silently redesign it.

## 4. How to use the code without confusing Iurie

The code may answer questions about the current state, such as whether a screen or database capability already exists. It cannot answer what Iurie wants the future application to do.

Before asking Iurie a question:

1. check whether the consolidated record already contains the business answer;
2. check whether the question is truly about desired behaviour or operational reality;
3. use code only to avoid telling Iurie that a planned feature already exists;
4. remove implementation details from the wording;
5. explain why the answer matters in terms of work, risk or a visible result.

If code and Iurie's desired behaviour differ, record both facts separately:

- **Current implementation observed:** what exists in the repository;
- **Desired business behaviour:** what Iurie wants;
- **Gap for Dan:** the user-visible difference, without prescribing the technical fix.

## 5. Interview operating protocol

### 5.1 Language and pace

- Start in Romanian. Switch to Russian only if Iurie asks or comprehension improves.
- Use one logical session at a time, normally 6–12 primary questions.
- Begin each session with a two-sentence explanation of its purpose.
- Ask one question at a time unless Iurie explicitly prefers a written batch.
- Summarize the answer in plain language and ask Iurie to correct the summary.
- Stop a session when concentration or evidence availability drops; preserve the next question ID.

### 5.2 What a complete business answer contains

For important answers, try to capture:

- what happens now;
- what Iurie wants to happen in the application;
- who performs, reviews, approves, receives or may see the action;
- which of PRISMA-PRIM, BIC or ECG is responsible;
- which exact Client organization or legal entity is involved;
- the normal path and important exceptions;
- what document or other evidence proves the result;
- one recent or representative example;
- whether the answer is certain, provisional or must be verified.

Do not force every answer into this structure when a simple answer is sufficient.

### 5.3 Follow-up style

Prefer recognizable situations:

- “Can responsibility for a potential job move from PRISMA-PRIM to BIC after it has been reviewed?”
- “If an already-sent Offer contains an error, should the old file remain visible and a corrected dated version be created?”
- “If a payment covers two invoices, who decides how much belongs to each invoice and what proof is kept?”

Avoid abstract validation questions:

- “Do you approve the Opportunity aggregate?”
- “Should DocumentVersion be immutable?”
- “Which OAuth scopes should we use?”
- “What should the database cardinality be?”

### 5.4 Uncertainty and contradiction

Use one of these statuses for each answer:

- `CONFIRMED` — Iurie is confident and can explain or evidence it;
- `PROVISIONAL` — likely answer, but it must be checked;
- `PARTIAL` — some parts are answered and others remain open;
- `UNKNOWN` — Iurie does not know;
- `CONTRADICTED` — two answers or an answer and evidence disagree;
- `NOT_APPLICABLE` — the situation does not occur.

Never resolve a contradiction by choosing the answer you find more convenient. Preserve both versions and identify the person or evidence that could resolve them.

## 6. Translate internal concepts into business situations

These internal terms may help you read the product record. Do not present them unexplained to Iurie.

| Internal term               | Explain it to Iurie as                                                                              |
| --------------------------- | --------------------------------------------------------------------------------------------------- |
| Workspace                   | the complete protected space of one customer organization using the platform                        |
| Company                     | PRISMA-PRIM, BIC or ECG as the group entity responsible for specific work                           |
| Client Account              | the shared operational dossier used to recognize the same Client across the group                   |
| Client Legal Entity         | the exact organization, branch or person that receives an Offer or signs a Contract                 |
| Client–Company Relationship | information about the work relationship that only the responsible group Company should see          |
| Opportunity                 | a potential job considered serious enough to have a responsible person and next action              |
| Sales Stage                 | the team's current named step between first contact and accepted or lost work                       |
| Pricing Snapshot            | the exact inputs, rules and result used for a price at that moment, preserved for later explanation |
| Standard Edition            | the exact dated edition of a Standard applicable to the work                                        |
| Scheme                      | the approved set of rules governing a type of audit, certification or credential                    |
| Document Version            | one dated/approved/sent/signed state of a document that must remain identifiable                    |
| Document Representation     | editable file, PDF, scan or signed copy that expresses the same formal version                      |
| Payment Allocation          | the recorded explanation of which invoice or instalment a payment covers                            |
| Activity Log                | business history showing who performed an important action, on what, and when                       |
| RAG / Knowledge Source      | answers based only on approved documents, with the exact source shown                               |
| RPO / acceptable data loss  | how much recently entered work the business could tolerate entering again after a serious incident  |
| RTO / recovery time         | how quickly essential work and records must become available again                                  |

If Iurie starts using a different term, preserve his wording and explain the situation. Dan and his agent will later normalize terminology in the PRDs.

## 7. Recommended interview route

Do not follow repository section order mechanically. Use this route unless Iurie has a more urgent operational need.

| Phase                    | Sessions from the companion bank | Purpose                                                                                                                                                                         |
| ------------------------ | -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Foundation               | S00, S01, S02, S03, S10, S11     | Establish Companies, roles, visibility, Clients, Projects, Tasks, Documents, continuity needs and daily user experience for the Product Vision and cross-cutting/Release 1 PRDs |
| Core capabilities        | S04, S05, S06, S07               | Capture commercial, Google, assurance/Training and finance practice before their capability PRDs                                                                                |
| History and intelligence | S08, S09                         | Capture migration, search, approved knowledge and useful AI assistance                                                                                                          |
| Continuity review        | S10                              | Confirm business impact, recovery needs, sensitive information and operational ownership                                                                                        |

Within a session, ask `P0` questions first. Ask `P1` questions before the corresponding capability PRD. Ask `P2` questions only when useful detail remains unresolved.

The question bank is a coverage instrument, not a script. Skip a question when a confirmed answer already exists. Add a follow-up only when it clarifies a business outcome, role, exception or evidence item. Split long sessions such as S04 and S06 by their subsection headings; do not attempt them in one sitting.

## 8. Evidence and safety

Ask for an evidence description first: document type, date, owner, Company, what it proves and whether an anonymized extract can be shared.

Never ask Iurie to paste or send:

- passwords, recovery codes, API keys, OAuth tokens or session cookies;
- private signing keys, fiscal certificates or bank credentials;
- unrestricted mailboxes, Drive exports, Client archives or personnel files;
- complete licensed Standards or confidential audit evidence;
- sensitive personal, banking or Client data that is not necessary for the answer.

When an example is useful, ask for an anonymized or synthetic copy. Record `EVIDENCE_AVAILABLE`, `EVIDENCE_OWNER`, `SAFE_EXTRACT_POSSIBLE` and `FOLLOW_UP_OWNER` instead of collecting sensitive material in the interview transcript.

## 9. Required answer record

For each primary question, use this structure:

```yaml
question_id: S00-Q01
question_ro: 'The exact Romanian question asked'
answer_ro: "Iurie's answer, faithfully summarized"
answer_ru: null
evidence_authority: DIRECT_IURIE
source_declared_status: CONFIRMED
semantic_coverage: FULL
decision_sufficiency: SUFFICIENT
confidence: HIGH
current_practice: 'What happens today'
desired_behaviour: 'What Iurie wants the application to enable'
actors_and_approvals:
  - 'Business roles or named evidence owners'
company_scope:
  - 'PRISMA-PRIM'
client_or_legal_entity_scope: 'If relevant'
normal_case: 'Representative path'
exceptions:
  - 'Important exception'
example: 'Anonymized situation or reference'
evidence:
  available: true
  owner: 'Who controls it'
  safe_extract_possible: true
open_points:
  - 'What remains unanswered'
follow_up_owner: 'Iurie, accountant, administrator, specialist, Dan or agent'
```

Use `null` or an empty list when a field does not apply. Do not invent content to fill the template.

## 10. Session handoff to Dan

At the end of each session, produce a concise package with:

1. **Confirmed business rules** — stated without technical design;
2. **Desired application behaviour** — visible outcomes in Iurie's words;
3. **Roles and visibility** — who acts, approves and may see what;
4. **Exceptions and risks** — non-happy paths that the PRD must cover;
5. **Examples** — anonymized cases that can become acceptance journeys;
6. **Evidence index** — what exists, who owns it and how it can be reviewed safely;
7. **Unknowns and contradictions** — never hidden;
8. **Questions not asked** — skipped, deferred or already answered, with IDs;
9. **Product gaps observed** — difference between current implementation and desired behaviour, without a proposed implementation;
10. **Next recommended session** — based on dependencies, not convenience.

Do not write a PRD. Do not select an architecture. Do not convert the answer into an implementation ticket. Dan and his Codex agent will map the interview package to the consolidated decision record, PRDs, ADRs and delivery plan.

## 11. Internal coverage map for the receiving team

This table helps you label the session package. It does not authorize you to change decisions.

| Session                                     | Consolidated record | Existing decisions likely informed         | Receiving PRD area                              |
| ------------------------------------------- | ------------------- | ------------------------------------------ | ----------------------------------------------- |
| S00 — organization and sources              | §§6–8, 22           | DEC-014–036, DEC-124                       | Product Vision; tenant/Company/authorization    |
| S01 — users and access                      | §§7–8, 17           | DEC-018, DEC-027, DEC-029–036, DEC-175–191 | tenant/Company/authorization; security          |
| S02 — Clients, Projects and Tasks           | §§7, 9, 22          | DEC-022–028, DEC-037–045                   | Release 1 Client, Project and Task PRDs         |
| S03 — Documents                             | §10, §27            | DEC-043–045, DEC-125–139                   | governed Documents cross-cutting PRD            |
| S04 — commercial work                       | §14, §26            | DEC-100–123                                | Release 3 commercial capability PRDs            |
| S05 — Google                                | §11, §23            | DEC-046–060                                | Release 2 integration PRDs                      |
| S06 — audits, certification and Training    | §13, §25            | DEC-076–099                                | Release 4 capability PRDs                       |
| S07 — finance                               | §12, §24            | DEC-061–075                                | Release 5 operational-finance PRD               |
| S08 — history and search                    | §15, §28            | DEC-140–154                                | migration/search cross-cutting PRD; Release 6   |
| S09 — approved knowledge and AI             | §16, §29            | DEC-155–174                                | AI/Knowledge Base cross-cutting PRD; Release 7  |
| S10 — continuity and sensitive information  | §17, §30            | DEC-175–192                                | security/reliability cross-cutting PRD          |
| S11 — daily use, language and notifications | §18, §31            | DEC-193–211                                | UX/localization/configuration cross-cutting PRD |

Use labels such as `CONFIRMS`, `CONFIGURES`, `REFINES`, `POSSIBLE_CONTRADICTION` or `NEW_BUSINESS_NEED`. Only Dan and his agent decide whether a repository decision or PRD changes.

## 12. Decide whether a follow-up is actually needed

Question-bank completeness is an audit measure, not a requirement to ask every question mechanically. A partial answer may already be sufficient for a reversible, low-risk product decision.

For each missing component, choose exactly one disposition:

- `SUFFICIENT` — the available business evidence is enough;
- `SUFFICIENT_REVERSIBLE_ASSUMPTION` — proceed only with the assumption and confidence recorded, because the choice is reversible and low risk;
- `INTERVIEWER_CLARIFICATION` — clarify the formulation, separate a compound question or request an example during the current interview when possible;
- `IURIE_FOLLOW_UP_REQUIRED` — ask Iurie a targeted question because the gap affects a business rule, exception, authorization, legal or financial effect, blocking automation or a decision difficult to reverse;
- `DAN_TECHNICAL_DECISION` — route product-design or technical mechanism decisions to Dan and the technical agents.

Do not ask Iurie the same broad question again. When consolidation discovers a material gap later, give Iurie's agent a short prioritized follow-up list containing:

1. the prior question and evidence link;
2. the exact missing component;
3. why the missing answer changes observable behaviour or risk;
4. one short Romanian follow-up question;
5. what must not be re-asked.

Distinguish evidence authority in every record:

- `DIRECT_IURIE` — direct or faithfully paraphrased answer;
- `AGENT_PROPOSAL_ACCEPTED` — the agent proposed a concrete formulation and Iurie explicitly accepted it;
- `AGENT_INTERPRETATION` — analysis by the interviewer without Iurie's explicit acceptance; never a business requirement;
- `DELEGATED_TO_DAN_AGENT` — Iurie delegated a product or technical decision; it remains undecided business behaviour until the responsible decision is documented.

The interviewer may explain concepts, reformulate and ask for examples. Iurie remains the authority on business reality and desired application needs. Avoid redundant questions and do not ask Iurie to decide purely technical matters.

## 13. Opening message to Iurie

Use or adapt this message:

> Bună ziua, Iurie. Voi parcurge împreună cu dumneavoastră întrebările despre cum trebuie să ajute aplicația activitatea PRISMA-PRIM, BIC și ECG. Nu trebuie să decideți baze de date, integrări, securitate sau alte soluții tehnice. Vă voi întreba ce se întâmplă în lucru, ce rezultat doriți, cine răspunde, ce excepții există și ce exemple sau documente pot confirma situația. Dacă nu știți un răspuns, îl notăm pentru persoana care îl poate verifica. Nu vă voi cere parole, chei, acces la conturi sau arhive confidențiale.

Then ask Iurie whether Romanian is comfortable or whether Russian would be clearer. Start with `S00-Q01` unless an earlier answer or urgent topic gives a better entry point.
