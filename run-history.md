# Run history

All fixtures are fictional; no runtime product code changed during this audit.

| Run | Outcome | Interpretation |
| --- | --- | --- |
| Initial native `certification.rest` | 9/9 passed | Included in broad namespace count, never added twice. |
| Complete API certification namespace | 167/167 passed across 26 files | REST/PostgreSQL, migration and deterministic tests; no skipped test. |
| Complete rendered certification selection | 535/535 passed across 23 files | Rendered React with HTTP fixtures; distinct from browser/server integration. |
| New auditor authority guards, first authoring run | 1/2 passed | Replaced leader correctly returned 409 `CERTIFICATION_NOT_TEAM_LEADER`; authoring expected 403. Corrected the test expectation. |
| New auditor authority guards, final | 2/2 passed | Actual public REST and PostgreSQL. |
| Source-successor document regression | 4/4 passed, then final 4/4 passed after assertion/import cleanup | Three existing cases and one new regression; deduplicated into 170 unique API cases. |
| Canonical `verify:journey certification-journey` | 2/2 passed; API/Web builds passed | Existing acceptance scenarios, API-seeded business states. |
| `combined-01` desktop grant authoring unit | Failed | After ineffective verification, driver incorrectly expected direct re-verification. Product requires a new response and adequacy judgment. Driver changed accordingly. |
| `combined-02` desktop grant hand-done unit | 1/1 passed | Full UI business journey, no API checkpoint; default browser locale with Romanian interface. |
| `risk-full-01` | 4 passed / 4 failed, no skips/flaky | Grant/context passed both widths. Refusal driver incorrectly waited for POST despite UI preflight block. Application rejection driver wrongly treated `rejected` as `refused` and attempted an unavailable exchange. Product behavior matched the PRD. |
| `risk-refusals-02` corrected bounded rerun | 4/4 passed, no skips/flaky | Refusal/rejection both widths; actual Romanian/Russian browser locale and interface. No application change or weakened business assertion. |
| Format, lint, types, cost ledger | Passed | Exact repository checks; no product build/runtime changes. |
| Independent Standards / Spec review of test diff | 0 / 0 material findings | Read-only separate reviewers, fixed base b14c45c0 and test commit e185acd4. |

Eight final unique browser variants passed across the two final runs. This is not an all-eight single-run pass. Failed authoring attempts are retained here; they are not product bug fixes. Raw diagnostics, traces, headers, fixture snapshots and throwaway drivers remain private outside Git.
