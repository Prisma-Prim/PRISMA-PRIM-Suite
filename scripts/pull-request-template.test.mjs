import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

// The owner asked every pull request to say how to undo it, next to the door
// and blast-radius guidance, so a bad merge can be rolled back quickly.
test('the pull request template asks how to revert inside the risk section', async () => {
  const text = await readFile(
    new URL('../.github/pull_request_template.md', import.meta.url),
    'utf8',
  );
  const riskSection = text
    .replaceAll('\r\n', '\n')
    .split(/^## /m)
    .find((section) => section.startsWith('Risks and merge danger'));

  assert.ok(
    riskSection,
    'the template keeps a "Risks and merge danger" section',
  );
  assert.match(riskSection, /^How to revert:/m);
});
