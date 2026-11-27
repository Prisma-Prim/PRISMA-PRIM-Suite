---
status: accepted
---

# Move the web interface to Clarté and retire Prisme & lumière

**Status:** Accepted, 2026-11-27  
**Owner:** Dan Popescu  
**Source:** [#1528](https://github.com/Prisma-Prim/PRISMA-PRIM-Suite/issues/1528), recorded by [#1529](https://github.com/Prisma-Prim/PRISMA-PRIM-Suite/issues/1529)  
**Supersedes:** the Prisme & lumière direction of [#225](https://github.com/Prisma-Prim/PRISMA-PRIM-Suite/issues/225) for future UI work

## Context

The owner found the current interface not intuitive. It has 22 sections in one flat menu, panels stacked inside long pages, duplicated entry points and no visible workflow from Request to Collection.

## Decision

The web application moves to the Clarté interface.

- **Navigation.** Seven primary entries: Today, Affaires, Clients, Missions and audits, Tasks, Documents and Finance, plus Improvement and Settings. Everything else lives in tabs or side panels.
- **Frame.** A top bar holds a jump list (Ctrl K), the active Company, notifications and the user menu. Phones get a bottom bar instead.
- **Affaire.** An affaire is a read-side aggregation of existing records: Client Request, Opportunity, Offer, Contract, Project, Certification Case and invoice facts. It is shown as a seven-stage thread (Request, Costing, Offer, Contract, Delivery, Closure, Collection) with a single next step. It is not a new business object; NestJS composes it on the server and stays the authority.
- **Proposals.** Every approval of an AI or imported proposal happens with the source passage beside it, with effort proportional to risk.
- **Dossier discrepancies.** They are reviewed one at a time, with the originals side by side and the compared values highlighted.
- **Settings.** One console with sections. The interface language is chosen in Settings and in the user menu, not shown permanently.
- **Appearance and language.** Light background only. Four languages: Romanian (default), Russian, French and English.

## Migration

Option A, chosen by the owner on 2026-11-27 through the shared decision procedure: build Clarté screen by screen behind a switch reserved for testers, in slices under [#1528](https://github.com/Prisma-Prim/PRISMA-PRIM-Suite/issues/1528), while Prisme & lumière stays the default for everyone. When every slice has merged, one switch-over moves everyone to Clarté, deletes Prisme & lumière from the code and adds an automated check against its return.

## Rejected option

Option B replaced each screen directly. The owner rejected it because two visual styles would have been mixed for weeks.

## Consequences

- Prisme & lumière remains the default interface until the switch-over ([#1548](https://github.com/Prisma-Prim/PRISMA-PRIM-Suite/issues/1548)) merges. The switch-over also updates the AGENTS.md Product UI line.
- `/ui-baseline` stays a synthetic snapshot unless the switch-over finds that it depends on Prisme.
- Only existing functions move; every screen ships in four languages; planned functions get no placeholders in production and their own PRDs later.
- The design reference stays on the owner's machine and is never committed. Slice issues describe their screens in plain text.
- Business behaviour, authorization and tenancy are unchanged; this decision governs presentation only.
