import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

// Every agent session loads these files before it can work on an issue, so
// their size is a deliberate budget. Line endings are normalized so a CRLF
// checkout measures the same bytes as the committed LF text.
const steeringBudgets = {
  'AGENTS.md': 5_400,
  'CLAUDE.md': 500,
  // 13600: #1223 records where a long-running structural decision lives.
  // The columns and illustration stay in structural-decisions.md.
  // 13700: #1278 asks the final report for the verification cost record;
  // how to build it stays in verification-cost.md.
  // 14200: #1276 states the blocking acceptance proof and that no workflow
  // starts Claude; the row format and details stay in acceptance-proof.md.
  // 14400: #1277 says when to run a journey audit and who may start Claude
  // for it; the procedure stays in the journey-audit skill.
  'docs/agents/issue-execution.md': 14_400,
  'docs/agents/typescript-discipline.md': 4_500,
  'docs/agents/issue-tracker.md': 2_200,
  // 1100: #1276 replaces "Tests added" with the Acceptance proof table the
  // CI check parses; its format stays in acceptance-proof.md.
  '.github/pull_request_template.md': 1_100,
};

for (const [path, budget] of Object.entries(steeringBudgets)) {
  test(`${path} stays within its steering budget`, async () => {
    const text = await readFile(new URL(`../${path}`, import.meta.url), 'utf8');
    const bytes = Buffer.byteLength(text.replaceAll('\r\n', '\n'));

    assert.ok(
      bytes <= budget,
      `${path} is ${bytes} bytes, over its ${budget}-byte steering budget. ` +
        'Every agent session loads this file: move detail behind a pointer to a ' +
        'disclosed document, delete duplicated or no-op rules, or raise the ' +
        'budget in scripts/steering-budget.test.mjs as a reviewed decision.',
    );
  });
}
