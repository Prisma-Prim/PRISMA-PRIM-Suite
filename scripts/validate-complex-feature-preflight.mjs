#!/usr/bin/env node

import { readFile, realpath } from 'node:fs/promises';
import { isAbsolute, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const MARKER =
  /^\s*<!--\s*complex-feature-preflight:\s*(required|exempt-low-risk|linked(?:\s+([^\s]+))?)\s*-->\s*$/gimu;
const SPEC_REVIEW_MARKER =
  /^\s*<!--\s*pre-code-spec-review:\s*approved\s*-->\s*$/gimu;
const MACHINE_MARKER_COMMENT =
  /^<!--\s*(?:complex-feature-preflight:\s*(?:required|exempt-low-risk|linked(?:\s+[^\s]+)?)|pre-code-spec-review:\s*approved)\s*-->$/iu;
const REQUIRED_FIELDS = [
  'States and transitions',
  'Actors and identities',
  'Mutation contract',
  'Data authority',
  'Surfaces',
  'Test matrix',
  'Exclusions and unresolved decisions',
];

export function withoutCodeExamples(contents) {
  let fence = null;
  const withoutFencedOrIndentedCode = contents
    .split(/\r?\n/u)
    .map((line) => {
      if (fence) {
        const closing = new RegExp(
          `^ {0,3}${fence.character}{${fence.length},}\\s*$`,
          'u',
        );
        if (closing.test(line)) fence = null;
        return '';
      }

      const opening = /^ {0,3}(`{3,}|~{3,})/u.exec(line);
      if (opening) {
        fence = {
          character: opening[1][0],
          length: opening[1].length,
        };
        return '';
      }
      return /^(?: {4}|\t)/u.test(line) ? '' : line;
    })
    .join('\n');
  return withoutFencedOrIndentedCode
    .replace(/(?<!`)(`+)[\s\S]*?\1(?!`)/gu, '')
    .replace(/<(pre|code)\b[^>]*>[\s\S]*?<\/\1\s*>/giu, '')
    .replace(/<(?:pre|code)\b[^>]*>[\s\S]*$/giu, '');
}

function visiblePreflightContents(contents) {
  const machineMarkers = [];
  let placeholderPrefix = '__PRISMA_MACHINE_MARKER_';
  while (contents.includes(placeholderPrefix)) {
    placeholderPrefix = `_${placeholderPrefix}`;
  }
  let visible = withoutCodeExamples(contents)
    .replace(/<!--[\s\S]*?-->/gu, (comment) => {
      if (!MACHINE_MARKER_COMMENT.test(comment.trim())) return '';
      const index = machineMarkers.push(comment) - 1;
      return `${placeholderPrefix}${index}__`;
    })
    .replace(/<!--[\s\S]*$/u, '');
  for (const [index, marker] of machineMarkers.entries()) {
    visible = visible.replace(`${placeholderPrefix}${index}__`, marker);
  }
  return visible;
}

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
    if (field === 'Exclusions and unresolved decisions') {
      return !/^#{2,6}\s+(?:Exclusions and unresolved decisions|Exclusions)\s*$/imu.test(
        contents,
      );
    }
    const escaped = field.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
    return !new RegExp(`^#{2,6}\\s+${escaped}\\s*$`, 'imu').test(contents);
  });
}

function hasConcreteExemptionReason(contents) {
  const reason = contents
    .match(/^\s*-\s*Exemption reason:[^\S\r\n]*(.+)$/imu)?.[1]
    .trim();
  return Boolean(
    reason &&
    !/^(?:n\/?a|none|not-applicable)$/iu.test(reason) &&
    !/^(?:todo|tbd|placeholder|replace\b)/iu.test(reason),
  );
}

function specReviewMarkerErrors(contents, source) {
  const markers = [...contents.matchAll(SPEC_REVIEW_MARKER)];
  if (markers.length === 1) return [];
  return [
    `${source}: expected exactly one pre-code Spec review marker, found ${markers.length}`,
  ];
}

export function getComplexFeaturePreflightDisposition(contents) {
  const markers = [...visiblePreflightContents(contents).matchAll(MARKER)];
  if (markers.length !== 1) return null;
  if (markers[0][1].startsWith('linked')) {
    return `linked ${markers[0][2] ?? ''}`.trim();
  }
  return markers[0][1];
}

export async function validateComplexFeaturePreflightContents(
  contents,
  { repositoryRoot, source = 'input', requireApprovedSpecReview = false },
) {
  const root = resolve(
    repositoryRoot instanceof URL
      ? fileURLToPath(repositoryRoot)
      : repositoryRoot,
  );
  const visibleContents = visiblePreflightContents(contents);
  const markers = [...visibleContents.matchAll(MARKER)];

  if (markers.length !== 1) {
    return [
      `${source}: expected exactly one complex-feature preflight marker, found ${markers.length}`,
    ];
  }

  const marker = markers[0];
  if (marker[1] === 'exempt-low-risk') {
    const errors = [];
    if (!hasConcreteExemptionReason(visibleContents)) {
      errors.push(`${source}: exemption requires a concrete Exemption reason`);
    }
    if (requireApprovedSpecReview) {
      errors.push(...specReviewMarkerErrors(visibleContents, source));
    }
    return errors;
  }

  let preflightContents = visibleContents;
  let specReviewContents = visibleContents;
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
      const [canonicalRoot, canonicalPreflightPath] = await Promise.all([
        realpath(root),
        realpath(preflightPath),
      ]);
      if (!within(canonicalRoot, canonicalPreflightPath)) {
        return [
          `${source}: authoritative preflight must stay inside the repository`,
        ];
      }
      preflightContents = visiblePreflightContents(
        await readFile(canonicalPreflightPath, 'utf8'),
      );
      specReviewContents = `${visibleContents}\n${preflightContents}`;
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      return [
        `${source}: authoritative preflight does not exist: ${marker[2]}`,
      ];
    }
  }

  const errors = missingFields(preflightContents).map(
    (field) =>
      `${source}: complex-feature preflight is missing section "${field}"`,
  );
  errors.push(...specReviewMarkerErrors(specReviewContents, source));
  return errors;
}

export async function validateComplexFeaturePreflight(path, repositoryRoot) {
  const root = resolve(repositoryRoot);
  const sourcePath = resolve(path);
  const source = sourceName(sourcePath, root);
  const contents = await readFile(sourcePath, 'utf8');
  return validateComplexFeaturePreflightContents(contents, {
    repositoryRoot: root,
    source,
  });
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
      console.log('Complex-feature preflight declaration is valid.');
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
