import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import test from 'node:test';

import {
  validateComplexFeaturePreflight,
  validateComplexFeaturePreflightContents,
} from './validate-complex-feature-preflight.mjs';

const completePreflight = `<!-- complex-feature-preflight: required -->
<!-- pre-code-spec-review: approved -->
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

test('accepts a required brief with seven matrix sections and exact markers', async (t) => {
  const root = await createFixture(t, { 'brief.md': completePreflight });
  assert.deepEqual(
    await validateComplexFeaturePreflight(join(root, 'brief.md'), root),
    [],
  );
});

test('reports missing matrix sections', async (t) => {
  const root = await createFixture(t, {
    'brief.md': `<!-- complex-feature-preflight: required -->
<!-- pre-code-spec-review: approved -->
### States and transitions
Defined.
`,
  });
  const errors = await validateComplexFeaturePreflight(
    join(root, 'brief.md'),
    root,
  );
  assert.equal(errors.length, 6);
  assert.match(errors.join('\n'), /Actors and identities/);
  assert.doesNotMatch(errors.join('\n'), /Spec review result/);
});

test('accepts an explicitly exempt low-risk brief with a concrete reason', async (t) => {
  const root = await createFixture(t, {
    'brief.md': `<!-- complex-feature-preflight: exempt-low-risk -->
- Exemption reason: isolated wording correction with no contract change.
`,
  });
  assert.deepEqual(
    await validateComplexFeaturePreflight(join(root, 'brief.md'), root),
    [],
  );
});

test('does not treat HTML-commented matrix headings as evidence', async (t) => {
  const headings = completePreflight
    .split('\n')
    .filter((line) => line.startsWith('### '))
    .join('\n');
  const root = await createFixture(t, {
    'brief.md': `<!-- complex-feature-preflight: required -->
<!-- pre-code-spec-review: approved -->
<!--
${headings}
-->
`,
  });
  const errors = await validateComplexFeaturePreflight(
    join(root, 'brief.md'),
    root,
  );

  assert.equal(errors.length, 7);
  assert.match(errors.join('\n'), /States and transitions/);
  assert.match(errors.join('\n'), /Exclusions and unresolved decisions/);
});

test('does not treat an HTML-commented exemption reason as evidence', async (t) => {
  const root = await createFixture(t, {
    'brief.md': `<!-- complex-feature-preflight: exempt-low-risk -->
<!--
- Exemption reason: hidden explanation.
-->
`,
  });

  assert.match(
    (await validateComplexFeaturePreflight(join(root, 'brief.md'), root)).join(
      '\n',
    ),
    /concrete Exemption reason/,
  );
});

test('treats an unterminated HTML comment as hidden through end of file', async (t) => {
  for (const contents of [
    `<!-- complex-feature-preflight: required -->
<!-- pre-code-spec-review: approved -->
<!--
${completePreflight
  .split('\n')
  .filter((line) => line.startsWith('### '))
  .join('\n')}
`,
    `<!-- complex-feature-preflight: exempt-low-risk -->
<!--
- Exemption reason: hidden explanation.
`,
  ]) {
    const root = await createFixture(t, { 'brief.md': contents });
    assert.notDeepEqual(
      await validateComplexFeaturePreflight(join(root, 'brief.md'), root),
      [],
    );
  }
});

test('rejects legacy exemption reason syntax', async (t) => {
  const root = await createFixture(t, {
    'brief.md': `<!-- complex-feature-preflight: exempt-low-risk -->
Reason: isolated wording correction with no contract change.
`,
  });
  assert.match(
    (await validateComplexFeaturePreflight(join(root, 'brief.md'), root)).join(
      '\n',
    ),
    /concrete Exemption reason/,
  );
});

test('requires exactly one approved machine marker for required preflights', async (t) => {
  for (const contents of [
    completePreflight.replace('<!-- pre-code-spec-review: approved -->\n', ''),
    completePreflight.replace('approved', 'changes-required'),
    completePreflight.replace(
      '<!-- pre-code-spec-review: approved -->',
      '<!-- pre-code-spec-review: approved -->\n<!-- pre-code-spec-review: approved -->',
    ),
  ]) {
    const root = await createFixture(t, { 'brief.md': contents });
    assert.match(
      (
        await validateComplexFeaturePreflight(join(root, 'brief.md'), root)
      ).join('\n'),
      /exactly one pre-code Spec review marker/i,
    );
  }
});

test('does not interpret contradictory review prose', async (t) => {
  const root = await createFixture(t, {
    'brief.md': `${completePreflight}
## Spec review result
- Result: changes required

## Later review
Approved before code.
`,
  });
  assert.deepEqual(
    await validateComplexFeaturePreflight(join(root, 'brief.md'), root),
    [],
  );
});

test('ignores inline marker examples', async (t) => {
  const root = await createFixture(t, {
    'brief.md': `${completePreflight}
Document \`<!-- complex-feature-preflight: required -->\` and \`<!-- pre-code-spec-review: approved -->\` as examples.
`,
  });
  assert.deepEqual(
    await validateComplexFeaturePreflight(join(root, 'brief.md'), root),
    [],
  );
});

test('ignores fenced and indented machine-contract examples', async (t) => {
  for (const contents of [
    `\`\`\`markdown
${completePreflight}\`\`\`
`,
    completePreflight
      .split('\n')
      .map((line) => `    ${line}`)
      .join('\n'),
  ]) {
    const root = await createFixture(t, { 'brief.md': contents });
    assert.match(
      (
        await validateComplexFeaturePreflight(join(root, 'brief.md'), root)
      ).join('\n'),
      /expected exactly one complex-feature preflight marker, found 0/,
    );
  }
});

test('ignores declarations inside HTML code blocks', async (t) => {
  for (const contents of [
    `<pre>\n${completePreflight}</pre>\n`,
    `<code>\n${completePreflight}</code>\n`,
    `<pre>\n${completePreflight}`,
  ]) {
    const root = await createFixture(t, { 'brief.md': contents });
    assert.match(
      (
        await validateComplexFeaturePreflight(join(root, 'brief.md'), root)
      ).join('\n'),
      /expected exactly one complex-feature preflight marker, found 0/,
    );
  }
});

test('ignores multiline Markdown code spans', async (t) => {
  const root = await createFixture(t, {
    'brief.md': `\`
${completePreflight}\`
`,
  });
  assert.match(
    (await validateComplexFeaturePreflight(join(root, 'brief.md'), root)).join(
      '\n',
    ),
    /expected exactly one complex-feature preflight marker, found 0/,
  );
});

test('keeps visible evidence after fenced raw HTML examples', async (t) => {
  const root = await createFixture(t, {
    'brief.md': `\`\`\`html
<pre>
\`\`\`
${completePreflight}`,
  });
  assert.deepEqual(
    await validateComplexFeaturePreflight(join(root, 'brief.md'), root),
    [],
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

test('accepts linked preflight approval on the originating issue', async (t) => {
  const root = await createFixture(t, {
    'brief.md': `<!-- complex-feature-preflight: linked docs/preflight.md -->
<!-- pre-code-spec-review: approved -->
`,
    'docs/preflight.md': completePreflight.replace(
      '<!-- pre-code-spec-review: approved -->\n',
      '',
    ),
  });
  assert.deepEqual(
    await validateComplexFeaturePreflight(join(root, 'brief.md'), root),
    [],
  );
});

test('rejects duplicate approval across issue and linked preflight', async (t) => {
  const root = await createFixture(t, {
    'brief.md': `<!-- complex-feature-preflight: linked docs/preflight.md -->
<!-- pre-code-spec-review: approved -->
`,
    'docs/preflight.md': completePreflight,
  });
  assert.match(
    (await validateComplexFeaturePreflight(join(root, 'brief.md'), root)).join(
      '\n',
    ),
    /expected exactly one pre-code Spec review marker, found 2/,
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

test('rejects an in-repository symlink to an outside preflight', async (t) => {
  const outside = await createFixture(t, { 'preflight.md': completePreflight });
  const root = await createFixture(t, {
    'brief.md':
      '<!-- complex-feature-preflight: linked docs/preflight.md -->\n',
  });
  await mkdir(join(root, 'docs'));
  await symlink(join(outside, 'preflight.md'), join(root, 'docs/preflight.md'));

  assert.deepEqual(
    await validateComplexFeaturePreflight(join(root, 'brief.md'), root),
    ['brief.md: authoritative preflight must stay inside the repository'],
  );
});

test('rejects missing and contradictory complex-feature markers', async (t) => {
  for (const contents of [
    '# Narrow correction\n',
    `<!-- complex-feature-preflight: exempt-low-risk -->\n${completePreflight}`,
  ]) {
    const root = await createFixture(t, { 'brief.md': contents });
    assert.match(
      (
        await validateComplexFeaturePreflight(join(root, 'brief.md'), root)
      ).join('\n'),
      /expected exactly one complex-feature preflight marker/,
    );
  }
});

test('requires a concrete exemption reason', async (t) => {
  const root = await createFixture(t, {
    'brief.md': '<!-- complex-feature-preflight: exempt-low-risk -->\n',
  });
  assert.match(
    (await validateComplexFeaturePreflight(join(root, 'brief.md'), root)).join(
      '\n',
    ),
    /concrete Exemption reason/,
  );
});

test('does not borrow an exemption reason from the next line', async (t) => {
  const root = await createFixture(t, {
    'brief.md': `<!-- complex-feature-preflight: exempt-low-risk -->
- Exemption reason:
## Outcome
Explanation on another line.
`,
  });

  assert.match(
    (await validateComplexFeaturePreflight(join(root, 'brief.md'), root)).join(
      '\n',
    ),
    /concrete Exemption reason/,
  );
});

test('can require an exact Spec marker for an exempt contract change', async () => {
  const exemption = `<!-- complex-feature-preflight: exempt-low-risk -->
- Exemption reason: narrow contract clarification.
`;
  const options = {
    repositoryRoot: new URL('..', import.meta.url),
    requireApprovedSpecReview: true,
  };

  assert.match(
    (await validateComplexFeaturePreflightContents(exemption, options)).join(
      '\n',
    ),
    /exactly one pre-code Spec review marker/i,
  );
  assert.deepEqual(
    await validateComplexFeaturePreflightContents(
      `${exemption}<!-- pre-code-spec-review: approved -->\n`,
      options,
    ),
    [],
  );
});
