# Local PostgreSQL and browser preflight

Run the narrow preflight before deep review for a slice that crosses PostgreSQL,
migrations, or the browser:

```bash
pnpm preflight:local
```

The command checks the repository runtime, package manager, installed
dependencies, safe local PostgreSQL targets and connectivity, the immediately
previous migration state, and Playwright Chromium availability. When browser
execution is runnable, the smoke journey also proves that the configured web
server starts successfully. It never installs Docker, PostgreSQL, WSL, or a browser.

Each seam reports two independent facts:

- `RUNNABLE LOCALLY` or `BLOCKED LOCALLY WITH REASON` describes the current
  workstation.
- `LOCAL AND FULL CI` or `DELEGATED TO EARLY CI` identifies where authoritative
  evidence can be obtained.

Exit code `0` means every seam ran successfully, `1` means a runnable test
failed, and `2` means at least one local prerequisite is missing. A blocked
local result is not evidence that the implementation is wrong; use the early CI
path before deep review.

## Local guarantees

When the required tools are already available, the command runs:

```bash
pnpm test:preflight:postgres
pnpm test:preflight:playwright
```

The PostgreSQL command is destructive only against the isolated local test
database required by `agent-doctor`. It runs serially and covers a real
cross-Workspace REST setup plus migration from the immediately previous
committed schema. The Playwright command starts the configured preview server
and executes one production-shell journey in both desktop and narrow projects.

The full local suite remains available separately; the preflight is intentionally
small and does not duplicate lint, formatting, every unit test, every browser
journey, or production builds.

## Early CI delegation

Push a draft branch, then run **Early CI preflight** for that exact branch from
the GitHub Actions interface. With authenticated GitHub CLI access, the equivalent
command is:

```bash
gh workflow run early-ci.yml --ref <branch>
```

The run page records the exact commit and executes the same canonical package
scripts as the local preflight with PostgreSQL 17 and an explicitly installed
Chromium. This workflow is advisory and manually triggered; it does not replace
the normal pull-request CI or the final review gates.

## CI-only guarantees

Normal CI remains authoritative for the complete lint, type-check, test, browser,
build, formatting, evidence-upload, and clean Linux runner guarantees. Operating
system behavior is not promised to be byte-for-byte identical locally.
