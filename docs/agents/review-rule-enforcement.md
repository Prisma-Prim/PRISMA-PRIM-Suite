# Review rule enforcement

**Status:** Approved process (owner decision, 2026-11-07, [#1099](https://github.com/Prisma-Prim/PRISMA-PRIM-Suite/issues/1099))

Fix a recurring mistake as high as possible: in the code first, then with a deterministic check, and in prose only when nothing can enforce it. Prose rules live in the **Code Review Rules** of [`AGENTS.md`](../../AGENTS.md) and cover judgment calls only. This table pairs each rule with what enforces it.

| Rule                                                                          | Enforced by                                                                              | Source        |
| ----------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- | ------------- |
| Table without `workspace_id`, or Company-owned without composite keys         | `apps/api/src/database/tenancy-schema.test.ts`; reasoned exemptions only (#1105)         | #1103, #1107  |
| Schema change without its generated migration                                 | `pnpm db:check-drift` in CI `checks`                                                     | #1068, #1072  |
| Drop, rename, retype or truncate in one migration step                        | `scripts/destructive-migrations.test.mjs`; needs a `destructive-change` approval comment | #1101, #1104  |
| Activity Log event updated or deleted                                         | ESLint `no-restricted-syntax` on `*Events` tables, plus database triggers                | #1102, #1108  |
| Access tables queried outside the Access module                               | ESLint `no-restricted-imports`                                                           | #1102, #1108  |
| Non-null `!` and type assertions in TypeScript                                | ESLint with the shrinking `eslint-suppressions.json` baseline                            | #1077, #1079  |
| Hand-rolled `AbortController` in web code, not `useScopedOperation`           | ESLint `no-restricted-syntax` with the shrinking `eslint-suppressions.json` baseline     | #1119, #1135  |
| Handler without an established actor context                                  | `requireActorContext` returns 403                                                        | #1092         |
| Concurrent queries on one transaction client, e.g. under `Promise.all`        | API Vitest setup `pg-queued-query-guard.ts` fails the test on `pg`'s warning             | #1231         |
| Company leak, lasting access or false history in Internal Company Tasks       | Nightly `nightly-fuzz.yml`; a failure opens one `fuzz-found` issue to triage             | #1155, #1156  |
| Company leak, lasting access or false history in manual Invoice Records       | Nightly `nightly-fuzz.yml`; a failure opens one `fuzz-found` issue to triage             | #1205, #1211  |
| Company leak, self-confirmation or false history in manual Payments           | Nightly `nightly-fuzz.yml`; a failure opens one `fuzz-found` issue to triage             | #1205, #1218  |
| Company leak, a cross-Project link or false history in Documents              | Nightly `nightly-fuzz.yml`; a failure opens one `fuzz-found` issue to triage             | #1205, #1241  |
| Company leak, a second Contract or false history in illustrative Contracts    | Nightly `nightly-fuzz.yml`; a failure opens one `fuzz-found` issue to triage             | #1205, #1245  |
| Company leak, a skipped step or false history in Certification Cases          | Nightly `nightly-fuzz.yml`; a failure opens one `fuzz-found` issue to triage             | #1205, #1247  |
| Company leak, lasting access or false history in Access grants                | Nightly `nightly-fuzz.yml`; a failure opens one `fuzz-found` issue to triage             | #1205, #1249  |
| Company leak or false history in the Company registry                         | Nightly `nightly-fuzz.yml`; a failure opens one `fuzz-found` issue to triage             | #1205, #1251  |
| Company leak, an illegal lifecycle step or false history in Projects          | Nightly `nightly-fuzz.yml`; a failure opens one `fuzz-found` issue to triage             | #1205, #1253  |
| Company leak, a rewritten Version or false history in mission plans           | Nightly `nightly-fuzz.yml`; a failure opens one `fuzz-found` issue to triage             | #1205, #1255  |
| Company leak, a review of unfinished work or false history in mission reviews | Nightly `nightly-fuzz.yml`; a failure opens one `fuzz-found` issue to triage             | #1205, #1257  |
| Request-supplied or missing scope in a query or command                       | Review only                                                                              | ADR 0006      |
| Hidden and missing records answered differently                               | Review only                                                                              | ADR 0006      |
| Authority from payload, role names or controller conditions                   | Review only                                                                              | Access module |
| Authorization checked before the transaction that relies on it                | Review only                                                                              | Access module |
| Activity event outside its transaction, or for a failed or no-op command      | Review only                                                                              | Activity PRD  |
| Activity actor, scope or target from client input, or wide metadata           | Review only                                                                              | Activity PRD  |

## Maintaining the table

- When a review rule fires twice, try a check before keeping it as prose. Prove each new check against a real past mistake, or state that a deliberate mutation was used.
- When a check starts enforcing a rule, delete the prose rule from `AGENTS.md` and add the row here.
- Put an exception next to the offending line or entry, with a reason and an issue.
- Delete a rule and its check once the mistake can no longer happen.
