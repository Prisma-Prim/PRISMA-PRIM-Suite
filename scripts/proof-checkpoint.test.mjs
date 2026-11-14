import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import {
  existsSync,
  lstatSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { after, test } from 'node:test';

const command = fileURLToPath(
  new URL('./proof-checkpoint.mjs', import.meta.url),
);
const temporary = mkdtempSync(join(tmpdir(), 'private-proof-'));
after(() => rmSync(temporary, { recursive: true, force: true }));

function fixture() {
  const parent = mkdtempSync(join(temporary, 'case-'));
  const root = join(parent, 'repo');
  execFileSync('git', ['init', '--quiet', '--initial-branch', 'main', root]);
  writeFileSync(join(root, 'README.md'), 'Synthetic checkpoint fixture.');
  execFileSync('git', ['-C', root, 'add', 'README.md']);
  execFileSync('git', [
    '-C',
    root,
    '-c',
    'user.name=Synthetic Fixture',
    '-c',
    'user.email=fixture@example.invalid',
    '-c',
    'commit.gpgsign=false',
    'commit',
    '--quiet',
    '-m',
    'seed',
  ]);
  return { parent, root, privateRoot: join(parent, 'private') };
}

function checkpoint(f, ...args) {
  return spawnSync(
    process.execPath,
    [command, ...args, ...(f.privateRoot ? ['--root', f.privateRoot] : [])],
    {
      cwd: f.root,
      encoding: 'utf8',
    },
  );
}

function begin(f) {
  const result = checkpoint(
    f,
    'begin',
    '--issue',
    '1367',
    '--check',
    'scripts',
  );
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout).run;
}

function metadata(f, run, kind = 'begin') {
  const relative = readdirSync(f.privateRoot, { recursive: true }).find(
    (file) => file.endsWith(`${run}.${kind}.json`),
  );
  assert.ok(relative);
  return join(f.privateRoot, relative);
}

test('a new process recovers a completed check without repeating its command', () => {
  const f = fixture();
  const begin = checkpoint(f, 'begin', '--issue', '1367', '--check', 'scripts');
  assert.equal(begin.status, 0, begin.stderr);
  const run = JSON.parse(begin.stdout).run;
  const counter = join(f.parent, 'counter');
  execFileSync(process.execPath, [
    '-e',
    "require('node:fs').writeFileSync(process.argv[1], '1')",
    counter,
  ]);
  const finish = checkpoint(
    f,
    'finish',
    '--issue',
    '1367',
    '--run',
    run,
    '--exit-code',
    '0',
  );
  assert.equal(finish.status, 0, finish.stderr);
  const resume = checkpoint(f, 'resume', '--issue', '1367');
  assert.equal(resume.status, 0, resume.stderr);
  const data = JSON.parse(resume.stdout);
  assert.equal(data.runs.length, 1);
  assert.equal(data.runs[0].status, 'recorded-pass');
  assert.equal(readFileSync(counter, 'utf8'), '1');
  assert.equal(
    execFileSync('git', ['-C', f.root, 'status', '--porcelain'], {
      encoding: 'utf8',
    }),
    '',
  );
});

test('rejects added Client data without echoing its value', () => {
  const f = fixture();
  const run = begin(f);
  const file = metadata(f, run);
  const value = JSON.parse(readFileSync(file, 'utf8'));
  value.clientName = 'SYNTHETIC_PRIVATE_CLIENT';
  writeFileSync(file, JSON.stringify(value));
  const result = checkpoint(f, 'resume', '--issue', '1367');
  assert.equal(result.status, 2);
  assert.doesNotMatch(
    result.stdout + result.stderr,
    /SYNTHETIC_PRIVATE_CLIENT/u,
  );
});

test('rejects free text hidden in a permissively parsed timestamp', () => {
  const f = fixture();
  const run = begin(f);
  const file = metadata(f, run);
  const value = JSON.parse(readFileSync(file, 'utf8'));
  value.startedAt = 'Jan 1 2026 (SYNTHETIC_PRIVATE_PAYLOAD)';
  assert.ok(Number.isFinite(Date.parse(value.startedAt)));
  writeFileSync(file, JSON.stringify(value));
  const result = checkpoint(f, 'resume', '--issue', '1367');
  assert.equal(result.status, 2);
  assert.doesNotMatch(
    result.stdout + result.stderr,
    /SYNTHETIC_PRIVATE_PAYLOAD/u,
  );
});

test('a dirty worktree never becomes a recorded passing checkpoint', () => {
  const f = fixture();
  const run = begin(f);
  writeFileSync(join(f.root, 'README.md'), 'Synthetic changed source.');
  const result = checkpoint(
    f,
    'finish',
    '--issue',
    '1367',
    '--run',
    run,
    '--exit-code',
    '0',
  );
  assert.equal(result.status, 0, result.stderr);
  assert.equal(JSON.parse(result.stdout).status, 'incomplete');
});

test('refuses a checkpoint root inside tracked source', () => {
  const f = fixture();
  f.privateRoot = join(f.root, '.prisma-agent-evidence');
  const result = checkpoint(
    f,
    'begin',
    '--issue',
    '1367',
    '--check',
    'scripts',
  );
  assert.equal(result.status, 2);
  assert.match(result.stderr, /outside every registered worktree/u);
});

test('changed commits remain historical rather than becoming current proof', () => {
  const f = fixture();
  const run = begin(f);
  const first = checkpoint(
    f,
    'finish',
    '--issue',
    '1367',
    '--run',
    run,
    '--exit-code',
    '0',
  );
  assert.equal(first.status, 0, first.stderr);
  writeFileSync(join(f.root, 'README.md'), 'Synthetic next commit.');
  execFileSync('git', ['-C', f.root, 'add', 'README.md']);
  execFileSync('git', [
    '-C',
    f.root,
    '-c',
    'user.name=Synthetic Fixture',
    '-c',
    'user.email=fixture@example.invalid',
    '-c',
    'commit.gpgsign=false',
    'commit',
    '--quiet',
    '-m',
    'next',
  ]);
  const resume = checkpoint(f, 'resume', '--issue', '1367');
  assert.equal(resume.status, 0, resume.stderr);
  assert.equal(JSON.parse(resume.stdout).runs[0].status, 'stale');
});

test('interrupted checks remain incomplete and issue namespaces stay separate', () => {
  const f = fixture();
  begin(f);
  const other = checkpoint(f, 'resume', '--issue', '1368');
  assert.equal(other.status, 0, other.stderr);
  assert.deepEqual(JSON.parse(other.stdout).runs, []);
  const resume = checkpoint(f, 'resume', '--issue', '1367');
  assert.equal(JSON.parse(resume.stdout).runs[0].status, 'incomplete');
});

test('equivalent completion is idempotent and conflicting results cannot replace it', () => {
  const f = fixture();
  const run = begin(f);
  const first = checkpoint(
    f,
    'finish',
    '--issue',
    '1367',
    '--run',
    run,
    '--exit-code',
    '0',
  );
  assert.equal(first.status, 0, first.stderr);
  const file = metadata(f, run, 'end');
  const bytes = readFileSync(file, 'utf8');
  const again = checkpoint(
    f,
    'finish',
    '--issue',
    '1367',
    '--run',
    run,
    '--exit-code',
    '0',
  );
  assert.equal(again.status, 0, again.stderr);
  assert.equal(readFileSync(file, 'utf8'), bytes);
  const conflict = checkpoint(
    f,
    'finish',
    '--issue',
    '1367',
    '--run',
    run,
    '--exit-code',
    '1',
  );
  assert.equal(conflict.status, 2);
  assert.equal(readFileSync(file, 'utf8'), bytes);
});

test('default evidence survives removal of the linked worktree', () => {
  const f = fixture();
  f.privateRoot = undefined;
  const linked = join(f.root, '.worktrees/proof');
  writeFileSync(join(f.root, '.git/info/exclude'), '\n.worktrees/\n');
  execFileSync('git', [
    '-C',
    f.root,
    'worktree',
    'add',
    '--quiet',
    '-b',
    'synthetic-proof',
    linked,
  ]);
  const child = { ...f, root: linked };
  const run = begin(child);
  const finish = checkpoint(
    child,
    'finish',
    '--issue',
    '1367',
    '--run',
    run,
    '--exit-code',
    '0',
  );
  assert.equal(finish.status, 0, finish.stderr);
  execFileSync('git', ['-C', f.root, 'worktree', 'remove', linked]);
  assert.ok(!existsSync(linked));
  const resume = checkpoint(f, 'resume', '--issue', '1367');
  assert.equal(resume.status, 0, resume.stderr);
  assert.equal(JSON.parse(resume.stdout).runs[0].status, 'recorded-pass');
  assert.ok(existsSync(join(f.parent, '.prisma-agent-evidence')));
});

test('a symlink root cannot redirect evidence into source', () => {
  const f = fixture();
  symlinkSync(
    f.root,
    f.privateRoot,
    process.platform === 'win32' ? 'junction' : 'dir',
  );
  const result = checkpoint(
    f,
    'begin',
    '--issue',
    '1367',
    '--check',
    'scripts',
  );
  assert.equal(result.status, 2);
  assert.match(result.stderr, /symlinks/u);
});

test('a metadata symlink is refused before its target can be read', (t) => {
  const f = fixture();
  const run = begin(f);
  const file = metadata(f, run);
  const target = join(f.parent, 'unreadable-private.json');
  writeFileSync(target, 'SYNTHETIC_PRIVATE_BYTES');
  unlinkSync(file);
  try {
    symlinkSync(target, file, 'file');
  } catch (error) {
    if (process.platform === 'win32' && error.code === 'EPERM')
      return t.skip('Windows account cannot create a file symlink.');
    throw error;
  }
  const result = checkpoint(f, 'resume', '--issue', '1367');
  assert.equal(result.status, 2);
  assert.match(result.stderr, /private regular file/u);
  assert.doesNotMatch(
    result.stdout + result.stderr,
    /SYNTHETIC_PRIVATE_BYTES/u,
  );
});

test(
  'private files and directories have owner-only POSIX modes',
  {
    skip:
      process.platform === 'win32'
        ? 'POSIX modes do not certify Windows ACLs.'
        : false,
  },
  () => {
    const f = fixture();
    const run = begin(f);
    assert.equal(lstatSync(f.privateRoot).mode & 0o777, 0o700);
    assert.equal(lstatSync(metadata(f, run)).mode & 0o777, 0o600);
  },
);

for (const [flag, value] of [
  ['--image', 'SYNTHETIC_PRIVATE_IMAGE.png'],
  ['--token', 'SYNTHETIC_PRIVATE_TOKEN'],
  ['--notes', 'SYNTHETIC_PRIVATE_CLIENT'],
]) {
  test('rejects arbitrary input fields without displaying their values', () => {
    const f = fixture();
    const result = checkpoint(
      f,
      'begin',
      '--issue',
      '1367',
      '--check',
      'scripts',
      flag,
      value,
    );
    assert.equal(result.status, 2);
    assert.doesNotMatch(result.stdout + result.stderr, /SYNTHETIC_PRIVATE/u);
  });
}

test('run identifiers cannot traverse directories', () => {
  const f = fixture();
  begin(f);
  const result = checkpoint(
    f,
    'finish',
    '--issue',
    '1367',
    '--run',
    '../../SYNTHETIC_PRIVATE',
    '--exit-code',
    '0',
  );
  assert.equal(result.status, 2);
  assert.doesNotMatch(result.stdout + result.stderr, /SYNTHETIC_PRIVATE/u);
});
