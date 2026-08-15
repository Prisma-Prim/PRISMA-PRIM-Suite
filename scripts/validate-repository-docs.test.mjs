import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import { validateRepositoryDocs } from './validate-repository-docs.mjs';

const repositoryRoot = fileURLToPath(new URL('../', import.meta.url));

async function createFixture(t, files) {
  const container = await mkdtemp(join(tmpdir(), 'repository-docs-'));
  const repositoryRoot = join(container, 'repository');
  t.after(() => rm(container, { recursive: true, force: true }));

  for (const [path, contents] of Object.entries(files)) {
    const absolutePath = join(repositoryRoot, path);
    await mkdir(dirname(absolutePath), { recursive: true });
    await writeFile(absolutePath, contents);
  }

  return { container, repositoryRoot };
}

test('agent-facing guidance uses the canonical repository identity', async () => {
  assert.deepEqual(await validateRepositoryDocs(repositoryRoot), []);
});

test('reports the source and obsolete repository reference', async (t) => {
  const { repositoryRoot } = await createFixture(t, {
    'AGENTS.md': 'Use Dan-Popescu/PRISMA-PRIM-Suite.\n',
  });

  assert.deepEqual(await validateRepositoryDocs(repositoryRoot), [
    'AGENTS.md:1: obsolete repository reference "Dan-Popescu/PRISMA-PRIM-Suite"',
  ]);
});

test('reports the source and missing local Markdown target', async (t) => {
  const { repositoryRoot } = await createFixture(t, {
    'docs/agents/guide.md': 'Read the [missing guide](missing.md).\n',
  });

  assert.deepEqual(await validateRepositoryDocs(repositoryRoot), [
    'docs/agents/guide.md:1: broken local Markdown link target "missing.md"',
  ]);
});

test('validates local reference-style Markdown targets', async (t) => {
  const { repositoryRoot } = await createFixture(t, {
    'docs/product/spec.md': '[Details][missing]\n\n[missing]: ./missing.md\n',
  });

  assert.deepEqual(await validateRepositoryDocs(repositoryRoot), [
    'docs/product/spec.md:3: broken local Markdown link target "./missing.md"',
  ]);
});

test('accepts existing local targets and ignores external URLs', async (t) => {
  const { repositoryRoot } = await createFixture(t, {
    'docs/agents/guide.md': [
      '[Local](reference.md)',
      '[External](https://example.invalid/unreachable)',
      '[Anchor](#section)',
      '',
      '## Section',
    ].join('\n'),
    'docs/agents/reference.md': '# Reference\n',
  });

  assert.deepEqual(await validateRepositoryDocs(repositoryRoot), []);
});

test('rejects traversal and symlink targets outside the repository', async (t) => {
  const { container, repositoryRoot } = await createFixture(t, {
    'docs/agents/guide.md': [
      '[Traversal](../../../outside.md)',
      '[Symlink](outside-link.md)',
    ].join('\n'),
  });
  const outsidePath = join(container, 'outside.md');
  await writeFile(outsidePath, '# Outside\n');
  await symlink(
    outsidePath,
    join(repositoryRoot, 'docs/agents/outside-link.md'),
  );

  assert.deepEqual(await validateRepositoryDocs(repositoryRoot), [
    'docs/agents/guide.md:1: local Markdown link target escapes repository "../../../outside.md"',
    'docs/agents/guide.md:2: local Markdown link target escapes repository "outside-link.md"',
  ]);
});

test('reports cyclic symlink targets without aborting validation', async (t) => {
  const { repositoryRoot } = await createFixture(t, {
    'docs/agents/guide.md': '[Loop](loop.md)\n',
  });
  await symlink('loop.md', join(repositoryRoot, 'docs/agents/loop.md'));

  assert.deepEqual(await validateRepositoryDocs(repositoryRoot), [
    'docs/agents/guide.md:1: broken local Markdown link target "loop.md"',
  ]);
});

test('does not follow directory symlinks while scanning documentation', async (t) => {
  const { container, repositoryRoot } = await createFixture(t, {
    'docs/agents/guide.md': '# Guide\n',
  });
  const outsideDirectory = join(container, 'outside-docs');
  await mkdir(outsideDirectory);
  await writeFile(
    join(outsideDirectory, 'obsolete.md'),
    'Dan-Popescu/PRISMA-PRIM-Suite\n',
  );
  await symlink(outsideDirectory, join(repositoryRoot, 'docs/agents/external'));

  assert.deepEqual(await validateRepositoryDocs(repositoryRoot), []);
});

test('ignores Markdown links inside fenced and inline code', async (t) => {
  const { repositoryRoot } = await createFixture(t, {
    'docs/agents/guide.md': [
      '```markdown',
      '[Fenced](missing-fenced.md)',
      '```',
      'Use `[inline](missing-inline.md)` as an example.',
    ].join('\n'),
  });

  assert.deepEqual(await validateRepositoryDocs(repositoryRoot), []);
});

test('accepts balanced parentheses and angle-bracketed paths with spaces', async (t) => {
  const { repositoryRoot } = await createFixture(t, {
    'docs/agents/guide_(v2).md': '# Guide\n',
    'docs/agents/reference guide.md': '# Reference\n',
    'docs/agents/index.md': [
      '[Balanced](guide_(v2).md)',
      '[Angle](<reference guide.md>)',
      '[Titled angle](<reference guide.md> "Existing")',
      '[Broken titled angle](<missing guide.md> "Missing")',
      "[Single-quoted title](<reference guide.md> 'Existing')",
      '[Parenthesized title](<reference guide.md> (Existing))',
      '[Reference][guide]',
      '',
      '[guide]: <reference guide.md>',
    ].join('\n'),
  });

  assert.deepEqual(await validateRepositoryDocs(repositoryRoot), [
    'docs/agents/index.md:4: broken local Markdown link target "missing guide.md"',
  ]);
});

test('validates file components and deliberately ignores Markdown fragments', async (t) => {
  const { repositoryRoot } = await createFixture(t, {
    'docs/agents/guide.md': [
      '# Existing heading',
      '[Same-file fragment](#missing-heading)',
      '[Existing file](reference.md#missing-heading)',
      '[Missing file](missing.md#any-heading)',
    ].join('\n'),
    'docs/agents/reference.md': '# Reference heading\n',
  });

  assert.deepEqual(await validateRepositoryDocs(repositoryRoot), [
    'docs/agents/guide.md:4: broken local Markdown link target "missing.md#any-heading"',
  ]);
});

test('scans README and architecture decision records', async (t) => {
  const { repositoryRoot } = await createFixture(t, {
    'README.md': '[Missing README target](missing-readme.md)\n',
    'docs/adr/0001-decision.md': '[Missing ADR target](missing-adr.md)\n',
  });

  assert.deepEqual(await validateRepositoryDocs(repositoryRoot), [
    'README.md:1: broken local Markdown link target "missing-readme.md"',
    'docs/adr/0001-decision.md:1: broken local Markdown link target "missing-adr.md"',
  ]);
});

test('requires unescaped link openers and validates image targets', async (t) => {
  const { repositoryRoot } = await createFixture(t, {
    'docs/agents/guide.md': [
      'not-a-link](missing-prose.md)',
      String.raw`\[literal\](missing-escaped.md)`,
      '![Missing image](missing-image.png)',
    ].join('\n'),
  });

  assert.deepEqual(await validateRepositoryDocs(repositoryRoot), [
    'docs/agents/guide.md:3: broken local Markdown link target "missing-image.png"',
  ]);
});

test('validates file components beside Setext and linked headings', async (t) => {
  const { repositoryRoot } = await createFixture(t, {
    'docs/agents/guide.md': [
      '[Rendered label](reference.md#docs)',
      '[Setext](setext.md#setext-heading)',
    ].join('\n'),
    'docs/agents/reference.md': '## [Docs](target.md)\n',
    'docs/agents/setext.md': 'Setext heading\n==============\n',
    'docs/agents/target.md': '# Target\n',
  });

  assert.deepEqual(await validateRepositoryDocs(repositoryRoot), []);
});

test('ignores links inside four-space and tab-indented code', async (t) => {
  const { repositoryRoot } = await createFixture(t, {
    'docs/agents/guide.md': [
      '    [Indented](missing-indented.md)',
      '\t[Tabbed](missing-tabbed.md)',
    ].join('\n'),
  });

  assert.deepEqual(await validateRepositoryDocs(repositoryRoot), []);
});

test('does not interpret GitHub footnote definitions as link destinations', async (t) => {
  const { repositoryRoot } = await createFixture(t, {
    'docs/product/spec.md': '[^1]: missing-footnote-target.md\n',
  });

  assert.deepEqual(await validateRepositoryDocs(repositoryRoot), []);
});

test('excludes leading YAML frontmatter from Markdown links', async (t) => {
  const { repositoryRoot } = await createFixture(t, {
    'docs/adr/0001-decision.md': [
      '---',
      'source: "[Not Markdown](missing-frontmatter.md)"',
      'status: draft',
      '---',
      '# Decision',
      '[Existing fragment](#decision)',
      '[Fragments are renderer-owned](#status-draft)',
    ].join('\n'),
  });

  assert.deepEqual(await validateRepositoryDocs(repositoryRoot), []);
});

test('validates rendered links in nested unordered and ordered lists', async (t) => {
  const { repositoryRoot } = await createFixture(t, {
    'docs/agents/guide.md': [
      '- Resources:',
      '    - [Nested guide](missing-nested.md)',
      '    1. [Nested ordered guide](missing-ordered.md)',
    ].join('\n'),
  });

  assert.deepEqual(await validateRepositoryDocs(repositoryRoot), [
    'docs/agents/guide.md:2: broken local Markdown link target "missing-nested.md"',
    'docs/agents/guide.md:3: broken local Markdown link target "missing-ordered.md"',
  ]);
});

test('validates links in nested list continuation paragraphs', async (t) => {
  const { repositoryRoot } = await createFixture(t, {
    'docs/agents/guide.md': [
      '- Resources:',
      '    A continuation with [Guide](missing-continuation.md).',
    ].join('\n'),
  });

  assert.deepEqual(await validateRepositoryDocs(repositoryRoot), [
    'docs/agents/guide.md:2: broken local Markdown link target "missing-continuation.md"',
  ]);
});

test('validates multiline inline and reference-link destinations', async (t) => {
  const { repositoryRoot } = await createFixture(t, {
    'docs/agents/guide.md': [
      '[Existing](',
      '  reference.md',
      ')',
      '[Missing](',
      '  missing-inline.md',
      ')',
      '[Existing reference][existing]',
      '[Missing reference][missing]',
      '',
      '[existing]:',
      '  reference.md',
      '[missing]:',
      '  missing-reference.md',
    ].join('\n'),
    'docs/agents/reference.md': '# Reference\n',
  });

  assert.deepEqual(await validateRepositoryDocs(repositoryRoot), [
    'docs/agents/guide.md:12: broken local Markdown link target "missing-reference.md"',
    'docs/agents/guide.md:4: broken local Markdown link target "missing-inline.md"',
  ]);
});

test('ignores links inside single-line and multiline HTML comments', async (t) => {
  const { repositoryRoot } = await createFixture(t, {
    'docs/product/spec.md': [
      '<!-- [Hidden](missing-single.md) -->',
      '<!--',
      '[Also hidden](missing-multiline.md)',
      '-->',
    ].join('\n'),
  });

  assert.deepEqual(await validateRepositoryDocs(repositoryRoot), []);
});

test('ignores renderer-owned fragments with core and non-core HTML entities', async (t) => {
  const { repositoryRoot } = await createFixture(t, {
    'docs/adr/0001-decision.md': [
      '# Cats &amp; Dogs',
      '[Named entity](#cats--dogs)',
      '# Fish &#38; Chips',
      '[Numeric entity](#fish--chips)',
      '# Law &copy; Practice',
      '[Non-core entity](#law--practice)',
    ].join('\n'),
  });

  assert.deepEqual(await validateRepositoryDocs(repositoryRoot), []);
});

test('reports decoded NUL targets without calling the filesystem', async (t) => {
  const { repositoryRoot } = await createFixture(t, {
    'docs/agents/guide.md': '[Invalid](%00.md)\n',
  });

  assert.deepEqual(await validateRepositoryDocs(repositoryRoot), [
    'docs/agents/guide.md:1: invalid local Markdown link target "%00.md"',
  ]);
});
