# Known flaky tests

Tests that CI evidence has shown to fail on unchanged code. Nothing reads this list automatically. Use it to recognise a red run that is not caused by your change: a failure of a listed test with a matching symptom is not a reason to change your branch. A failure of any other test is yours until a re-run of the same commit passes.

## How an entry is added and removed

- Add an entry only with run IDs proving the flake: a failure that passed on a re-run of the same commit, or the same failure on several unrelated branches. Read a run with `gh run view <id> --attempt <n> --log-failed`.
- Every entry has an owner issue that fixes the test. The pull request that fixes it deletes the entry.
- Tests already fixed after their failures are not listed.

New and changed tests are repeated three times on every pull request by the `flaky_guard` CI job (`scripts/ci-repeat-tests.mjs`), so a new flaky test fails before it can merge.

## Entries

Seeded from CI runs between 2026-10-23 and 2026-11-06.

- `apps/web/src/contract/ModelContractPanel.test.tsx` (Vitest, `web_unit`): "retires a held preparation command and literal draft when its consumed offer capture changes" and "... client capture changes".
  - Symptom: `expect(element).toBeEnabled()` on a disabled submit button, or `Expected both Contract source reads to begin.` at line 126.
  - Evidence: runs 41147372708 and 41159307591 failed on attempt 1 and passed on attempt 2 of the same commit; run 42299422160 (job 128174422713, pull request #1076, which changes only documentation and a script).
  - Owner: #1081.
- `apps/web/e2e/operational-risk.acceptance.spec.ts:20` (Playwright acceptance): "explicitly records, replays, follows and corrects a confidential Company Risk while preserving independent access".
  - Symptom: 5000 ms `toContainText` timeout on the "Current journal statement" region, which still shows the previous revision.
  - Evidence: run 41251704497 failed on attempt 1 and passed on attempt 2 of the same commit.
  - Owner: #1082.
