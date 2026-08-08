import assert from 'node:assert/strict';
import test from 'node:test';

import {
  stripHtmlComments,
  validatePullRequestBody,
} from './validate-pr-description.mjs';

const completeBody = `
## Outcome

Delivered the requested governance.

Closes #24

## Verification

All required checks passed.

## Review

Standards and Spec reviews completed.

## Agent environment retrospective

- Harness: Codex
- Environment: Linux
- OS/runtime: Linux, Node 24
- Avoidable environment or repository friction: none observed.
`;

test('accepts a complete no-friction declaration', () => {
  assert.deepEqual(validatePullRequestBody(completeBody), []);
});

test('accepts a structured friction row', () => {
  const frictionBody = completeBody.replace(
    '- Avoidable environment or repository friction: none observed.',
    '| Runtime | Node 22 failed | Image drift | Confirmed | mise | Pin Node 24 | Fixed externally |',
  );

  assert.deepEqual(validatePullRequestBody(frictionBody), []);
});

test('ignores headings hidden in HTML comments', () => {
  const body = completeBody.replace('## Review', '<!-- ## Review -->');
  assert.match(
    validatePullRequestBody(body).join('\n'),
    /Missing required heading: ## Review/,
  );
});

test('rejects an empty issue placeholder and retrospective fields', () => {
  const body = completeBody
    .replace('Closes #24', 'Closes #')
    .replace('- Harness: Codex', '- Harness:');
  const errors = validatePullRequestBody(body).join('\n');

  assert.match(errors, /Closes #24/);
  assert.match(errors, /Harness/);
});

test('strips multiline HTML comments', () => {
  assert.equal(
    stripHtmlComments('before<!-- hidden\ntext -->after'),
    'beforeafter',
  );
});
