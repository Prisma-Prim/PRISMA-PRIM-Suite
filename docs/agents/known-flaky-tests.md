# Known flaky tests

Tests that CI evidence has shown to fail on unchanged code. Nothing reads this list automatically. Use it to recognise a red run that is not caused by your change: a failure of a listed test with a matching symptom is not a reason to change your branch. A failure of any other test is yours until a re-run of the same commit passes.

## How an entry is added and removed

- Add an entry only with run IDs proving the flake: a failure that passed on a re-run of the same commit, or the same failure on several unrelated branches. Read a run with `gh run view <id> --attempt <n> --log-failed`.
- Every entry has an owner issue that fixes the test. The pull request that fixes it deletes the entry.
- Tests already fixed after their failures are not listed.

New and changed tests are repeated three times on every pull request by the `flaky_guard` CI job (`scripts/ci-repeat-tests.mjs`), so a new flaky test fails before it can merge.

## Entries

None open. The two entries seeded from CI runs between 2026-10-23 and 2026-11-06 were fixed by #1095 (#1081) and this pull request (#1082).
