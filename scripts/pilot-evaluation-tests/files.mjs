import assert from 'node:assert/strict';
import test from 'node:test';
import { spawn, spawnSync } from 'node:child_process';
import {
  cpSync,
  existsSync,
  linkSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { basename, dirname, join } from 'node:path';
import {
  command,
  receipt,
  limitation,
  invoke,
  setup,
  diagnostic,
  successful,
  preload,
} from './support.mjs';

test('input byte limit accepts the exact limit and rejects its first overflow byte before output', (t) => {
  const input = setup(t);
  const exact = Buffer.concat([
    input.cases,
    Buffer.alloc(1048576 - input.cases.length, 0x20),
  ]);
  writeFileSync(input.casesPath, exact);
  assert.equal(invoke(input.args).status, 0);
  writeFileSync(input.casesPath, Buffer.concat([exact, Buffer.from(' ')]));
  const second = join(input.directory, 'second');
  diagnostic(
    invoke([...input.args.slice(0, -1), second]),
    'E_INPUT_LIMIT',
    'cases',
  );
  assert.equal(existsSync(second), false);
  assert.deepEqual(
    readFileSync(input.casesPath),
    Buffer.concat([exact, Buffer.from(' ')]),
  );
});

test('regular-file and exclusive private output boundaries preserve prior content', (t) => {
  const input = setup(t);
  const link = join(input.directory, 'link.json');
  symlinkSync(input.casesPath, link);
  diagnostic(
    invoke(['--cases', link, ...input.args.slice(2)]),
    'E_INPUT_FILE',
    'cases',
  );
  diagnostic(
    invoke(['--cases', input.directory, ...input.args.slice(2)]),
    'E_INPUT_FILE',
    'cases',
  );
  mkdirSync(input.output);
  writeFileSync(join(input.output, 'sentinel'), 'preserve');
  diagnostic(invoke(input.args), 'E_OUTPUT_EXISTS', 'output');
  assert.equal(
    readFileSync(join(input.output, 'sentinel'), 'utf8'),
    'preserve',
  );
  const output = join(input.directory, 'new-result');
  const execution = invoke([...input.args.slice(0, -1), output]);
  assert.equal(execution.status, 0, execution.stderr);
  assert.deepEqual(readdirSync(output).sort(), ['report.md', 'result.json']);
  assert.equal(statSync(output).mode & 0o777, 0o700);
  for (const name of ['result.json', 'report.md'])
    assert.equal(statSync(join(output, name)).mode & 0o777, 0o600);
});

test('unsafe input components, aliases, devices and unsafe output paths are refused unchanged', (t) => {
  const input = setup(t);
  const linkedParent = join(input.directory, 'linked-parent');
  symlinkSync(input.directory, linkedParent);
  const alias = join(input.directory, 'same-file.json');
  linkSync(input.casesPath, alias);
  for (const path of [
    join(linkedParent, 'cases.json'),
    `${linkedParent}/../${basename(input.directory)}/cases.json`,
    `${input.casesPath}/../cases.json`,
    input.directory,
    '/dev/null',
    join(input.directory, 'missing.json'),
  ])
    diagnostic(
      invoke(['--cases', path, ...input.args.slice(2)]),
      'E_INPUT_FILE',
      'cases',
    );
  for (const path of [input.casesPath, alias])
    diagnostic(
      invoke([
        '--cases',
        input.casesPath,
        '--runs',
        path,
        '--output',
        input.output,
      ]),
      'E_INPUT_FILE',
      'runs',
    );
  const fifo = join(input.directory, 'fifo');
  assert.equal(spawnSync('mkfifo', [fifo]).status, 0);
  diagnostic(
    invoke(['--cases', fifo, ...input.args.slice(2)]),
    'E_INPUT_FILE',
    'cases',
  );
  const withinRepository = join(
    dirname(command),
    `pilot-output-${basename(input.directory)}`,
  );
  t.after(() => rmSync(withinRepository, { recursive: true, force: true }));
  for (const path of [
    input.casesPath,
    input.directory,
    join(linkedParent, 'new'),
    join(input.directory, 'missing-parent', 'new'),
    join(input.casesPath, 'new'),
    `${input.casesPath}/../new`,
    withinRepository,
  ]) {
    diagnostic(
      invoke([...input.args.slice(0, -1), path]),
      'E_OUTPUT_PATH',
      'output',
    );
  }
  const dangling = join(input.directory, 'dangling');
  symlinkSync(join(input.directory, 'absent'), dangling);
  diagnostic(
    invoke([...input.args.slice(0, -1), dangling]),
    'E_OUTPUT_EXISTS',
    'output',
  );
  const occupied = join(input.directory, 'occupied');
  mkdirSync(occupied);
  diagnostic(
    invoke([...input.args.slice(0, -1), occupied]),
    'E_OUTPUT_EXISTS',
    'output',
  );
  const targetLink = join(input.directory, 'target-link');
  symlinkSync(occupied, targetLink);
  diagnostic(
    invoke([...input.args.slice(0, -1), targetLink]),
    'E_OUTPUT_EXISTS',
    'output',
  );
  assert.deepEqual(readFileSync(input.casesPath), input.cases);
  assert.deepEqual(readFileSync(input.runsPath), input.runs);
});

test('private POSIX permissions are exact even with a restrictive inherited umask', (t) => {
  const input = setup(t);
  const execution = invoke(input.args, {
    nodeArgs: preload(input, 'process.umask(0o777);'),
  });
  assert.equal(execution.status, 0, execution.stderr);
  assert.equal(statSync(input.output).mode & 0o777, 0o700);
  assert.equal(statSync(join(input.output, 'result.json')).mode & 0o777, 0o600);
  assert.equal(statSync(join(input.output, 'report.md')).mode & 0o777, 0o600);
});

test('same-target concurrency allows one complete owner after both validate an absent target', async (t) => {
  const input = setup(t);
  const nodeArgs = preload(
    input,
    `
import fs from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
const mkdir = fs.mkdirSync;
fs.mkdirSync = function (path, options) {
  if (path === ${JSON.stringify(input.output)}) {
    fs.writeFileSync(path + '.ready.' + process.pid, '', { flag: 'wx' });
    const deadline = Date.now() + 5000;
    while (fs.readdirSync(${JSON.stringify(input.directory)}).filter((x) => x.startsWith('result.ready.')).length < 2) {
      if (Date.now() > deadline) throw new Error('concurrency barrier timed out');
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 5);
    }
  }
  return mkdir(path, options);
};
syncBuiltinESMExports();`,
  );
  const concurrent = () =>
    new Promise((resolve, reject) => {
      const child = spawn(
        process.execPath,
        [...nodeArgs, command, ...input.args],
        { env: { PATH: process.env.PATH }, stdio: ['ignore', 'pipe', 'pipe'] },
      );
      let stdout = '';
      let stderr = '';
      const timeout = setTimeout(() => {
        child.kill('SIGKILL');
        reject(new Error('public command exceeded concurrency deadline'));
      }, 10000);
      child.stdout.on('data', (chunk) => {
        stdout += chunk;
      });
      child.stderr.on('data', (chunk) => {
        stderr += chunk;
      });
      child.on('error', reject);
      child.on('close', (status) => {
        clearTimeout(timeout);
        resolve({ status, stdout, stderr });
      });
    });
  const executions = await Promise.all([concurrent(), concurrent()]);
  assert.deepEqual(executions.map((r) => r.status).sort(), [0, 3]);
  assert.equal(executions.find((r) => r.status === 0).stdout, receipt);
  diagnostic(
    executions.find((r) => r.status === 3),
    'E_OUTPUT_EXISTS',
    'output',
  );
  assert.deepEqual(readdirSync(input.output).sort(), [
    'report.md',
    'result.json',
  ]);
  assert.equal(
    JSON.parse(readFileSync(join(input.output, 'result.json'))).aggregate.time
      .reductionPercent,
    '50.000000',
  );
  assert.ok(
    readFileSync(join(input.output, 'report.md'), 'utf8').includes(limitation),
  );
});

test('write failures remove only owned partial output and recover at a new target', (t) => {
  const input = setup(t);
  const nodeArgs = preload(
    input,
    `
import fs from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
const write = fs.writeFileSync;
let writes = 0;
fs.writeFileSync = function (...args) {
  if (typeof args[0] === 'number' && ++writes === 2) throw new Error('SECRET-RAW-OS-FAILURE');
  return write(...args);
};
syncBuiltinESMExports();`,
  );
  const execution = invoke(input.args, { nodeArgs });
  const error = diagnostic(execution, 'E_OUTPUT_WRITE', 'output');
  assert.ok(error.message.includes('removed'));
  assert.ok(!execution.stderr.includes('SECRET-RAW-OS-FAILURE'));
  assert.equal(existsSync(input.output), false);
  assert.deepEqual(readFileSync(input.casesPath), input.cases);
  assert.deepEqual(readFileSync(input.runsPath), input.runs);
  assert.equal(
    invoke([...input.args.slice(0, -1), join(input.directory, 'recovered')])
      .status,
    0,
  );
});

test('a directory moved between artifact writes cannot produce success or alter its replacement', (t) => {
  const input = setup(t);
  const moved = `${input.output}-moved`;
  const nodeArgs = preload(
    input,
    `
import fs from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
const target = ${JSON.stringify(input.output)};
const write = fs.writeFileSync;
let writes = 0;
fs.writeFileSync = function (...args) {
  const result = write(...args);
  if (typeof args[0] === 'number' && ++writes === 1) {
    fs.renameSync(target, target + '-moved');
    fs.mkdirSync(target, { mode: 0o700 });
    write(target + '/sentinel', 'FOREIGN-SENTINEL');
  }
  return result;
};
syncBuiltinESMExports();`,
  );
  const error = diagnostic(
    invoke(input.args, { nodeArgs }),
    'E_OUTPUT_WRITE',
    'output',
  );
  assert.ok(error.message.includes('incomplete'));
  assert.deepEqual(readdirSync(moved), ['result.json']);
  assert.deepEqual(readdirSync(input.output), ['sentinel']);
  assert.equal(
    readFileSync(join(input.output, 'sentinel'), 'utf8'),
    'FOREIGN-SENTINEL',
  );
  assert.deepEqual(readFileSync(input.casesPath), input.cases);
  assert.deepEqual(readFileSync(input.runsPath), input.runs);
  diagnostic(invoke(input.args), 'E_OUTPUT_EXISTS', 'output');
  assert.equal(
    invoke([...input.args.slice(0, -1), join(input.directory, 'recovered')])
      .status,
    0,
  );
});

test('directory replacement during artifact open or after the last write fails conservatively', (t) => {
  for (const phase of ['open', 'last_write']) {
    const input = setup(t);
    const moved = `${input.output}-moved`;
    const nodeArgs = preload(
      input,
      `
import fs from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
const target = ${JSON.stringify(input.output)};
const phase = ${JSON.stringify(phase)};
const open = fs.openSync;
const write = fs.writeFileSync;
let writes = 0;
function replace() {
  fs.renameSync(target, target + '-moved');
  fs.mkdirSync(target, { mode: 0o700 });
  write(target + '/sentinel', 'FOREIGN-SENTINEL');
}
fs.openSync = function (path, ...args) {
  if (phase === 'open' && path === target + '/report.md') replace();
  return open(path, ...args);
};
fs.writeFileSync = function (...args) {
  const result = write(...args);
  if (phase === 'last_write' && typeof args[0] === 'number' && ++writes === 2) replace();
  return result;
};
syncBuiltinESMExports();
process.on('beforeExit', () => {
  for (const fd of fs.readdirSync('/proc/self/fd')) {
    let path;
    try { path = fs.readlinkSync('/proc/self/fd/' + fd); } catch { continue; }
    if (path.startsWith(target)) { process.stderr.write('OPEN-OUTPUT-HANDLE'); process.exitCode = 1; }
  }
});`,
    );
    const error = diagnostic(
      invoke(input.args, { nodeArgs }),
      'E_OUTPUT_WRITE',
      'output',
    );
    assert.ok(error.message.includes('incomplete'));
    assert.equal(
      readFileSync(join(input.output, 'sentinel'), 'utf8'),
      'FOREIGN-SENTINEL',
    );
    assert.deepEqual(
      readdirSync(moved).sort(),
      phase === 'open' ? ['result.json'] : ['report.md', 'result.json'],
    );
    // A replacement exactly inside open may receive an exclusively-created
    // empty entry. The lost directory identity must prevent writing into it
    // or deleting anything from the replacement during conservative cleanup.
    assert.deepEqual(
      readdirSync(input.output).sort(),
      phase === 'open' ? ['report.md', 'sentinel'] : ['sentinel'],
    );
    if (phase === 'open')
      assert.equal(statSync(join(input.output, 'report.md')).size, 0);
    assert.deepEqual(readFileSync(input.casesPath), input.cases);
    assert.deepEqual(readFileSync(input.runsPath), input.runs);
    diagnostic(invoke(input.args), 'E_OUTPUT_EXISTS', 'output');
    assert.equal(
      invoke([...input.args.slice(0, -1), join(input.directory, 'recovered')])
        .status,
      0,
    );
  }
});

test('success requires both original complete artifacts after all write calls return', (t) => {
  for (const fault of [
    'missing',
    'regular',
    'symlink',
    'directory',
    'short_write',
    'truncated',
  ]) {
    const input = setup(t);
    const artifact = join(input.output, 'result.json');
    const nodeArgs = preload(
      input,
      `
import fs from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
const target = ${JSON.stringify(input.output)};
const artifact = ${JSON.stringify(artifact)};
const fault = ${JSON.stringify(fault)};
const write = fs.writeFileSync;
let writes = 0;
fs.writeFileSync = function (...args) {
  if (typeof args[0] !== 'number') return write(...args);
  writes++;
  if (fault === 'short_write' && writes === 1) return write(args[0], args[1].subarray(0, 1));
  const result = write(...args);
  if (writes === 2) {
    if (fault === 'truncated') fs.truncateSync(artifact, 1);
    if (['missing', 'regular', 'symlink', 'directory'].includes(fault)) fs.unlinkSync(artifact);
    if (fault === 'regular') write(artifact, 'FOREIGN-SENTINEL', { flag: 'wx' });
    if (fault === 'symlink') fs.symlinkSync(${JSON.stringify(input.casesPath)}, artifact);
    if (fault === 'directory') { fs.mkdirSync(artifact); write(artifact + '/sentinel', 'FOREIGN-SENTINEL'); }
  }
  return result;
};
syncBuiltinESMExports();
process.on('beforeExit', () => {
  for (const fd of fs.readdirSync('/proc/self/fd')) {
    let path;
    try { path = fs.readlinkSync('/proc/self/fd/' + fd); } catch { continue; }
    if (path.startsWith(target)) { process.stderr.write('OPEN-OUTPUT-HANDLE'); process.exitCode = 1; }
  }
});`,
    );
    const error = diagnostic(
      invoke(input.args, { nodeArgs }),
      'E_OUTPUT_WRITE',
      'output',
    );
    if (['short_write', 'truncated'].includes(fault)) {
      assert.ok(error.message.includes('removed'));
      assert.equal(existsSync(input.output), false);
    } else {
      assert.ok(error.message.includes('incomplete'));
      if (fault === 'missing') assert.equal(existsSync(artifact), false);
      if (fault === 'regular')
        assert.equal(readFileSync(artifact, 'utf8'), 'FOREIGN-SENTINEL');
      if (fault === 'symlink')
        assert.equal(lstatSync(artifact).isSymbolicLink(), true);
      if (fault === 'directory')
        assert.equal(
          readFileSync(join(artifact, 'sentinel'), 'utf8'),
          'FOREIGN-SENTINEL',
        );
      diagnostic(invoke(input.args), 'E_OUTPUT_EXISTS', 'output');
    }
    assert.deepEqual(readFileSync(input.casesPath), input.cases);
    assert.deepEqual(readFileSync(input.runsPath), input.runs);
    assert.equal(
      invoke([...input.args.slice(0, -1), join(input.directory, 'recovered')])
        .status,
      0,
    );
  }
});

test('failed cleanup identifies incomplete output and cannot delete a replaced file or input', (t) => {
  for (const replaceFile of [false, true]) {
    const input = setup(t);
    const nodeArgs = preload(
      input,
      `
import fs from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
const write = fs.writeFileSync;
const unlink = fs.unlinkSync;
let writes = 0;
fs.writeFileSync = function (...args) {
  if (typeof args[0] === 'number' && ++writes === 2) {
    ${replaceFile ? `unlink(${JSON.stringify(join(input.output, 'result.json'))}); fs.symlinkSync(${JSON.stringify(input.casesPath)}, ${JSON.stringify(join(input.output, 'result.json'))});` : ''}
    throw new Error('SECRET-RAW-OS-FAILURE');
  }
  return write(...args);
};
${replaceFile ? '' : "fs.unlinkSync = () => { throw new Error('cleanup denied'); };"}
syncBuiltinESMExports();`,
    );
    const error = diagnostic(
      invoke(input.args, { nodeArgs }),
      'E_OUTPUT_WRITE',
      'output',
    );
    assert.ok(error.message.includes('incomplete'));
    assert.ok(error.message.includes('new path'));
    assert.equal(existsSync(input.output), true);
    diagnostic(invoke(input.args), 'E_OUTPUT_EXISTS', 'output');
    assert.deepEqual(readFileSync(input.casesPath), input.cases);
    assert.deepEqual(readFileSync(input.runsPath), input.runs);
    assert.equal(
      invoke([...input.args.slice(0, -1), join(input.directory, 'recovered')])
        .status,
      0,
    );
  }
});

test('an injected recyclable FS identity cannot authorize deletion of real replacement artifacts', (t) => {
  // The local allocator need not recycle an inode on demand. This filesystem
  // boundary model reports a recycled identity only when no original handle
  // still pins the object. Replacement entries and all CLI behavior are real.
  for (const replacement of ['regular', 'symlink', 'directory']) {
    const input = setup(t);
    const artifact = join(input.output, 'result.json');
    const nodeArgs = preload(
      input,
      `
import fs from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
const open = fs.openSync;
const write = fs.writeFileSync;
const lstat = fs.lstatSync;
const fstat = fs.fstatSync;
const artifact = ${JSON.stringify(artifact)};
let descriptor; let identity; let recyclable = false; let writes = 0;
fs.openSync = function (path, ...args) {
  const fd = open(path, ...args);
  if (path === artifact && descriptor === undefined) { descriptor = fd; identity = fstat(fd); }
  return fd;
};
fs.lstatSync = function (path, ...args) {
  const current = lstat(path, ...args);
  if (path === artifact && recyclable) { current.dev = identity.dev; current.ino = identity.ino; }
  return current;
};
fs.writeFileSync = function (...args) {
  if (typeof args[0] === 'number' && ++writes === 2) {
    fs.unlinkSync(artifact);
    const kind = ${JSON.stringify(replacement)};
    if (kind === 'regular') write(artifact, 'FOREIGN-SENTINEL', { flag: 'wx' });
    if (kind === 'symlink') fs.symlinkSync(${JSON.stringify(input.casesPath)}, artifact);
    if (kind === 'directory') { fs.mkdirSync(artifact); write(artifact + '/sentinel', 'FOREIGN-SENTINEL'); }
    try { const current = fstat(descriptor); recyclable = current.dev !== identity.dev || current.ino !== identity.ino; }
    catch { recyclable = true; }
    throw new Error('injected write failure');
  }
  return write(...args);
};
syncBuiltinESMExports();`,
    );
    const error = diagnostic(
      invoke(input.args, { nodeArgs }),
      'E_OUTPUT_WRITE',
      'output',
    );
    assert.ok(error.message.includes('incomplete'));
    assert.equal(existsSync(artifact), true);
    if (replacement === 'regular')
      assert.equal(readFileSync(artifact, 'utf8'), 'FOREIGN-SENTINEL');
    if (replacement === 'symlink')
      assert.equal(lstatSync(artifact).isSymbolicLink(), true);
    if (replacement === 'directory')
      assert.equal(
        readFileSync(join(artifact, 'sentinel'), 'utf8'),
        'FOREIGN-SENTINEL',
      );
    assert.deepEqual(readFileSync(input.casesPath), input.cases);
    assert.deepEqual(readFileSync(input.runsPath), input.runs);
    diagnostic(invoke(input.args), 'E_OUTPUT_EXISTS', 'output');
    assert.equal(
      invoke([...input.args.slice(0, -1), join(input.directory, 'recovered')])
        .status,
      0,
    );
  }
});

test('an injected recyclable FS identity cannot authorize removal of a real replacement output directory', (t) => {
  const input = setup(t);
  const nodeArgs = preload(
    input,
    `
import fs from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
const open = fs.openSync;
const lstat = fs.lstatSync;
const fstat = fs.fstatSync;
const target = ${JSON.stringify(input.output)};
let descriptor; let identity; let recyclable = false;
fs.lstatSync = function (path, ...args) {
  const current = lstat(path, ...args);
  if (path === target && recyclable) { current.dev = identity.dev; current.ino = identity.ino; }
  return current;
};
fs.openSync = function (path, ...args) {
  if (path === target + '/result.json') {
    identity = lstat(target);
    fs.rmdirSync(target);
    fs.mkdirSync(target, { mode: 0o700 });
    try { const current = fstat(descriptor); recyclable = current.dev !== identity.dev || current.ino !== identity.ino; }
    catch { recyclable = true; }
    throw new Error('injected open failure');
  }
  const fd = open(path, ...args);
  if (path === target) descriptor = fd;
  return fd;
};
syncBuiltinESMExports();`,
  );
  const error = diagnostic(
    invoke(input.args, { nodeArgs }),
    'E_OUTPUT_WRITE',
    'output',
  );
  assert.ok(error.message.includes('incomplete'));
  assert.equal(lstatSync(input.output).isDirectory(), true);
  assert.deepEqual(readdirSync(input.output), []);
  assert.deepEqual(readFileSync(input.casesPath), input.cases);
  assert.deepEqual(readFileSync(input.runsPath), input.runs);
  diagnostic(invoke(input.args), 'E_OUTPUT_EXISTS', 'output');
  assert.equal(
    invoke([...input.args.slice(0, -1), join(input.directory, 'recovered')])
      .status,
    0,
  );
});

test('output handles close on success, refusal, capture failure, replacement and close failure', (t) => {
  for (const fault of [
    'none',
    'occupied',
    'open',
    'file_stat',
    'directory_stat',
    'replace',
    'close',
  ]) {
    const input = setup(t);
    if (fault === 'occupied') mkdirSync(input.output);
    const nodeArgs = preload(
      input,
      `
import fs from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
const target = ${JSON.stringify(input.output)};
const fault = ${JSON.stringify(fault)};
const open = fs.openSync; const fstat = fs.fstatSync; const write = fs.writeFileSync; const close = fs.closeSync;
const paths = new Map(); let writes = 0; let closeFailed = false;
fs.openSync = function (path, ...args) {
  if (fault === 'open' && path === target + '/result.json') throw new Error('injected open failure');
  const fd = open(path, ...args);
  if (path === target || String(path).startsWith(target + '/')) paths.set(fd, path);
  return fd;
};
fs.fstatSync = function (fd, ...args) {
  if (fault === 'file_stat' && paths.get(fd) === target + '/result.json') throw new Error('injected stat failure');
  if (fault === 'directory_stat' && paths.get(fd) === target) throw new Error('injected stat failure');
  return fstat(fd, ...args);
};
fs.writeFileSync = function (...args) {
  if (fault === 'replace' && typeof args[0] === 'number' && ++writes === 2) {
    fs.unlinkSync(target + '/result.json');
    write(target + '/result.json', 'FOREIGN-SENTINEL', { flag: 'wx' });
    throw new Error('injected write failure');
  }
  return write(...args);
};
fs.closeSync = function (fd) {
  close(fd);
  if (fault === 'close' && paths.has(fd) && !closeFailed) {
    closeFailed = true;
    throw new Error('injected close failure');
  }
};
syncBuiltinESMExports();
process.on('beforeExit', () => {
  // Observe real OS handles rather than any evaluator helper or call count.
  for (const fd of fs.readdirSync('/proc/self/fd')) {
    let path;
    try { path = fs.readlinkSync('/proc/self/fd/' + fd); } catch { continue; }
    if (path === target || path === target + ' (deleted)' || path.startsWith(target + '/')) {
      process.stderr.write('OPEN-OUTPUT-HANDLE'); process.exitCode = 1;
    }
  }
});`,
    );
    const execution = invoke(input.args, { nodeArgs });
    if (fault === 'none') {
      assert.equal(execution.status, 0, execution.stderr);
      assert.equal(execution.stdout, receipt);
      assert.equal(execution.stderr, '');
    } else
      diagnostic(
        execution,
        fault === 'occupied' ? 'E_OUTPUT_EXISTS' : 'E_OUTPUT_WRITE',
        'output',
      );
    assert.ok(!execution.stderr.includes('OPEN-OUTPUT-HANDLE'));
    assert.deepEqual(readFileSync(input.casesPath), input.cases);
    assert.deepEqual(readFileSync(input.runsPath), input.runs);
  }
});

test('standalone invocation needs no installed package, build, provider, database, server or external call', (t) => {
  const input = setup(t);
  const standalone = join(input.directory, 'standalone', 'scripts');
  mkdirSync(standalone, { recursive: true });
  cpSync(command, join(standalone, 'pilot-evaluation.mjs'));
  cpSync(
    join(dirname(command), 'pilot-evaluation'),
    join(standalone, 'pilot-evaluation'),
    { recursive: true },
  );
  const nodeArgs = preload(
    input,
    `
import net from 'node:net';
import http from 'node:http';
import https from 'node:https';
import dns from 'node:dns';
import childProcess from 'node:child_process';
import { syncBuiltinESMExports } from 'node:module';
const forbidden = () => { throw new Error('EXTERNAL-CALL-FORBIDDEN'); };
net.connect = net.createConnection = net.Socket.prototype.connect = net.Server.prototype.listen = forbidden;
http.get = http.request = https.get = https.request = forbidden;
dns.lookup = dns.resolve = forbidden;
for (const name of ['exec', 'execFile', 'spawn', 'fork', 'execSync', 'execFileSync', 'spawnSync']) childProcess[name] = forbidden;
globalThis.fetch = forbidden;
syncBuiltinESMExports();`,
  );
  const execution = invoke(input.args, {
    entry: join(standalone, 'pilot-evaluation.mjs'),
    nodeArgs,
    env: {},
    cwd: input.directory,
  });
  assert.equal(execution.status, 0, execution.stderr);
  assert.equal(execution.stderr, '');
  assert.equal(execution.stdout, receipt);
  assert.equal(
    JSON.parse(readFileSync(join(input.output, 'result.json'))).aggregate.time
      .reductionPercent,
    '50.000000',
  );
  assert.equal(
    existsSync(join(input.directory, 'standalone', 'node_modules')),
    false,
  );
});

test('help does not access input/output files and unexpected runtime faults remain safe exit1 diagnostics', (t) => {
  const input = setup(t);
  const noFiles = preload(
    input,
    `
import fs from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
for (const name of ['accessSync', 'lstatSync', 'openSync', 'readFileSync', 'mkdirSync', 'writeFileSync']) {
  const original = fs[name];
  fs[name] = function (path, ...args) {
    // Node must still load the command's own JavaScript modules.
    if (String(path).endsWith('.mjs')) return original(path, ...args);
    throw new Error('NO-INPUT-OUTPUT-FILE-ACCESS');
  };
}
syncBuiltinESMExports();`,
  );
  const help = invoke(['--help'], { nodeArgs: noFiles });
  assert.equal(help.status, 0, help.stderr);
  assert.equal(help.stderr, '');
  const broken = preload(
    input,
    `
import crypto from 'node:crypto';
import { syncBuiltinESMExports } from 'node:module';
crypto.createHash = () => { throw new Error('PRIVATE-RUNTIME-SECRET'); };
syncBuiltinESMExports();`,
  );
  const failure = invoke(input.args, { nodeArgs: broken });
  diagnostic(failure, 'E_INTERNAL', 'internal');
  assert.ok(!failure.stderr.includes('PRIVATE-RUNTIME-SECRET'));
  assert.equal(existsSync(input.output), false);
});

test('artifact byte cap accepts its exact boundary and rejects the first overflow before directory creation', (t) => {
  // Fault injection at the native serializer boundary produces real large UTF-8
  // bytes. It supplies no metric expectations and imports no evaluator helper.
  for (const bytes of [16777216, 16777217]) {
    const input = setup(t);
    const nodeArgs = preload(
      input,
      `
const stringify = JSON.stringify;
JSON.stringify = function (value, replacer, space) {
  const result = stringify(value, replacer, space);
  if (value?.schema === 'prisma-prim-pilot-result/v1' && space === 2)
    return result + ' '.repeat(${bytes} - 1 - Buffer.byteLength(result));
  return result;
};`,
    );
    const execution = invoke(input.args, { nodeArgs });
    if (bytes === 16777216) {
      assert.equal(execution.status, 0, execution.stderr);
      assert.equal(execution.stdout, receipt);
      assert.equal(statSync(join(input.output, 'result.json')).size, 16777216);
      assert.equal(
        JSON.parse(readFileSync(join(input.output, 'result.json'))).aggregate
          .time.reductionPercent,
        '50.000000',
      );
    } else {
      diagnostic(execution, 'E_OUTPUT_LIMIT', 'output');
      assert.equal(existsSync(input.output), false);
    }
  }
});

test('runs capture has the same exact byte bound and all five identity differences exclude individually', (t) => {
  const input = setup(t);
  const exact = Buffer.concat([
    input.runs,
    Buffer.alloc(1048576 - input.runs.length, 0x20),
  ]);
  writeFileSync(input.runsPath, exact);
  assert.equal(invoke(input.args).status, 0);
  writeFileSync(input.runsPath, Buffer.concat([exact, Buffer.from(' ')]));
  const output = join(input.directory, 'overflow');
  diagnostic(
    invoke([...input.args.slice(0, -1), output]),
    'E_INPUT_LIMIT',
    'runs',
  );
  assert.equal(existsSync(output), false);
  for (const key of [
    'caseVersion',
    'sourceSetId',
    'sourceSetVersion',
    'referenceId',
    'referenceVersion',
  ]) {
    const { result } = successful(t, (x) => {
      x.runs.assisted.observations[0][key] =
        typeof x.runs.assisted.observations[0][key] === 'number' ? 2 : 'OLD';
    });
    assert.deepEqual(result.cases[0].assisted.identityMismatches, [key]);
    assert.equal(result.cases[0].assisted.fields, null);
    assert.equal(result.cases[0].assisted.citations, null);
    for (const metric of Object.values(result.cases[0].pairs))
      assert.deepEqual(metric.exclusions, ['incompatible_assisted']);
  }
});
