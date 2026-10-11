import { spawnSync } from 'node:child_process';
import { appendFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const DOCUMENTATION_FILE = /^docs\/(?:[^/]+\/)*[^/]+\.md$/u;

/**
 * Classifies one change as documentation-only. It answers true only for a
 * pull request whose changed-file list was read and contains nothing but
 * Markdown under docs/; every doubt answers false so CI runs everything.
 */
export function isDocumentationOnly({ event, files }) {
  if (event !== 'pull_request') return false;
  if (!Array.isArray(files) || files.length === 0) return false;
  return files.every(
    (file) => typeof file === 'string' && DOCUMENTATION_FILE.test(file),
  );
}

/**
 * The exact changed paths between two commits, or undefined when git fails.
 * NUL-delimited output keeps every path byte-for-byte: no quoting, no
 * trimming, so a name with leading spaces cannot pass as a docs/ path.
 */
export function changedFiles(base, head, run = spawnSync) {
  if (!base || !head) return undefined;
  const result = run(
    'git',
    ['diff', '--name-only', '--no-renames', '-z', `${base}...${head}`],
    { encoding: 'utf8' },
  );
  if (result.error || result.status !== 0) return undefined;
  return result.stdout.split('\0').filter((path) => path.length > 0);
}

function argument(name) {
  const index = process.argv.indexOf(name);
  return index === -1 ? undefined : process.argv[index + 1];
}

function main() {
  // Locally: `node scripts/ci-change-scope.mjs --base origin/main` compares
  // the current branch with main. In CI the workflow passes the event and
  // the pull request's base and head commits through the environment.
  const localBase = argument('--base');
  const event = localBase ? 'pull_request' : process.env.EVENT_NAME;
  const base = localBase ?? process.env.BASE_SHA;
  const head = localBase ? 'HEAD' : process.env.HEAD_SHA;
  let documentationOnly;
  try {
    documentationOnly = isDocumentationOnly({
      event,
      files: changedFiles(base, head),
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
