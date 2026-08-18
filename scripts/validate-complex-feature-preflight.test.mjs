import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import test from 'node:test';

import { validateComplexFeaturePreflight } from './validate-complex-feature-preflight.mjs';

const completePreflight = `<!-- complex-feature-preflight: required -->
## Complex-feature preflight
### States and transitions
Defined.
### Actors and identities
Defined.
### Mutation contract
Defined.
### Data authority
Defined.
### Surfaces
Defined.
### Test matrix
Defined.
### Exclusions and unresolved decisions
Defined.
### Spec review result
Approved before implementation.
`;

async function createFixture(t, files) {
  const root = await mkdtemp(join(tmpdir(), 'complex-feature-preflight-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  for (const [path, contents] of Object.entries(files)) {
    const absolutePath = join(root, path);
    await mkdir(dirname(absolutePath), { recursive: true });
    await writeFile(absolutePath, contents);
  }
  return root;
}

test('accepts a triggered brief with every required field', async (t) => {
  const root = await createFixture(t, { 'brief.md': completePreflight });
  assert.deepEqual(
    await validateComplexFeaturePreflight(join(root, 'brief.md'), root),
    [],
  );
});

test('reports missing fields for a triggered brief', async (t) => {
  const root = await createFixture(t, {
    'brief.md': `<!-- complex-feature-preflight: required -->
## Complex-feature preflight
### States and transitions
Defined.
`,
  });
  const errors = await validateComplexFeaturePreflight(
    join(root, 'brief.md'),
    root,
  );
  assert.equal(errors.length, 7);
  assert.match(errors.join('\n'), /Actors and identities/);
  assert.match(errors.join('\n'), /Spec review result/);
});

test('accepts an explicitly exempt low-risk brief', async (t) => {
  const root = await createFixture(t, {
    'brief.md': '<!-- complex-feature-preflight: exempt-low-risk -->\n',
  });
  assert.deepEqual(
    await validateComplexFeaturePreflight(join(root, 'brief.md'), root),
    [],
  );
});

test('rejects multiple or contradictory markers', async (t) => {
  const root = await createFixture(t, {
    'brief.md': `<!-- complex-feature-preflight: exempt-low-risk -->
${completePreflight}`,
  });
  assert.deepEqual(
    await validateComplexFeaturePreflight(join(root, 'brief.md'), root),
    [
      'brief.md: expected exactly one complex-feature preflight marker, found 2',
    ],
  );
});

test('accepts a linked authoritative preflight', async (t) => {
  const root = await createFixture(t, {
    'brief.md':
      '<!-- complex-feature-preflight: linked docs/preflight.md -->\n',
    'docs/preflight.md': completePreflight,
  });
  assert.deepEqual(
    await validateComplexFeaturePreflight(join(root, 'brief.md'), root),
    [],
  );
});

test('rejects a linked preflight outside the repository', async (t) => {
  const root = await createFixture(t, {
    'brief.md': '<!-- complex-feature-preflight: linked ../outside.md -->\n',
  });
  assert.deepEqual(
    await validateComplexFeaturePreflight(join(root, 'brief.md'), root),
    ['brief.md: authoritative preflight must stay inside the repository'],
  );
});

test('ignores unmarked briefs', async (t) => {
  const root = await createFixture(t, {
    'brief.md': '# Narrow documentation correction\n',
  });
  assert.deepEqual(
    await validateComplexFeaturePreflight(join(root, 'brief.md'), root),
    [],
  );
});
