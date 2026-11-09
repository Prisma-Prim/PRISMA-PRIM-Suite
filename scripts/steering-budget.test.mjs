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
  'docs/agents/issue-execution.md': 13_600,
  'docs/agents/typescript-discipline.md': 4_500,
  'docs/agents/issue-tracker.md': 2_200,
  '.github/pull_request_template.md': 900,
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
