#!/usr/bin/env node

import { readFile } from 'node:fs/promises';
import { isAbsolute, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const MARKER =
  /<!--\s*complex-feature-preflight:\s*(required|exempt-low-risk|linked(?:\s+([^\s]+))?)\s*-->/iu;
const REQUIRED_FIELDS = [
  'States and transitions',
  'Actors and identities',
  'Mutation contract',
  'Data authority',
  'Surfaces',
  'Test matrix',
  'Exclusions and unresolved decisions',
  'Spec review result',
];

function within(root, path) {
  const fromRoot = relative(root, path);
  return (
    fromRoot === '' ||
    (!isAbsolute(fromRoot) &&
      fromRoot !== '..' &&
      !fromRoot.startsWith(`..${sep}`))
  );
}

function sourceName(path, root) {
  const source = relative(root, path);
  return (source || path).split(sep).join('/');
}

function missingFields(contents) {
  return REQUIRED_FIELDS.filter((field) => {
    const escaped = field.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
    return !new RegExp(`^#{2,6}\\s+${escaped}\\s*$`, 'imu').test(contents);
  });
}

export async function validateComplexFeaturePreflight(path, repositoryRoot) {
  const root = resolve(repositoryRoot);
  const sourcePath = resolve(path);
  const source = sourceName(sourcePath, root);
  const contents = await readFile(sourcePath, 'utf8');
  const marker = contents.match(MARKER);

  if (!marker || marker[1] === 'exempt-low-risk') return [];

  let preflightContents = contents;
  if (marker[1].startsWith('linked')) {
    if (!marker[2]) {
      return [`${source}: linked marker requires a repository-relative path`];
    }
    const preflightPath = resolve(root, marker[2]);
    if (!within(root, preflightPath)) {
      return [
        `${source}: authoritative preflight must stay inside the repository`,
      ];
    }
    try {
      preflightContents = await readFile(preflightPath, 'utf8');
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      return [
        `${source}: authoritative preflight does not exist: ${marker[2]}`,
      ];
    }
  }

  return missingFields(preflightContents).map(
    (field) =>
      `${source}: complex-feature preflight is missing section "${field}"`,
  );
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : null;
if (invokedPath === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const advisory = args.includes('--advisory');
  const input = args.find((argument) => !argument.startsWith('--'));
  if (!input) {
    console.error(
      'Usage: node scripts/validate-complex-feature-preflight.mjs [--advisory] <issue-or-brief.md>',
    );
    process.exitCode = 2;
  } else {
    const repositoryRoot = resolve(
      fileURLToPath(new URL('../', import.meta.url)),
    );
    const errors = await validateComplexFeaturePreflight(input, repositoryRoot);
    if (errors.length === 0) {
      console.log('Complex-feature preflight is complete or not required.');
    } else if (advisory) {
      for (const error of errors) console.warn(`ADVISORY: ${error}`);
      console.warn(
        'Add the required preflight fields, link an authoritative preflight, or declare an exempt low-risk issue.',
      );
    } else {
      console.error(errors.join('\n'));
      process.exitCode = 1;
    }
  }
}
