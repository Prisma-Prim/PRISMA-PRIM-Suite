import assert from 'node:assert/strict';
import test from 'node:test';
import { spawn, spawnSync } from 'node:child_process';
import {
  cpSync,
  existsSync,
  linkSync,
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
