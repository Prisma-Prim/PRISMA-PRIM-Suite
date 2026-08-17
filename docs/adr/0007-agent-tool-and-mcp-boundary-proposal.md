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

The source email was received on 2026-08-17 with the subject `URGENT – PRISMA-PRIM-Suite trebuie păstrat MCP-ready`.

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

The current architecture already provides the required seams. The authoritative decisions remain in their owning documents:

- `0003-nestjs-owns-business-decisions.md` assigns business decisions and deterministic validation to NestJS;
- `0006-workspace-tenancy-and-company-scoped-authorization.md` assigns actor context, permissions, Workspace/Company isolation, and target visibility to the server;
- `ai-knowledge-governance-prd.md` governs retrieval, tool execution, approval, provider use, evaluation, and safe interaction traces;
- `platform-security-reliability-operations-prd.md` governs least privilege, environment isolation, provider failure, secure integrations, and Synology's bounded role;
- `openapi.yaml` demonstrates that typed application operations can already be exposed through an adapter without moving their business ownership.

Therefore MCP can later become another adapter over narrow application capabilities. The transport may call an authenticated API or safely compose with the same application services, depending on the future deployment. The transport choice is deferred; the authority boundary is not.

## MCP-specific consequences of existing technical decisions

These consequences keep both MCP directions open without duplicating the general controls owned by the ADRs and PRDs above. They do not select a provider, capability, deployment topology, or automation level.

### 1. MCP remains an adapter in both directions

Inbound MCP requests translate into governed NestJS application capabilities. Outbound MCP calls remain behind an owning application workflow and integration port. Neither direction may bypass owning services or invent parallel business rules.

### 2. MCP authority is never implicit or transitive

An inbound agent's decision to invoke a tool grants no authority; the existing server-authoritative actor and target rules apply at execution time. Discovering or installing an outbound MCP server grants no authority to invoke all advertised tools, and consuming one external capability does not expose it onward to users or other agents.

### 3. MCP exposes capabilities, not infrastructure

Agents and external MCP runtimes do not receive broad PostgreSQL credentials, filesystem mounts, NAS credentials, Drive scopes, or equivalent storage authority. Prefer narrow business capabilities such as `search_documents` or `get_document_version` over general storage access.

### 4. Every outbound MCP integration is explicitly bounded

Each external MCP integration requires an explicit owner, business purpose, allowed capabilities, credential scope, environment, data classification, timeout/retry policy, and disable/revocation path. Tool discovery is not blanket authorization to invoke every advertised tool.

### 5. MCP inputs and outputs remain untrusted adapter data

Inbound tool arguments and outbound MCP results require schema validation, size limits, safe error handling, tenant-aware data minimization, and protection against instructions embedded in retrieved content. External descriptions and results are data, not executable policy.

### 6. Each concrete capability declares its controls

Each future capability must declare whether it reads, proposes, or changes state, together with its risk, permission, approval, idempotency, evaluation, and logging requirements. Sensitive actions remain subject to the existing non-negotiable floor of deterministic validation and human approval; a future MCP capability may not weaken that requirement. The concrete slice must identify which of its actions are sensitive. The exact taxonomy, persistence model, and any bounded delegation policy for lower-risk actions are deferred to concrete use cases rather than standardized speculatively here. A provider confirmation dialog is not sufficient approval.

### 7. Automation execution remains attributable

Future evidence must distinguish the human or service authority from the agent, channel, or integration that executed a material action. When the owning capability classifies an MCP execution as a critical business action, it must create the canonical Activity Log event required by the Accountability module. The exact supplemental AI Interaction or Tool Action representation and linkage remain deferred.

### 8. Each MCP direction has an independent failure and credential boundary

Inbound and outbound MCP use separate least-privilege credentials, allowlists, observability, revocation, and outage handling. Production configuration and data are not implicitly available in development or test. Failure of optional MCP or AI integrations must not become failure of ordinary core product operation.

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
4. Which non-sensitive commands remain proposal-only, which require additional human approval, and whether bounded low-risk delegated authority is ever allowed. Mandatory human approval for sensitive actions is already established and is not deferred.
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
