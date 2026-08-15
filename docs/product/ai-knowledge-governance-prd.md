# PRD — Knowledge Base, RAG, AI Evaluation and Tool Governance

**Status:** Draft — use-case evidence pending  
**Version:** 0.1  
**Owner:** Dan Popescu  
**Decisions:** DEC-004, DEC-155–DEC-174

## 1. Problem statement

Organizational knowledge is spread across procedures, interpretations, checklists, templates, Training material and Client files with different ownership, approval, version, confidentiality and license conditions. Uncontrolled retrieval or model use can expose data, cite obsolete material, invent authority or take actions beyond the user's permissions.

## 2. Solution

Build AI capabilities only on governed operational data and approved Knowledge Sources. Apply authorization before retrieval and generation, preserve exact version citations, distinguish support from uncertainty or contradiction, register every capability, trace material interactions safely and evaluate representative cases before increasing autonomy.

Begin with an assistive ISO Project Copilot after the operational core and governed Documents exist.

## 3. User stories

1. As a knowledge owner, I want to approve exact source versions, so that only governed material supports answers.
2. As a user, I want current approved sources by default, so that obsolete guidance is not presented as current.
3. As an authorized user, I want answers limited to sources I may access, so that AI does not bypass permissions.
4. As a user, I want exact citations and locators, so that I can inspect the evidence.
5. As a user, I want the assistant to state uncertainty, contradiction or absence, so that fluent prose is not mistaken for support.
6. As a Client or Company owner, I want confidential information isolated, so that another context cannot influence an answer.
7. As a user, I want useful missing-Document and contradiction detection, so that dossier review becomes faster.
8. As a professional, I want drafts and suggestions rather than automatic sensitive actions, so that I preserve judgment.
9. As a reviewer, I want to correct, reject and report poor output, so that quality can be measured.
10. As a product owner, I want each capability evaluated on representative Romanian, Russian and English cases.
11. As a security owner, I want provider data minimized and training on tenant data disabled by default.
12. As an administrator, I want every tool action re-authorized by the server, so that model intent does not create authority.

## 4. Domain model

- **Knowledge Source:** governed exact Document Version admitted for named uses.
- **Knowledge Projection:** derived chunks, embeddings, summaries and indexes.
- **AI Capability Registry Entry:** purpose, owner, permitted inputs/outputs, provider class, risk, human control and evaluation.
- **AI Interaction:** material request, references, provider/model/pipeline version, output, disposition, timing and safe usage metadata.
- **Evaluation Set:** representative cases, expected properties, prohibited outcomes and thresholds.
- **Tool Proposal/Action:** model-proposed operation executed only through server authorization and deterministic validation.

## 5. Invariants

1. A Knowledge Source identifies an exact governed version.
2. Admission respects ownership, license, confidentiality and permitted use.
3. Authorization precedes retrieval, snippets, generation and tool execution.
4. Current approved versions are default; history is deliberate.
5. Every material claim exposes exact supporting sources or an explicit insufficiency.
6. Chunks, embeddings and summaries are derived and rebuildable.
7. Retrieved content and model output are untrusted.
8. AI never approves prices, legal clauses, audit Findings, certification Decisions, credentials, financial confirmations or access.
9. Sensitive actions retain human approval.
10. Material provider or pipeline changes require requalification.

## 6. Capability lifecycle

Proposed → risk/evidence review → evaluation-ready → assistive pilot → approved for bounded use → suspended/retired.

Autonomy never increases from anecdotal satisfaction. Each step requires measured thresholds, failure review and explicit authorization.

## 7. Permissions and privacy

Capability use, Knowledge Source administration, evaluation review and tool-action approval are separate permissions. Company, Client, Project and Document authorization is preserved through retrieval and output.

Interaction traces avoid secrets and unnecessary source content. Data sent to providers is minimized, region and contractual conditions are reviewed, and tenant data is not permitted for provider training by default.

## 8. Prompt-injection and tool safety

- treat Documents, email and retrieved text as data, never authority;
- separate system instructions from untrusted content;
- validate structured output;
- allow only registered tools and typed arguments;
- re-establish actor and target authorization at execution time;
- preview sensitive actions and require human confirmation;
- make retries idempotent and observable.

## 9. Evaluation

Each capability defines:

- representative current, obsolete, contradictory and missing-source cases;
- Romanian, Russian and English behaviour;
- citation correctness and version correctness;
- authorization and leakage tests;
- serious versus tolerable error classes;
- human correction and rejection;
- time/quality value metric;
- thresholds for pilot, continued use and suspension.

## 10. UX

Users see capability purpose, source citations, uncertainty, limitations, current context and required approval. They can inspect sources, correct inputs, reject output and report harm. Provider names remain secondary to business purpose unless operationally relevant.

## 11. Provider and outage boundary

NestJS owns business orchestration and final validation. Providers are replaceable adapters. Core operational work remains available during AI outage. Long-running work is durable, retryable and visibly recoverable.

## 12. Testing decisions

- deterministic contract tests around capability inputs, validation and disposition;
- authorization tests before retrieval and tool execution;
- evaluation suites separate from ordinary unit pass/fail;
- adversarial untrusted-content and cross-tenant leakage cases;
- provider adapter tests without making external calls the core business seam;
- browser tests for citations, uncertainty, correction and approval.

## 13. Acceptance journey

An authorized user asks a dossier question. Retrieval selects only permitted current approved versions. The answer cites exact passages and states missing or contradictory evidence. A malicious instruction inside a source has no authority. A proposed sensitive action remains a preview until the authorized user confirms it; the server re-authorizes and records the outcome. The capability meets its multilingual evaluation threshold.

## 14. Evidence dependencies

- approved and obsolete source pairs;
- ownership, license and forbidden-use categories;
- 3–5 valuable dossier questions;
- useful missing-data, contradiction and deadline detection;
- drafts and required reviewers;
- serious-error scenarios and measurable value;
- languages per use case.

Question source: S09.

## 15. Technical and legal dependencies

- provider contract, region, retention and training-use review;
- AI risk and applicable regulatory assessment per use case;
- retrieval/index technology after corpus inventory;
- threat model and evaluation harness;
- durable job and tool-execution architecture.

## 16. Readiness

The governance boundary is ready for downstream PRDs. No Release 7 implementation ticket is ready before the operational core, governed Documents, source inventory, representative evaluation cases and legal/security review exist.
