---
status: superseded by ADR-0006
---

# Start with invitation-only access and one workspace

Clerk provides invitation-only identity for the MVP, and all business data belongs to one PRISMA Workspace. This avoids premature role and tenant administration while local user records still attribute approvals and Activity Log entries to authenticated people.

The invitation-only access decision remains valid. [ADR-0006](0006-workspace-tenancy-and-company-scoped-authorization.md) supersedes the singleton Workspace and equal-authority assumptions for the operational product.
