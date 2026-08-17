---
status: proposed
---

# Proposed agent tool and MCP boundary

## Purpose

This proposal records an architectural review prompted by an email sent by Iurie Popescu's agent about future agent integration for PRISMA-PRIM Suite. The email is treated as an agent-generated architectural recommendation for review, **not as a direct instruction, approval, or business decision from Iurie himself**. It is intentionally documentation-only and does **not** authorize MCP implementation, new dependencies, new services, or a change to the current roadmap.

The goal is narrower: preserve the current architecture so future ChatGPT, Cursor, Codex, or other agent integrations can expose governed business capabilities without moving business authority into an AI-specific layer or creating direct AI access to storage and databases.

This ADR remains **proposed** until reviewed and accepted, revised, or rejected by the repository owner.

## Source email from Iurie's agent

Iurie's agent sent an email recommending that ongoing work continue without rework while preserving a clear separation where possible:

```text
BUSINESS LOGIC -> INTERNAL API -> MCP / AGENT LAYER -> ChatGPT / Cursor / other agents
```

The email highlighted reusable capabilities such as:

- `get_client`
- `search_documents`
- `get_projects`
- `get_audits`
- `get_certificates`
- `get_financial_status`
- `create_task`
- `update_project`
- `generate_audit_plan`
- `register_certificate`

The agent also recommended the following security properties:

1. separate read-only capabilities from write capabilities;
2. require human approval for write/modification actions;
3. do not give AI unrestricted Synology/Drive access;
4. use least privilege;
5. log AI actions;
6. keep DEV / TEST / PROD separate.

The email explicitly did **not** request immediate MCP implementation. It asked only whether the current architecture permits this separation or contains a major conflict.

Because the source is an agent-generated email rather than a direct product-owner decision, this ADR evaluates the recommendations independently against the repository's existing architecture and keeps every new conclusion in `proposed` status until Dan reviews it.

## Current architecture assessment

There is no major architectural conflict with this direction.

The repository already establishes the most important boundary:

- React/Vite is the presentation client;
- NestJS is the business backend;
- PostgreSQL/Drizzle is persistence behind the business backend;
- the future Python AI worker is a specialized workload boundary, not a business authority;
- NestJS owns business state, workflow transitions, validation, permissions, and final decisions;
- AI outputs are proposals subject to deterministic server validation;
- the API already has an explicit OpenAPI contract;
- access control and accountability are server-owned concerns;
- product PRDs already require authorization before retrieval/tool execution, server-side re-authorization, human confirmation for sensitive actions, provider replaceability, least privilege, safe logging, and DEV/TEST/PROD separation.

The current implementation reinforces this separation rather than merely documenting it. Controllers delegate to owning services, while owning services enforce authorization, validation, transactions, persistence, idempotency, and activity logging.

Therefore this proposal recommends **preserving and clarifying** existing seams, not refactoring the current foundation around MCP.

## Recommended conceptual model

The source email expresses the right architectural intent, but the architecture should not require every future MCP tool to perform a mandatory internal HTTP round trip when the same deployment can safely reuse application services.

Prefer the following conceptual model:

```text
                        +----------------------+
Web / external clients ->| REST / OpenAPI       |
                        +----------+-----------+
                                   |
                                   v
                        +----------------------+
                        | Application          |
ChatGPT / Cursor / ---> | capabilities        |
other agents via MCP    | / owning services   |
                        +----------+-----------+
                                   |
                      authorization / approval
                      validation / idempotency
                      accountability / policy
                                   |
                                   v
                        +----------------------+
                        | Domain + persistence |
                        | + integrations       |
                        +----------------------+
```

REST/OpenAPI and MCP are adapters over the same governed application capabilities. Either adapter may be separately deployed later, but neither should own the canonical business rules.

An acceptable alternative when deployment topology requires it is:

```text
MCP server -> authenticated internal API -> application capabilities
```

The invariant is not the transport. The invariant is that MCP remains outside the business authority boundary.

## Proposed architectural invariants

If this ADR is accepted, future implementation work should preserve the following invariants.

### 1. Business authority remains in NestJS application/domain ownership

MCP tools, model prompts, provider SDKs, frontend components, and storage adapters must not become the canonical place for business rules, workflow transitions, permissions, certification decisions, financial decisions, or final validation.

### 2. MCP is an adapter, not an authority

A future MCP layer may translate tool schemas and agent requests into application capabilities. It must not bypass owning services, invent independent authorization rules, or write directly to business persistence.

### 3. No direct AI access to PostgreSQL, Synology, Drive, or equivalent storage

Models and agent runtimes should not receive unrestricted database credentials, filesystem mounts, NAS credentials, Drive scopes, or broad storage APIs.

Storage and provider integrations remain application-owned adapters. Agent-visible tools expose the minimum business capability needed, after authorization and data minimization.

Examples:

- prefer `search_documents(query, project_id)` over unrestricted Drive search;
- prefer `get_document_version(document_id)` over exposing a storage path;
- prefer `register_certificate(...)` through a governed command over database access.

### 4. Server authorization is required on every tool execution

An agent's decision to call a tool never grants authority.

The server must establish the human principal, workspace/company scope, effective permissions, target visibility, and applicable business constraints at execution time. Client-supplied identifiers remain selection hints, not authority.

This applies to both reads and writes.

### 5. Query and command capabilities are explicitly classified

Agent-visible capabilities should be registered with an explicit risk/action class rather than inferred from naming conventions.

Initial conceptual categories:

```text
QUERY / READ
- get_client
- search_documents
- get_projects
- get_audits
- get_certificates
- get_financial_status

COMMAND / WRITE
- create_task
- update_project
- generate_audit_plan when it creates governed state
- register_certificate
```

This classification should drive permission scopes, approval policy, credentials, observability, evaluation, and test coverage.

It does **not** require separate business backends for reads and writes.

### 6. Human approval is a server-enforced policy, not a chat UI convention

For the first agentic releases, defaulting agent-initiated state changes to human approval is a sensible safety posture.

However, the durable rule should not be hard-coded as `all writes always require human approval forever`. The platform's longer-term automation goals may justify bounded delegated authority for low-risk, reversible commands.

Prefer a risk-based model such as:

```text
READ
-> no state change; ordinary authorization

PROPOSE / DRAFT
-> agent may produce a non-authoritative proposal automatically

LOW-RISK REVERSIBLE COMMAND
-> approval policy may later become configurable and explicitly delegated

SENSITIVE COMMAND
-> explicit human approval required

IRREVERSIBLE / LEGAL / FINANCIAL / CERTIFICATION AUTHORITY
-> strong human control and any additional required review
```

The approval state must be owned and checked by the server. A ChatGPT, Cursor, or other provider confirmation dialog is not sufficient as the authoritative control.

Recommended sensitive-command flow:

```text
agent proposes command
        |
        v
server validates proposal + authorization
        |
        v
pending governed action / preview
        |
        v
human approval by an authorized actor
        |
        v
server re-authorizes actor + target + current state
        |
        v
execute owning application command
        |
        v
record outcome in accountability/audit evidence
```

### 7. Distinguish human authority from agent execution identity

The Activity Log currently establishes human actor attribution. Future agent execution should preserve that attribution while also recording the execution channel and automation identity.

Do not silently attribute an AI-mediated execution as if the human directly performed the low-level action.

A future material tool execution should be able to answer questions such as:

```text
Human authority: Iurie
Execution actor/channel: PRISMA Assistant via ChatGPT MCP
Tool/capability: update_project
Provider/model/pipeline: recorded when relevant
Approval: approved by Iurie / delegated policy identifier
Target: exact Project
Outcome: proposed / rejected / executed / failed
Correlation/idempotency identifier: available
```

The exact persistence model is deferred, but the distinction should be preserved when designing Activity Log / AI Interaction / Tool Action schemas.

### 8. Agent actions are observable and safely auditable

Material tool interactions should preserve enough evidence to reconstruct:

- who had authority;
- which agent/channel initiated the request;
- which registered capability was requested;
- what target and scope were resolved by the server;
- whether approval was required and who approved;
- the deterministic validation result;
- the final business outcome;
- correlation, retry, and idempotency information where relevant.

Logs must avoid unnecessary secrets and sensitive source content. Business Activity Log evidence and diagnostic telemetry remain distinct concerns.

### 9. Providers remain replaceable

OpenAI, ChatGPT, Cursor, GitHub/Codex, Anthropic, Google, or another provider must not become a business authority or the only implementation seam for a core capability.

Tool contracts should be defined around PRISMA-PRIM business capabilities and typed application inputs/outputs, not provider-specific prompt structures.

### 10. Core operations remain usable during AI/provider outage

MCP and AI integrations are optional access/orchestration channels. Failure of an AI provider must not make core Client, Project, Task, Document, Audit, Certificate, financial, or authorization records inaccessible through the ordinary product.

### 11. DEV / TEST / PROD and credentials remain isolated

Agent tool access must follow the platform environment boundary. Production credentials and data are not implicitly available to development/test agents. Tool registries, provider credentials, callbacks, approval policies, and storage scopes should be environment-specific.

## Recommended capability contract characteristics

Future application capabilities intended for both UI/integrations and agent tools should favor:

- explicit typed inputs and outputs;
- narrow owning-module interfaces;
- deterministic validation around AI-produced data;
- authorization-aware actor context;
- explicit workspace/company/record scope;
- idempotency for retryable commands;
- structured errors that do not leak hidden record existence;
- provenance when AI-derived information participates;
- stable business semantics independent of the transport adapter.

This does **not** mean designing speculative generic abstractions now. Existing repository guidance to prefer the narrowest stable public interface remains correct. A capability should be extracted or generalized only when a concrete slice needs it.

## What should not be implemented now merely because this ADR exists

Acceptance of this proposal would **not** by itself justify:

- adding an MCP SDK or MCP server;
- creating `apps/mcp` before a concrete use case exists;
- exposing every REST endpoint as a tool;
- building a generic tool framework before real capabilities exist;
- creating a second business service layer only for agents;
- splitting query and command backends;
- adding Python for orchestration that NestJS can own;
- granting provider agents database, Synology, or Drive credentials;
- refactoring existing feature code solely to anticipate MCP;
- blocking operational-core roadmap work on agent integration.

The current approach should remain incremental: implement business capabilities through their owning modules first, then expose selected capabilities through an agent adapter when a validated use case requires it.

## Likely future implementation shape

When a concrete agent feature becomes ready, a narrow implementation may look like:

```text
apps/
  api/                 NestJS business application
  web/                 React product client
  ai-worker/           specialized ML/NLP jobs only when justified
  mcp/                 OPTIONAL future adapter if separate deployment is useful
```

or the MCP adapter may live inside a dedicated NestJS module if that is simpler and preserves the same trust boundary.

No directory choice is decided by this proposal.

A future agent tool registry may conceptually contain metadata such as:

```text
capability name
business purpose
query / command class
required application permission
input/output schema
risk classification
approval policy
idempotency requirement
allowed environments
logging/evaluation requirements
owning application service
```

Again, this is a target governance concept, not a request to build a registry immediately.

## Relationship to current repository decisions

This proposal is intended to reinforce, not replace, existing decisions:

- `0003-nestjs-owns-business-decisions.md`: NestJS owns business decisions and AI returns proposals;
- `0006-workspace-tenancy-and-company-scoped-authorization.md`: server-authoritative actor context, permission-based interfaces, workspace/company isolation, no authority from client-supplied identifiers;
- `ai-knowledge-governance-prd.md`: authorization before retrieval/tool execution, registered tools, typed arguments, server re-authorization, sensitive-action confirmation, provider replaceability, AI evaluation and safe interaction traces;
- `platform-security-reliability-operations-prd.md`: least privilege, environment isolation, provider degradation, secure integrations, Synology as a bounded adapter rather than runtime/database authority;
- `openapi.yaml`: reusable API contract already exists as one external adapter over business capabilities.

If any future accepted decision conflicts with this proposal, the newer explicit decision should supersede the relevant section rather than leaving two ambiguous authorities.

## Decisions that still require explicit review

The following points are deliberately **not** decided by this proposal and should be reviewed before implementation:

1. **MCP deployment topology** — separate `apps/mcp`, NestJS module, or external adapter calling the authenticated API.
2. **Agent identity model** — exact representation of human authority, execution agent/channel, provider/model, service identities, and delegated authority.
3. **Approval persistence model** — whether sensitive tool actions require a durable `PendingAction` entity or use an owning-domain approval workflow.
4. **Command approval policy** — which Release capabilities are always human-approved, which are proposal-only, and whether any low-risk delegated actions are permitted later.
5. **Tool registry persistence** — code-defined registry, configuration, or persisted governance records.
6. **MCP authentication** — user-delegated identity, service identity plus user context, token exchange, and revocation model.
7. **Synology/Drive adapter scope** — exact source inventory, permissions, read/write needs, archival/runtime role, and outage behavior.
8. **AI interaction retention** — exact safe metadata, retention period, redaction, export, and privacy treatment.
9. **Tool naming/versioning** — stable business capability names and compatibility policy once external agent clients depend on them.
10. **Agent-specific evaluation gates** — which tool capabilities require adversarial, multilingual, authorization, approval-bypass, or cross-tenant evaluation before release.

These are future product/security/technical decisions, not reasons to redesign the current foundation prematurely.

## Recommended review outcome

The recommended response to the architectural question raised in Iurie's agent email is:

> The architecture already permits the requested separation and there is no major conflict. The current NestJS business-authority boundary, reusable API contract, authorization model, accountability work, replaceable AI/provider approach, and security PRDs are aligned with the proposal. No current implementation should be stopped or rebuilt for MCP. We should formalize MCP/agent integrations as adapters over server-authorized business capabilities, prevent direct AI access to storage/database authority, explicitly classify query vs command tools, preserve human versus agent execution attribution, and enforce sensitive-action approval on the server when concrete agent features are implemented.

This is the technical reviewer's proposed response to the agent-generated recommendation; it should not be represented as Iurie's own architectural decision unless he separately confirms it.

## Review checklist for Dan + local Codex discussion

Before changing this ADR from `proposed` to `accepted`, review the following:

- [ ] Confirm MCP is an adapter and never a business-rule owner.
- [ ] Confirm current business-feature work should continue without MCP-driven refactoring.
- [ ] Confirm no AI/provider receives unrestricted DB/Synology/Drive access.
- [ ] Confirm every tool call is re-authorized by the application server.
- [ ] Confirm Query vs Command classification is explicit but does not require separate backends.
- [ ] Decide whether initial agent Commands all require human approval or only named sensitive classes.
- [ ] Confirm approval is enforced by PRISMA-PRIM server state, not merely provider UI confirmation.
- [ ] Confirm future logs distinguish human authority from agent/channel execution.
- [ ] Decide whether agent execution attribution belongs in Activity Log, AI Interaction, Tool Action, or a combination.
- [ ] Confirm provider-neutral business capability contracts remain the target.
- [ ] Confirm AI outage cannot block ordinary core product operation.
- [ ] Confirm no MCP implementation issue is created until a concrete use case and owning business capability are ready.
- [ ] Review the ten deferred decisions above and decide which need separate ADRs/PRDs before the first agentic implementation.

## Consequences if accepted

Positive consequences:

- future MCP integration remains comparatively low-cost;
- business rules remain testable independently of AI providers;
- ChatGPT/Cursor/other agents can share the same application capabilities;
- permissions and tenant isolation are harder to bypass;
- agent writes can be reviewed, approved, attributed, and audited;
- provider replacement and outage handling remain feasible;
- current roadmap work does not need speculative rework.

Costs and trade-offs:

- agent integrations cannot take shortcuts through storage or database access;
- sensitive write flows require additional approval and accountability state;
- tool schemas must remain synchronized with owning application capability semantics;
- execution identity and delegated authority add security-model complexity;
- future MCP work may need a separate adapter deployment depending on authentication and network topology.

These costs are intentional because they keep AI convenience outside the platform's authority boundary.
