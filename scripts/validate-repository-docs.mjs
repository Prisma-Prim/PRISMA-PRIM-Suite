#!/usr/bin/env node

import { lstat, readdir, readFile, realpath } from 'node:fs/promises';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import { fromMarkdown } from 'mdast-util-from-markdown';

const OBSOLETE_REPOSITORY = 'Dan-Popescu/PRISMA-PRIM-Suite';
const DOCUMENTATION_PATHS = [
  'README.md',
  'AGENTS.md',
  'CONTEXT.md',
  'docs/agents',
  'docs/adr',
  'docs/product',
];
const REPOSITORY_REFERENCE_FILES = [
  '.github/ISSUE_TEMPLATE/agent-friction.yml',
];

async function collectFiles(repositoryRoot, configuredPaths, extension) {
  const files = [];

  async function visit(path) {
    const absolutePath = resolve(repositoryRoot, path);
    let pathStats;
    try {
      pathStats = await lstat(absolutePath);
    } catch (error) {
      if (error.code === 'ENOENT') return;
      throw error;
    }

    if (pathStats.isSymbolicLink()) return;

    if (pathStats.isDirectory()) {
      const entries = await readdir(absolutePath, { withFileTypes: true });
      for (const entry of entries.sort((left, right) =>
        left.name.localeCompare(right.name),
      )) {
        await visit(join(path, entry.name));
      }
      return;
    }

    if (!extension || path.endsWith(extension)) files.push(absolutePath);
  }

  for (const path of configuredPaths) await visit(path);
  return [...new Set(files)].sort();
}

function lineNumberAt(contents, index) {
  return contents.slice(0, index).split('\n').length;
}

function maskCharacters(contents) {
  return contents.replace(/[^\r\n]/gu, ' ');
}

function maskFrontmatter(contents) {
  const lines = contents.match(/[^\n]*\n|[^\n]+$/gu) ?? [];
  if (!/^\uFEFF?---[ \t]*(?:\r?\n)?$/u.test(lines[0] ?? '')) {
    return contents;
  }

  const closingIndex = lines.findIndex(
    (line, index) =>
      index > 0 && /^(?:---|\.\.\.)[ \t]*(?:\r?\n)?$/u.test(line),
  );
  if (closingIndex === -1) return contents;

  return lines
    .map((line, index) => (index <= closingIndex ? maskCharacters(line) : line))
    .join('');
}

function markdownTargets(contents) {
  const definitions = new Map();
  const referencedDefinitions = new Set();
  const targets = [];

  function visit(node) {
    if (node.type === 'link' || node.type === 'image') {
      targets.push({ line: node.position.start.line, target: node.url });
    } else if (
      node.type === 'linkReference' ||
      node.type === 'imageReference'
    ) {
      referencedDefinitions.add(node.identifier);
    } else if (
      node.type === 'definition' &&
      !node.identifier.startsWith('^') &&
      !definitions.has(node.identifier)
    ) {
      definitions.set(node.identifier, node);
    }

    for (const child of node.children ?? []) visit(child);
  }

  visit(fromMarkdown(maskFrontmatter(contents)));
  for (const identifier of referencedDefinitions) {
    const definition = definitions.get(identifier);
    if (definition) {
      targets.push({
        line: definition.position.start.line,
        target: definition.url,
      });
    }
  }

  return targets;
}

function isExternal(target) {
  return target.startsWith('//') || /^[a-z][a-z\d+.-]*:/iu.test(target);
}

function isWithinRepository(repositoryRoot, targetPath) {
  const pathFromRoot = relative(repositoryRoot, targetPath);
  return (
    pathFromRoot === '' ||
    (!isAbsolute(pathFromRoot) &&
      pathFromRoot !== '..' &&
      !pathFromRoot.startsWith(`..${sep}`))
  );
}

export async function validateRepositoryDocs(repositoryRoot) {
  const errors = [];
  const resolvedRepositoryRoot = resolve(repositoryRoot);
  const realRepositoryRoot = await realpath(resolvedRepositoryRoot);
  const contentsByPath = new Map();
  const contentsFor = async (path) => {
    if (!contentsByPath.has(path)) {
      contentsByPath.set(path, await readFile(path, 'utf8'));
    }
    return contentsByPath.get(path);
  };
  const markdownFiles = await collectFiles(
    resolvedRepositoryRoot,
    DOCUMENTATION_PATHS,
    '.md',
  );
  const referenceFiles = [
    ...markdownFiles,
    ...(await collectFiles(resolvedRepositoryRoot, REPOSITORY_REFERENCE_FILES)),
  ];

  for (const absolutePath of referenceFiles) {
    const contents = await contentsFor(absolutePath);
    const source = relative(resolvedRepositoryRoot, absolutePath)
      .split(sep)
      .join('/');
    const obsoleteIndex = contents.indexOf(OBSOLETE_REPOSITORY);

    if (obsoleteIndex !== -1) {
      errors.push(
        `${source}:${lineNumberAt(contents, obsoleteIndex)}: obsolete repository reference "${OBSOLETE_REPOSITORY}"`,
      );
    }
  }

  for (const absolutePath of markdownFiles) {
    const contents = await contentsFor(absolutePath);
    const source = relative(resolvedRepositoryRoot, absolutePath)
      .split(sep)
      .join('/');

    for (const { line, target } of markdownTargets(contents)) {
      if (isExternal(target)) continue;

      const encodedPath = target.split('#', 1)[0].split('?', 1)[0];
      if (!encodedPath) continue;

      let decodedPath;
      try {
        decodedPath = decodeURIComponent(encodedPath);
      } catch {
        errors.push(
          `${source}:${line}: invalid local Markdown link target "${target}"`,
        );
        continue;
      }

      if (decodedPath.includes('\0')) {
        errors.push(
          `${source}:${line}: invalid local Markdown link target "${target}"`,
        );
        continue;
      }

      const targetPath = decodedPath.startsWith('/')
        ? resolve(resolvedRepositoryRoot, `.${decodedPath}`)
        : resolve(dirname(absolutePath), decodedPath);
      if (!isWithinRepository(resolvedRepositoryRoot, targetPath)) {
        errors.push(
          `${source}:${line}: local Markdown link target escapes repository "${target}"`,
        );
        continue;
      }

      let realTargetPath;
      try {
        realTargetPath = await realpath(targetPath);
      } catch (error) {
        if (!['ENOENT', 'ENOTDIR', 'ELOOP'].includes(error.code)) throw error;
        errors.push(
          `${source}:${line}: broken local Markdown link target "${target}"`,
        );
        continue;
      }

      if (!isWithinRepository(realRepositoryRoot, realTargetPath)) {
        errors.push(
          `${source}:${line}: local Markdown link target escapes repository "${target}"`,
        );
      }
    }
  }

  return errors.sort();
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : null;
if (invokedPath === fileURLToPath(import.meta.url)) {
  const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const errors = await validateRepositoryDocs(repositoryRoot);
  if (errors.length > 0) {
    console.error(errors.join('\n'));
    process.exitCode = 1;
  } else {
    console.log('Repository documentation references are valid.');
  }
}
