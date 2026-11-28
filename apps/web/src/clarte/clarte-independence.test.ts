// @vitest-environment node

import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, it } from 'vitest';

const moduleRoot = fileURLToPath(new URL('.', import.meta.url));
const prismeReference =
  /(?:from\s+|import\s*\(\s*|import\s+|url\(\s*)['"][^'"]*\/prisme(?:[/'"])/u;

/** Every Clarté source and stylesheet, including later slices' files. */
function moduleFiles(): string[] {
  return readdirSync(moduleRoot, { recursive: true, encoding: 'utf8' })
    .filter((path) => /\.(?:ts|tsx|css)$/u.test(path))
    .map((path) => join(moduleRoot, path));
}

it('keeps Clarté free of any Prisme & lumière module, style or asset', () => {
  const files = moduleFiles();
  const dependent = files
    .filter((file) => prismeReference.test(readFileSync(file, 'utf8')))
    .map((file) => relative(moduleRoot, file));

  expect(files.some((file) => file.endsWith('clarte-tokens.css'))).toBe(true);
  expect(dependent).toEqual([]);
});
