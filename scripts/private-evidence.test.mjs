import assert from 'node:assert/strict';
import { execFileSync, fork, spawnSync } from 'node:child_process';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { after, test } from 'node:test';
import { privateEvidencePaths, readPrivateJson } from './private-evidence.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const temporary = mkdtempSync(join(tmpdir(), 'private-evidence-guard-'));
after(() => rmSync(temporary, { recursive: true, force: true }));

test('tracked repository files contain no private runtime evidence', () => {
  const files = execFileSync('git', ['-C', root, 'ls-files', '-z'], {
    encoding: 'utf8',
  })
    .split('\0')
    .filter(Boolean);
  assert.equal(
    privateEvidencePaths(files).length,
    0,
    'Private runtime evidence cannot be tracked.',
  );
});

test('private checkpoint roots are ignored and forced tracking remains detectable', () => {
  const repository = join(temporary, 'repo');
  execFileSync('git', ['init', '--quiet', repository]);
  writeFileSync(
    join(repository, '.gitignore'),
    readFileSync(join(root, '.gitignore'), 'utf8'),
  );
  mkdirSync(join(repository, '.prisma-agent-evidence'));
  writeFileSync(join(repository, '.prisma-agent-evidence/run.json'), '{}');
  const ignored = spawnSync('git', [
    '-C',
    repository,
    'check-ignore',
    '.prisma-agent-evidence/run.json',
  ]);
  assert.equal(ignored.status, 0);
  execFileSync('git', [
    '-C',
    repository,
    'add',
    '--force',
    '.prisma-agent-evidence/run.json',
  ]);
  const files = execFileSync('git', ['-C', repository, 'ls-files', '-z'], {
    encoding: 'utf8',
  })
    .split('\0')
    .filter(Boolean);
  assert.equal(privateEvidencePaths(files).length, 1);
});

test(
  'simultaneous writers publish one complete immutable record',
  { timeout: 15_000 },
  async () => {
    const directory = mkdtempSync(join(temporary, 'atomic-'));
    const file = join(directory, 'record.json');
    const workerFile = join(directory, 'writer.mjs');
    const module = new URL('./private-evidence.mjs', import.meta.url).href;
    writeFileSync(
      workerFile,
      `import { writePrivateJson } from ${JSON.stringify(module)};
process.send('ready');
process.once('message', () => {
  const result = Number(process.argv[3]);
  const created = writePrivateJson(process.argv[2], { result });
  process.send({ created, result }, () => process.disconnect());
});
`,
    );
    const workers = [0, 1].map((value) => {
      const child = fork(workerFile, [file, String(value)], {
        silent: true,
        execArgv: [],
      });
      let readyResolve, readyReject, doneResolve, doneReject;
      let result;
      const ready = new Promise((resolve, reject) => {
        readyResolve = resolve;
        readyReject = reject;
      });
      const done = new Promise((resolve, reject) => {
        doneResolve = resolve;
        doneReject = reject;
      });
      child.on('message', (message) => {
        if (message === 'ready') readyResolve();
        else result = message;
      });
      child.once('error', (error) => {
        readyReject(error);
        doneReject(error);
      });
      child.once('exit', (code) => {
        if (code === 0 && result) doneResolve(result);
        else {
          const error = new Error('Synthetic writer did not finish.');
          readyReject(error);
          doneReject(error);
        }
      });
      return { child, ready, done };
    });
    try {
      await Promise.all(workers.map((worker) => worker.ready));
      for (const worker of workers) worker.child.send('publish');
      const outcomes = await Promise.all(workers.map((worker) => worker.done));
      assert.equal(outcomes.filter((outcome) => outcome.created).length, 1);
      assert.equal(
        readPrivateJson(file).result,
        outcomes.find((outcome) => outcome.created).result,
      );
    } finally {
      for (const worker of workers)
        if (worker.child.exitCode === null) worker.child.kill();
    }
  },
);
