import assert from 'node:assert/strict';
import test from 'node:test';
import { spawn, spawnSync } from 'node:child_process';
import {
  accessSync,
  constants,
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  symlinkSync,
  writeFileSync,
  linkSync,
} from 'node:fs';
import { dirname, join } from 'node:path';
import {
  command,
  diagnostic,
  invoke,
  preload,
  receipt,
  setup,
  readContainer,
} from './support.mjs';

const conserved = (input) => {
  assert.deepEqual(readFileSync(input.casesPath), input.cases);
  assert.deepEqual(readFileSync(input.runsPath), input.runs);
};
function harness(input, body) {
  return preload(
    input,
    `
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { dirname } from 'node:path';
import { syncBuiltinESMExports } from 'node:module';
const native={...fs};
const target=process.argv.at(-1), parent=dirname(target), log=target+'.trace.json';
const handles=new Set(); let outputFd; const events=[];
fs.openSync=(path,flags,mode)=>{
 const fd=native.openSync(path,flags,mode);
 if((path===target && flags==='wx+') || path===parent) {handles.add(fd);events.push(['open',path===target?'output':'parent']);}
 if(path===target && flags==='wx+'){ assert.equal(mode,0o600); outputFd=fd;}
 return fd;
};
fs.closeSync=fd=>{const result=native.closeSync(fd);handles.delete(fd);return result;};
// A test-only native system seam drives deterministic orderings around the real
// command. The product has no testing flags, environment switches or second API.
${body}
process.on('exit',()=>{process.umask(0o077);const remaining=[];for(const fd of handles){try{native.fstatSync(fd);remaining.push(fd);}catch{}}native.writeFileSync(log,JSON.stringify({events,remaining:remaining.length}));});
syncBuiltinESMExports();
`,
  );
}
function traced(input, body) {
  const child = invoke(input.args, { nodeArgs: harness(input, body) });
  const trace = JSON.parse(readFileSync(input.output + '.trace.json'));
  assert.equal(trace.remaining, 0, 'every known descriptor is closed');
  conserved(input);
  return { child, trace };
}
function writeFailure(input, child) {
  const error = diagnostic(child, 'E_OUTPUT_WRITE', 'output');
  assert.ok(error.message.includes('incomplete output may remain'));
  assert.ok(error.message.includes('fresh path'));
  assert.ok(!child.stderr.includes(input.directory));
}
function recover(input) {
  const retry = invoke([...input.args.slice(0, -1), input.output + '.retry']);
  assert.equal(retry.status, 0, retry.stderr);
  assert.equal(retry.stdout, receipt);
  readContainer(input.output + '.retry');
  conserved(input);
}

test('input byte limits include a one-byte overflow probe for both files', (t) => {
  for (const side of ['cases', 'runs'])
    for (const size of [1048576, 1048577]) {
      const input = setup(t);
      const source = input[side];
      writeFileSync(
        input[side + 'Path'],
        Buffer.concat([source, Buffer.alloc(size - source.length, 32)]),
      );
      const child = invoke(input.args);
      if (size === 1048576) {
        assert.equal(child.status, 0, child.stderr);
        readContainer(input.output);
      } else {
        diagnostic(child, 'E_INPUT_LIMIT', side);
        assert.equal(existsSync(input.output), false);
      }
    }
});

test('inputs must be distinct captured regular files with no observed symlink component', (t) => {
  for (const variant of [
    'same',
    'hardlink',
    'directory',
    'symlink',
    'dangling',
    'component',
    'traversal',
    'device',
  ]) {
    const input = setup(t);
    let bad = input.casesPath;
    if (variant === 'same') bad = input.casesPath;
    if (variant === 'hardlink') {
      bad = join(input.directory, 'linked');
      linkSync(input.casesPath, bad);
    }
    if (variant === 'directory') bad = input.directory;
    if (variant === 'symlink' || variant === 'dangling') {
      bad = join(input.directory, 'link');
      symlinkSync(
        variant === 'symlink'
          ? input.casesPath
          : join(input.directory, 'absent'),
        bad,
      );
    }
    if (variant === 'component' || variant === 'traversal') {
      const link = join(input.directory, 'component');
      symlinkSync(input.directory, link);
      bad =
        variant === 'component'
          ? join(link, 'cases.json')
          : link + '/../' + input.directory.split('/').at(-1) + '/cases.json';
    }
    if (variant === 'device') bad = '/dev/null';
    const args = [
      '--cases',
      bad,
      '--runs',
      variant === 'same' || variant === 'hardlink' ? bad : input.runsPath,
      '--output',
      input.output,
    ];
    const child = invoke(args);
    diagnostic(
      child,
      'E_INPUT_FILE',
      variant === 'same' || variant === 'hardlink' ? 'runs' : 'cases',
    );
    assert.equal(existsSync(input.output), false);
    conserved(input);
  }
});

test('every existing output kind is refused and its private contents remain conserved', async (t) => {
  for (const variant of [
    'file',
    'directory',
    'symlink',
    'dangling',
    'fifo',
    'device',
    'socket',
  ]) {
    await t.test(variant, (context) => {
      const input = setup(context);
      const sentinel = join(input.directory, 'sentinel');
      writeFileSync(sentinel, 'FOREIGN-SENTINEL');
      if (variant === 'file') writeFileSync(input.output, 'FOREIGN-OUTPUT');
      if (variant === 'directory') {
        mkdirSync(input.output);
        writeFileSync(join(input.output, 'sentinel'), 'FOREIGN-CHILD');
      }
      if (variant === 'symlink' || variant === 'dangling')
        symlinkSync(
          variant === 'symlink' ? sentinel : sentinel + '.absent',
          input.output,
        );
      if (variant === 'fifo')
        assert.equal(spawnSync('mkfifo', [input.output]).status, 0);
      if (variant === 'socket')
        assert.equal(
          spawnSync('python3', [
            '-c',
            'import socket,sys;s=socket.socket(socket.AF_UNIX);s.bind(sys.argv[1])',
            input.output,
          ]).status,
          0,
        );
      const target = variant === 'device' ? '/dev/null' : input.output;
      const before = lstatSync(target);
      let expectedCode = 'E_OUTPUT_EXISTS';
      if (variant === 'device') {
        assert.equal(before.isCharacterDevice(), true);
        // /dev is a borrowed native fixture, not an owned writable directory.
        // Qualify its parent before choosing one exact diagnostic. The unchanged
        // parent-safety guard runs before existing-target inspection.
        try {
          accessSync(dirname(target), constants.W_OK);
        } catch (error) {
          assert.ok(['EACCES', 'EPERM', 'EROFS'].includes(error.code));
          expectedCode = 'E_OUTPUT_PATH';
        }
      }
      diagnostic(
        invoke([...input.args.slice(0, -1), target]),
        expectedCode,
        'output',
      );
      const after = lstatSync(target);
      for (const key of ['dev', 'ino', 'rdev', 'mode'])
        assert.equal(after[key], before[key], `${variant}: ${key} conserved`);
      assert.equal(readFileSync(sentinel, 'utf8'), 'FOREIGN-SENTINEL');
      if (variant === 'file')
        assert.equal(readFileSync(target, 'utf8'), 'FOREIGN-OUTPUT');
      if (variant === 'directory')
        assert.equal(
          readFileSync(join(target, 'sentinel'), 'utf8'),
          'FOREIGN-CHILD',
        );
      conserved(input);
      recover(input);
    });
  }
});

test('unsafe parents, symlink traversal, input and repository overlap create no output', (t) => {
  const input = setup(t);
  const link = join(input.directory, 'linked');
  symlinkSync(input.directory, link);
  for (const target of [
    join(input.directory, 'absent', 'result'),
    join(input.casesPath, 'child'),
    join(link, 'unsafe'),
    link + '/../' + input.directory.split('/').at(-1) + '/unsafe',
    input.casesPath,
    input.runsPath,
    join(dirname(command), 'unsafe-result.tar'),
  ]) {
    diagnostic(
      invoke([...input.args.slice(0, -1), target]),
      'E_OUTPUT_PATH',
      'output',
    );
    conserved(input);
  }
});

test('private creation precedes descriptor chmod and final0600 is verified under ordinary and restrictive umasks', (t) => {
  for (const mask of [0o022, 0o077, 0o777]) {
    const input = setup(t);
    const { child, trace } = traced(
      input,
      `
process.umask(${mask}); let checked=false;
const stat=fs.fstatSync;
fs.fstatSync=fd=>{const result=stat(fd);if(fd===outputFd&&!checked){assert.equal(result.mode&0o077,0);assert.equal(result.mode&0o7777,${0o600 & ~mask});checked=true;events.push(['initial-private']);}return result;};
const chmod=fs.fchmodSync;
fs.fchmodSync=(fd,mode)=>{assert.ok(checked);assert.equal(fd,outputFd);assert.equal(mode,0o600);events.push(['descriptor-chmod']);return chmod(fd,mode);};
fs.chmodSync=()=>{throw new Error('Pathname chmod forbidden');};
`,
    );
    assert.equal(child.status, 0, child.stderr);
    assert.equal(lstatSync(input.output).mode & 0o7777, 0o600);
    assert.ok(trace.events.some((x) => x[0] === 'initial-private'));
    readContainer(input.output);
  }
});

test('replacement before the FIRST output descriptor-stat cannot become ownership baseline', (t) => {
  for (const mode of [0o600, 0o666]) {
    const input = setup(t);
    const { child, trace } = traced(
      input,
      `
const open=fs.openSync;
fs.openSync=(path,flags,mode)=>{const fd=open(path,flags,mode);if(path===target&&flags==='wx+'){native.renameSync(target,target+'.original');native.writeFileSync(target,'FOREIGN-REPLACEMENT',{mode:${mode}});events.push(['replaced-before-first-fstat']);}return fd;};
`,
    );
    writeFailure(input, child);
    assert.equal(readFileSync(input.output, 'utf8'), 'FOREIGN-REPLACEMENT');
    assert.equal(readFileSync(input.output + '.original').length, 0);
    assert.ok(trace.events.some((x) => x[0] === 'replaced-before-first-fstat'));
    recover(input);
  }
});

test('during-write replacement, unlink/recreation and parent replacement preserve all foreign sentinels', (t) => {
  for (const variant of ['rename', 'unlink', 'parent']) {
    const input = setup(t);
    const parent = join(input.directory, 'private');
    mkdirSync(parent);
    input.output = join(parent, 'result.tar');
    input.args[input.args.length - 1] = input.output;
    writeFileSync(join(parent, 'sentinel'), 'FOREIGN-PARENT');
    const { child } = traced(
      input,
      `
const write=fs.writeSync;let changed=false;
fs.writeSync=(fd,...args)=>{const count=write(fd,...args);if(fd===outputFd&&!changed){changed=true;
${variant === 'rename' ? "native.renameSync(target,target+'.original');native.writeFileSync(target,'FOREIGN-REPLACEMENT');" : variant === 'unlink' ? "native.unlinkSync(target);native.writeFileSync(target,'FOREIGN-REPLACEMENT');" : "native.renameSync(parent,parent+'.original');native.mkdirSync(parent);native.writeFileSync(target,'FOREIGN-REPLACEMENT');native.writeFileSync(parent+'/sentinel','NEW-PARENT-SENTINEL');"}
events.push(['namespace-replaced']);}return count;};
`,
    );
    writeFailure(input, child);
    assert.equal(readFileSync(input.output, 'utf8'), 'FOREIGN-REPLACEMENT');
    assert.equal(
      readFileSync(
        join(variant === 'parent' ? parent + '.original' : parent, 'sentinel'),
        'utf8',
      ),
      'FOREIGN-PARENT',
    );
    if (variant === 'parent')
      assert.equal(
        readFileSync(join(parent, 'sentinel'), 'utf8'),
        'NEW-PARENT-SENTINEL',
      );
    if (variant === 'rename')
      assert.ok(readFileSync(input.output + '.original').length > 0);
    recover(input);
  }
});

test('partial native writes are accounted for and complete readback matches independent reader payloads', (t) => {
  const input = setup(t);
  const { child, trace } = traced(
    input,
    `
const write=fs.writeSync, read=fs.readSync;
fs.writeSync=(fd,bytes,offset,length,position)=>{if(fd===outputFd){events.push(['partial-write']);return write(fd,bytes,offset,Math.min(length,97),position);}return write(fd,bytes,offset,length,position);};
fs.readSync=(fd,bytes,offset,length,position)=>read(fd,bytes,offset,fd===outputFd?Math.min(length,83):length,position);
`,
  );
  assert.equal(child.status, 0, child.stderr);
  assert.ok(trace.events.filter((x) => x[0] === 'partial-write').length > 1);
  readContainer(input.output);
});

test('zero writes, truncation, corrupt readback, read failure and close failure never issue a receipt', (t) => {
  const faults = {
    'zero-write': `const write=fs.writeSync;fs.writeSync=(fd,...args)=>fd===outputFd?0:write(fd,...args);`,
    'throw-write': `const write=fs.writeSync;fs.writeSync=(fd,...args)=>{if(fd===outputFd){write(fd,args[0],args[1],97,args[3]);throw new Error('RAW-PRIVATE-ERROR');}return write(fd,...args);};`,
    'truncated-write': `const write=fs.writeSync;fs.writeSync=(fd,...args)=>{const count=write(fd,...args);if(fd===outputFd)native.ftruncateSync(fd,17);return count;};`,
    'corrupt-readback': `const read=fs.readSync;fs.readSync=(fd,bytes,...args)=>{const count=read(fd,bytes,...args);if(fd===outputFd&&count)bytes[0]^=1;return count;};`,
    'throw-readback': `const read=fs.readSync;fs.readSync=(fd,...args)=>{if(fd===outputFd)throw new Error('RAW-PRIVATE-ERROR');return read(fd,...args);};`,
    'zero-readback': `const read=fs.readSync;fs.readSync=(fd,...args)=>fd===outputFd?0:read(fd,...args);`,
    'output-close': `const close=fs.closeSync;let failed=false;fs.closeSync=fd=>{if(fd===outputFd&&!failed){failed=true;throw new Error('RAW-PRIVATE-ERROR');}return close(fd);};`,
    'parent-close': `const close=fs.closeSync;let failed=false;fs.closeSync=fd=>{if(handles.has(fd)&&fd!==outputFd&&!failed){failed=true;throw new Error('RAW-PRIVATE-ERROR');}return close(fd);};`,
  };
  for (const [name, body] of Object.entries(faults)) {
    const input = setup(t);
    const { child } = traced(input, body);
    writeFailure(input, child);
    assert.equal(existsSync(input.output), true, name);
    assert.ok(!child.stderr.includes('RAW-PRIVATE-ERROR'));
    recover(input);
  }
});

test('all captured descriptors close even when output verification or parent opening fails', (t) => {
  for (const body of [
    `const stat=fs.fstatSync;fs.fstatSync=fd=>{if(fd===outputFd)throw new Error('stat failure');return stat(fd);};`,
    `const stat=fs.fstatSync;let count=0;fs.fstatSync=fd=>{if(handles.has(fd)&&fd!==outputFd&&++count===1)throw new Error('parent failure');return stat(fd);};`,
  ]) {
    const input = setup(t);
    const { child } = traced(input, body);
    writeFailure(input, child);
    recover(input);
  }
});

test('a replacement during a later close illustrates the explicit post-final-check limit', (t) => {
  const input = setup(t);
  const { child } = traced(
    input,
    `
const close=fs.closeSync;
fs.closeSync=fd=>{if(fd===outputFd){native.renameSync(target,target+'.verified');native.writeFileSync(target,'LATER-REPLACEMENT');}return close(fd);};
`,
  );
  assert.equal(child.status, 0, child.stderr);
  assert.equal(child.stdout, receipt);
  assert.equal(readFileSync(input.output, 'utf8'), 'LATER-REPLACEMENT');
  readContainer(input.output + '.verified');
});

test('concurrent same-target commands yield exactly one exclusive completion and permit new-path recovery', async (t) => {
  const input = setup(t, 'six');
  const run = () =>
    new Promise((resolve, reject) => {
      const child = spawn(process.execPath, [command, ...input.args], {
        env: { PATH: process.env.PATH },
      });
      let stdout = '',
        stderr = '';
      child.stdout.on('data', (data) => (stdout += data));
      child.stderr.on('data', (data) => (stderr += data));
      child.on('error', reject);
      child.on('close', (status) => resolve({ status, stdout, stderr }));
    });
  const results = await Promise.all([run(), run()]);
  assert.deepEqual(results.map((x) => x.status).sort(), [0, 3]);
  assert.equal(results.find((x) => x.status === 0).stdout, receipt);
  diagnostic(
    results.find((x) => x.status === 3),
    'E_OUTPUT_EXISTS',
    'output',
  );
  readContainer(input.output);
  conserved(input);
  recover(input);
});

test('input descriptor close failures remain safe file failures and close known input descriptors', (t) => {
  const input = setup(t);
  const { child } = traced(
    input,
    `
const open=fs.openSync,close=fs.closeSync;let inputFd,failed=false;
fs.openSync=(path,...args)=>{const fd=open(path,...args);if(path===process.argv[3]){inputFd=fd;handles.add(fd);}return fd;};
fs.closeSync=fd=>{if(fd===inputFd&&!failed){failed=true;throw new Error('RAW-INPUT-CLOSE');}return close(fd);};
`,
  );
  diagnostic(child, 'E_INPUT_FILE', 'cases');
  assert.equal(existsSync(input.output), false);
  assert.ok(!child.stderr.includes('RAW-INPUT-CLOSE'));
});

test('parent replacement before creation fails without creating or adopting any output', (t) => {
  const input = setup(t);
  const parent = join(input.directory, 'private');
  mkdirSync(parent);
  input.output = join(parent, 'result.tar');
  input.args[input.args.length - 1] = input.output;
  writeFileSync(join(parent, 'sentinel'), 'ORIGINAL-PARENT');
  const { child } = traced(
    input,
    `
const open=fs.openSync;let changed=false;
fs.openSync=(path,...args)=>{const fd=open(path,...args);if(path===parent&&!changed){changed=true;native.renameSync(parent,parent+'.original');native.mkdirSync(parent);native.writeFileSync(parent+'/sentinel','FOREIGN-PARENT');}return fd;};
`,
  );
  writeFailure(input, child);
  assert.equal(existsSync(input.output), false);
  assert.equal(existsSync(parent + '.original/result.tar'), false);
  assert.equal(
    readFileSync(parent + '.original/sentinel', 'utf8'),
    'ORIGINAL-PARENT',
  );
  assert.equal(readFileSync(parent + '/sentinel', 'utf8'), 'FOREIGN-PARENT');
  recover(input);
});

test('creation races preserve a newly occupied target and close the captured parent', (t) => {
  const input = setup(t);
  const { child } = traced(
    input,
    `
const open=fs.openSync;let changed=false;
fs.openSync=(path,...args)=>{const fd=open(path,...args);if(path===parent&&!changed){changed=true;native.writeFileSync(target,'CONCURRENT-SENTINEL');}return fd;};
`,
  );
  const error = diagnostic(child, 'E_OUTPUT_EXISTS', 'output');
  assert.ok(error.message.includes('fresh path'));
  assert.equal(readFileSync(input.output, 'utf8'), 'CONCURRENT-SENTINEL');
  recover(input);
});

test('observed initial nonprivate permissions and unsupported descriptor chmod fail before content', (t) => {
  for (const variant of ['nonprivate', 'unsupported']) {
    const input = setup(t);
    const { child } = traced(
      input,
      variant === 'nonprivate'
        ? `
const open=fs.openSync;
fs.openSync=(path,...args)=>{const fd=open(path,...args);if(path===target&&args[0]==='wx+')native.fchmodSync(fd,0o666);return fd;};
fs.fchmodSync=()=>{events.push(['unexpected-chmod']);throw new Error('Initial privacy must precede chmod');};
`
        : `fs.fchmodSync=()=>{throw new Error('Unsupported descriptor permissions');};`,
    );
    writeFailure(input, child);
    assert.equal(lstatSync(input.output).size, 0);
    recover(input);
  }
});

test('the runtime performs no network, subprocess, namespace cleanup or pathname chmod operations', (t) => {
  const input = setup(t);
  const nodeArgs = preload(
    input,
    `
import fs from 'node:fs';import http from 'node:http';import https from 'node:https';import net from 'node:net';import child from 'node:child_process';import {syncBuiltinESMExports} from 'node:module';
const refused=()=>{throw new Error('Unrequested operation');};
for(const key of ['unlinkSync','rmdirSync','renameSync','rmSync','chmodSync','mkdirSync'])fs[key]=refused;
for(const object of [http,https])for(const key of ['request','get'])object[key]=refused;
for(const key of ['connect','createConnection'])net[key]=refused;
for(const key of ['spawn','spawnSync','exec','execSync','execFile','execFileSync','fork'])child[key]=refused;
globalThis.fetch=refused;syncBuiltinESMExports();
`,
  );
  const child = invoke(input.args, { nodeArgs });
  assert.equal(child.status, 0, child.stderr);
  assert.equal(child.stdout, receipt);
  conserved(input);
  readContainer(input.output);
});

test('runs bytes receive the same strict JSON, UTF8, duplicate-key and depth checks', (t) => {
  for (const [bytes, code] of [
    [Buffer.from([0xc3, 0x28]), 'E_JSON'],
    [Buffer.from('\ufeff{}'), 'E_JSON'],
    [Buffer.from('{'), 'E_JSON'],
    [Buffer.from('{"schema":1,"schema":2}'), 'E_DUPLICATE'],
    [Buffer.from('['.repeat(13) + '0' + ']'.repeat(13)), 'E_INPUT_LIMIT'],
  ]) {
    const input = setup(t);
    writeFileSync(input.runsPath, bytes);
    diagnostic(invoke(input.args), code, 'runs');
    assert.equal(existsSync(input.output), false);
    assert.deepEqual(readFileSync(input.casesPath), input.cases);
    assert.deepEqual(readFileSync(input.runsPath), bytes);
  }
});

test('a trailing separator cannot silently change a selected file pathname into another path', (t) => {
  const input = setup(t);
  diagnostic(
    invoke([...input.args.slice(0, -1), input.output + '/']),
    'E_OUTPUT_PATH',
    'output',
  );
  assert.equal(existsSync(input.output), false);
  conserved(input);
});
