import { spawnSync } from 'node:child_process';
import { appendFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const DOCUMENTATION_FILE = /^docs\/(?:[^/]+\/)*[^/]+\.md$/u;

/**
 * Classifies one change as documentation-only. It answers true only for a
 * pull request or ordinary main push whose complete changed-file list was
 * proven and contains only allowed documents. Every doubt runs everything.
 */
export function isDocumentationOnly({ event, ref, forced, files }) {
  if (
    event !== 'pull_request' &&
    !(event === 'push' && ref === 'refs/heads/main' && forced === false)
  )
    return false;
  if (!Array.isArray(files) || files.length === 0) return false;
  for (const file of files) {
    if (
      typeof file !== 'string' ||
      !(file === 'AGENTS.md' || DOCUMENTATION_FILE.test(file)) ||
      file.includes('\0') ||
      file.split('/').some((segment) => segment === '.' || segment === '..')
    )
      return false;
  }
  return true;
}

/**
 * The exact changed paths between two commits, or undefined when git fails.
 * NUL-delimited output keeps every path byte-for-byte: no quoting, no
 * trimming, so a name with leading spaces cannot pass as a docs/ path.
 */
export function changedFiles(
  base,
  head,
  run = spawnSync,
  { requireAncestor = false } = {},
) {
  if (!base || !head) return undefined;
  if (requireAncestor) {
    // Push metadata must name available commits, never a new branch's zero
    // before revision. A divergent push cannot use a merge-base comparison.
    const commit = /^(?!0{40}$)[0-9a-f]{40}$/u;
    if (!commit.test(base) || !commit.test(head)) return undefined;
    const checkout = run('git', ['rev-parse', '--verify', 'HEAD'], {
      encoding: 'utf8',
    });
    if (
      checkout.error ||
      checkout.status !== 0 ||
      checkout.stdout !== `${head}\n`
    )
      return undefined;
    const ancestry = run('git', ['merge-base', '--is-ancestor', base, head], {
      encoding: 'utf8',
    });
    if (ancestry.error || ancestry.status !== 0) return undefined;
  }
  const result = run(
    'git',
    [
      'diff',
      '--name-only',
      '--no-renames',
      '-z',
      requireAncestor ? `${base}..${head}` : `${base}...${head}`,
    ],
    { encoding: 'utf8' },
  );
  if (
    result.error ||
    result.status !== 0 ||
    typeof result.stdout !== 'string' ||
    (result.stdout !== '' && !result.stdout.endsWith('\0'))
  )
    return undefined;
  if (result.stdout === '') return [];
  const files = result.stdout.slice(0, -1).split('\0');
  return files.some((path) => path.length === 0) ? undefined : files;
}

function argument(name) {
  const index = process.argv.indexOf(name);
  return index === -1 ? undefined : process.argv[index + 1];
}

function main() {
  // Locally: `node scripts/ci-change-scope.mjs --base origin/main` compares
  // the current branch with main. CI supplies the event and its complete
  // base/before and head commits through the environment.
  const localBase = argument('--base');
  const event = localBase ? 'pull_request' : process.env.EVENT_NAME;
  const base = localBase ?? process.env.BASE_SHA;
  const head = localBase ? 'HEAD' : process.env.HEAD_SHA;
  let documentationOnly;
  try {
    documentationOnly = isDocumentationOnly({
      event,
      ref: process.env.EVENT_REF,
      forced: process.env.PUSH_FORCED === 'false' ? false : undefined,
      files: changedFiles(base, head, spawnSync, {
        requireAncestor: event === 'push',
      }),
    });
  } catch {
    documentationOnly = false;
  }
  const line = `docs_only=${documentationOnly ? 'true' : 'false'}`;
  console.log(line);
  if (process.env.GITHUB_OUTPUT)
    appendFileSync(process.env.GITHUB_OUTPUT, `${line}\n`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
