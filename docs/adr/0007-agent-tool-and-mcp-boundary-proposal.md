---
status: proposed
---

# Preserve governed boundaries for future MCP integrations

## Status and purpose

This ADR is a **proposed architectural boundary**, not an implementation plan.

It was prompted by an email sent by Iurie Popescu's agent. That email is useful source context, but it is **not** a direct instruction, approval, or business decision from Iurie. Dan requested this review so the recommendation could be compared with the repository and discussed without losing its reasoning.

The review answers three questions:

1. Can PRISMA-PRIM expose selected business capabilities to external agents through MCP later?
2. Can PRISMA-PRIM consume MCP capabilities exposed by external systems later?
3. Must current implementation work stop or be redesigned now to preserve either option?

The answer is: **the current foundation is compatible with both directions, there is no major architectural conflict, and no MCP implementation or MCP-driven refactor is justified now**.

This ADR remains `proposed` until its technical boundaries are reviewed. Product-policy choices identified below remain undecided even if the technical boundaries are later accepted.

## Source recommendation

Iurie's agent recommended preserving a separation similar to:

```text
BUSINESS LOGIC -> INTERNAL API -> MCP / AGENT LAYER -> ChatGPT / Cursor / other agents
```

It mentioned future capabilities such as `get_client`, `search_documents`, `get_projects`, `get_audits`, `create_task`, `update_project`, and `register_certificate`. It also recommended separating reads from writes, human control over changes, least privilege, logging, environment isolation, and no unrestricted AI access to Synology or Drive.

The email did not require immediate MCP implementation. It asked whether the current architecture preserves a safe path to add MCP later.

## What MCP means in this product

MCP is a standardized adapter protocol through which an agent can discover and invoke typed capabilities. It does not replace the business application, define permissions, or make model output authoritative.

PRISMA-PRIM may participate in MCP in two independent directions.

### Direction A — PRISMA-PRIM exposes governed capabilities

PRISMA-PRIM may later act as an MCP server, or place an MCP adapter in front of its application capabilities, so external agent clients can request operations such as searching permitted Documents or proposing a Project update.

```text
ChatGPT / Cursor / Codex / another agent client
                      |
                      v
             PRISMA-PRIM MCP adapter
                      |
                      v
        NestJS application capabilities
 authorization / validation / approval / audit
                      |
                      v
        domain + persistence + integrations
```

The agent selects and requests a capability. NestJS remains responsible for deciding whether and how it may execute.

### Direction B — PRISMA-PRIM consumes external MCP capabilities

PRISMA-PRIM may also act as an MCP client when a concrete product workflow needs a capability exposed by another system.

```text
PRISMA-PRIM owning application workflow
                      |
 policy + authorization + data minimization
                      |
                      v
          outbound MCP client adapter
                      |
                      v
     approved external MCP server/service
```

Examples might eventually include a bounded messaging, calendar, document-provider, or specialist processing integration. These are examples only; this ADR approves no provider or use case.

An external MCP server is untrusted integration input. Its tool descriptions, outputs, errors, and resource identifiers do not grant business authority. PRISMA-PRIM must validate returned data, minimize transmitted data, constrain credentials and scopes, handle timeouts and revocation, and keep the owning workflow recoverable when the external service fails.

### The two directions may coexist, but must not be collapsed

Exposing a PRISMA-PRIM capability and consuming an external capability are different trust boundaries. They may use the same protocol, but they require different credentials, permissions, threat models, logs, and failure handling.

Installing or consuming an external MCP server must never automatically expose that server's capabilities to PRISMA-PRIM users or to other agents. Likewise, exposing one PRISMA-PRIM capability must not grant general access to internal integrations.

## Current architecture assessment

The current architecture already provides the important seams:

- React/Vite is a presentation client, not the owner of business decisions;
- NestJS owns business state, workflows, validation, authorization, transactions, idempotency, and final decisions;
- PostgreSQL/Drizzle remains behind the business backend;
- external providers are adapters rather than core authorities;
- AI outputs are proposals subject to deterministic server validation;
- OpenAPI already exposes reusable, typed operations through one transport;
- actor context, Workspace/Company isolation, permissions, and accountability are server-owned;
- existing PRDs already require authorization before retrieval and tool execution, registered typed tools, server re-authorization, approval for sensitive actions, provider replaceability, safe traces, least privilege, and DEV/TEST/PROD isolation.

Therefore MCP can later become another adapter over narrow application capabilities. The transport may call an authenticated API or safely compose with the same application services, depending on the future deployment. The transport choice is deferred; the authority boundary is not.

## Technical boundaries that can be accepted independently of future product policy

These are durable technical constraints. They do not select a provider, tool, deployment topology, or automation level.

### 1. NestJS remains the business authority

MCP adapters, external MCP servers, prompts, model SDKs, frontend components, and storage adapters must not become the canonical place for business rules, workflow transitions, permissions, financial or certification decisions, or final validation.

### 2. MCP remains an adapter in both directions

Inbound MCP requests translate into governed application capabilities. Outbound MCP calls remain behind an owning application workflow and integration port. Neither direction may bypass owning services or invent parallel business rules.

### 3. No unrestricted model or MCP access to storage or persistence

Agents and external MCP runtimes do not receive broad PostgreSQL credentials, filesystem mounts, NAS credentials, Drive scopes, or equivalent storage authority. Prefer narrow business capabilities such as `search_documents` or `get_document_version` over general storage access.

### 4. Every inbound tool execution is server-authorized

The server establishes the human principal or approved service identity, Workspace and Company scope, effective permissions, target visibility, and current business constraints at execution time. A model's tool choice and client-supplied identifiers are requests, not authority.

This applies to reads as well as writes.

### 5. Every outbound MCP integration is constrained

Each external MCP integration requires an explicit owner, business purpose, allowed capabilities, credential scope, environment, data classification, timeout/retry policy, and disable/revocation path. Tool discovery is not blanket authorization to invoke every advertised tool.

### 6. Inputs and outputs are untrusted at every adapter boundary

Inbound tool arguments and outbound MCP results require schema validation, size limits, safe error handling, tenant-aware data minimization, and protection against instructions embedded in retrieved content. External descriptions and results are data, not executable policy.

### 7. Reads, proposals, and commands are explicitly classified

Capabilities should carry an explicit action and risk class. Names such as `get_` or `update_` are not sufficient security controls.

```text
QUERY / READ
PROPOSE / DRAFT
REVERSIBLE COMMAND
SENSITIVE COMMAND
IRREVERSIBLE / LEGAL / FINANCIAL / CERTIFICATION AUTHORITY
```

The classification drives permissions, approval, credentials, idempotency, evaluation, and logging. It does not require separate read and write backends.

### 8. Approval is enforced by server state

When approval is required, PRISMA-PRIM owns the pending state, validates the proposed action, verifies the approving actor, re-authorizes against current state, executes through the owning service, and records the outcome. A confirmation dialog in ChatGPT, Cursor, or another provider is not the authoritative control.

### 9. Human authority and automation execution remain distinguishable

Material actions must preserve who had authority, which agent/channel or integration initiated execution, which capability was invoked, the resolved scope and target, any approval, and the final outcome. AI-mediated work must not be silently attributed as a direct manual action by the human.

### 10. Providers and optional integrations remain replaceable and non-blocking

OpenAI, ChatGPT, Cursor, GitHub/Codex, Anthropic, Google, an MCP server, or another provider must not become the sole authority for a core business capability. Failure of optional AI or MCP integrations must not make ordinary Client, Project, Document, Audit, Certificate, financial, or authorization records inaccessible through the product.

### 11. Environments and credentials remain isolated

Production data, credentials, tool allowlists, callbacks, and approval policies are not implicitly available to development or test agents. External MCP connections use environment-specific, least-privilege credentials and synthetic or purpose-limited test data.

## Guidance for future capability contracts

When a concrete feature needs to be shared through REST, MCP, or another integration, prefer:

- one owning application capability with stable business semantics;
- explicit typed inputs, outputs, and structured errors;
- server-established actor and Workspace/Company context;
- deterministic validation around AI-produced or external data;
- narrow data disclosure and no hidden-record leakage;
- idempotency and correlation for retryable commands;
- explicit risk, permission, approval, and environment metadata;
- observable success, rejection, timeout, retry, and failure outcomes;
- adapter-specific mapping outside the owning business rules.

This guidance does not require extracting generic interfaces before a real second consumer exists. The narrowest stable interface remains preferable.

## Decisions deliberately deferred

The following choices require a concrete use case, technical design, security review, or business decision. They are **not** approved by merging this proposal.

### Technical and security decisions

1. Whether inbound MCP is a NestJS module, separate `apps/mcp`, or external adapter calling the authenticated API.
2. Which MCP client/server SDK and transport are appropriate at implementation time.
3. The authentication and token-exchange model for inbound agent clients.
4. The credential-vault, allowlist, egress, revocation, and trust model for outbound MCP servers.
5. The exact agent/service identity and delegated-authority representation.
6. Whether approval uses a shared durable action record or an owning-domain workflow.
7. Tool contract naming, versioning, compatibility, discovery, and deprecation.
8. Safe interaction retention, redaction, privacy, and export rules.
9. Evaluation gates for authorization bypass, prompt injection, cross-tenant leakage, multilingual behavior, malicious MCP output, timeout, and provider outage.

### Product and business-policy decisions

1. The first useful inbound MCP capability to expose.
2. The first external MCP capability worth consuming.
3. Which roles may use each capability and for which Companies or records.
4. Which commands remain proposal-only, which always require human approval, and whether bounded low-risk delegated authority is ever allowed.
5. Which legal, financial, certification, or Client commitments require stronger control.
6. Which Synology, Drive, or other source workflows are actually needed and who owns them.

Dan may accept the technical boundary without deciding these product policies. Iurie's confirmation is required where a choice changes business workflow, authority, responsibility, or acceptable operational risk.

## What this proposal does not authorize

Merging this ADR does not authorize:

- adding an MCP SDK, server, client, dependency, service, or directory;
- exposing every REST endpoint as an agent tool;
- connecting to an external MCP server;
- granting an agent access to PostgreSQL, Synology, Drive, or a shared filesystem;
- creating a generic tool platform or approval framework without a concrete slice;
- splitting business services into separate agent-specific implementations;
- changing the current roadmap;
- treating the source email as Iurie's product approval;
- creating implementation issues before a concrete use case and owner exist.

## Trigger for the first MCP implementation

Implementation should begin only when one bounded use case identifies:

- the user and business outcome;
- whether PRISMA-PRIM exposes or consumes the capability;
- the owning application module and data scope;
- the minimum tool contract;
- identity, permission, approval, and audit requirements;
- data sent to or returned by external systems;
- failure, timeout, revocation, and provider-outage behavior;
- representative authorization and adversarial tests.

That implementation should receive its own issue or PRD and architectural/security preflight. It should not reopen the boundaries already accepted here unless the concrete evidence demonstrates a conflict.

## Relationship to current repository decisions

This proposal reinforces rather than replaces:

- `0003-nestjs-owns-business-decisions.md` — NestJS owns business decisions and AI produces proposals;
- `0006-workspace-tenancy-and-company-scoped-authorization.md` — server-authoritative context, permission-based interfaces, and Workspace/Company isolation;
- `ai-knowledge-governance-prd.md` — governed retrieval and tools, server re-authorization, sensitive-action approval, replaceable providers, evaluation, and safe traces;
- `platform-security-reliability-operations-prd.md` — least privilege, environment isolation, provider degradation, secure integrations, and bounded Synology scope;
- `openapi.yaml` — a reusable typed transport over existing application capabilities.

If a future accepted decision conflicts with this proposal, the newer explicit decision supersedes the relevant section rather than leaving two ambiguous authorities.

## Recommended response to the source email

> The current architecture already permits the separation recommended by your agent and presents no major conflict. NestJS remains the business authority, while REST/OpenAPI and a future MCP layer can act as adapters over governed application capabilities. PRISMA-PRIM can also consume selected external MCP capabilities later through constrained integration adapters. No current work should stop or be rebuilt for MCP. We will preserve server authorization, least privilege, explicit risk classification, auditable human-versus-agent attribution, server-enforced approval for sensitive actions, environment isolation, and no unrestricted AI or MCP access to PostgreSQL, Synology, Drive, or equivalent storage. Concrete MCP implementation will wait for a bounded business use case and its security and product decisions.

This is Dan's technical response to an agent-generated recommendation. It must not be represented as Iurie's own decision unless he confirms the relevant business-policy choices.

## Review checklist

- [ ] Confirm both directions are covered: exposing PRISMA-PRIM capabilities and consuming external MCP capabilities.
- [ ] Confirm MCP remains an adapter and never a business-rule owner.
- [ ] Confirm existing feature work continues without MCP-driven refactoring.
- [ ] Confirm every inbound tool execution is server-authorized.
- [ ] Confirm outbound MCP discovery does not grant blanket tool authority.
- [ ] Confirm no unrestricted AI or MCP access to database or storage.
- [ ] Confirm inputs and outputs at both MCP boundaries are treated as untrusted.
- [ ] Confirm capability risk classification is explicit.
- [ ] Confirm approval, when required, is enforced by PRISMA-PRIM server state.
- [ ] Confirm human authority and automated execution remain distinguishable.
- [ ] Confirm provider outage cannot block ordinary core operations.
- [ ] Confirm environment-specific credentials and data separation.
- [ ] Keep the technical boundaries separate from the deferred product policies.
- [ ] Create no MCP implementation work until a concrete use case satisfies the trigger above.

## Consequences if the technical boundary is accepted

Benefits:

- future MCP server and client integrations remain feasible without moving business rules;
- several agent clients can reuse the same governed capabilities;
- external MCP services remain replaceable, constrained integrations;
- permissions, tenant isolation, approval, and accountability remain server-owned;
- current roadmap work continues without speculative refactoring.

Costs:

- MCP integrations cannot take shortcuts through databases or broad storage access;
- each direction requires explicit identity, credential, data, failure, and audit design;
- sensitive commands require additional control and evidence;
- adapter contracts must remain aligned with their owning application capabilities.

These costs are intentional. They preserve business authority and security while keeping both MCP directions open.
