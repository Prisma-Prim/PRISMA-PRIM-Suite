# Known flaky tests

Tests that CI evidence has shown to fail on unchanged code. Nothing reads this list automatically. Use it to recognise a red run that is not caused by your change: a failure of a listed test with a matching symptom is not a reason to change your branch. A failure of any other test is yours until a re-run of the same commit passes.

## How an entry is added and removed

- Add an entry only with run IDs proving the flake: a failure that passed on a re-run of the same commit, or the same failure on several unrelated branches. Read a run with `gh run view <id> --attempt <n> --log-failed`.
- Every entry has an owner issue that fixes the test. The pull request that fixes it deletes the entry.
- Tests already fixed after their failures are not listed.

New and changed tests are repeated three times on every pull request by the `flaky_guard` CI job (`scripts/ci-repeat-tests.mjs`), so a new flaky test fails before it can merge.

## Entries

The two entries seeded from CI runs between 2026-10-23 and 2026-11-06 were fixed by #1095 (#1081) and #1097 (#1082).

- `apps/web/e2e/document-content.acceptance.spec.ts:298` (Playwright acceptance, desktop): "retires actual-App token, response, parser, hash, Blob and recovery work under native authority changes".
  - Symptom: `locator.click: Test timeout of 120000ms exceeded`, waiting for the `.project-workspace section.working-evidence` button "Fictional lifetime Case desktop" in `openCase()` of `working-evidence-lifetime.acceptance.fixture.ts`, called inside the stage loop after the Company round trip.
  - Evidence: run 42330108864 (#1115, scripts only) failed on attempt 1 and passed on attempt 2 of the same commit. The rerun replaced the failure trace, so the cause is unproven; it is not the #1158 Project search race, because the Project row click before it succeeded.
  - Owner: #1158.
