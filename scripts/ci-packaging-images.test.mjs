import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  chmodSync,
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

const hash = (value) =>
  'sha256:' + createHash('sha256').update(value).digest('hex');

function fixture(scenario = {}) {
  const root = mkdtempSync(join(tmpdir(), 'packaging-images-'));
  for (const path of ['scripts', 'deploy/railway', 'bin'])
    mkdirSync(join(root, path), { recursive: true });
  copyFileSync(
    new URL('./ci-packaging-images.mjs', import.meta.url),
    join(root, 'scripts/ci-packaging-images.mjs'),
  );
  const manifests = {};
  const images = ['node', 'nginx'].map((name) => {
    const id = hash(name + '-verified-config');
    const manifest = JSON.stringify({
      schemaVersion: 2,
      config: { digest: id },
      layers: [],
    });
    const index = JSON.stringify({
      schemaVersion: 2,
      manifests: [
        {
          digest: hash(manifest),
          platform: { os: 'linux', architecture: 'amd64' },
        },
      ],
    });
    const source = `public.ecr.aws/docker/library/${name}:fixture@${hash(index)}`;
    manifests[source] = index;
    manifests[source.split('@')[0] + '@' + hash(manifest)] = manifest;
    return { name, id, source };
  });
  writeFileSync(
    join(root, 'deploy/railway/api.Dockerfile'),
    `FROM ${images[0].source} AS build\nRUN echo unchanged\nFROM ${images[0].source} AS runtime\n`,
  );
  writeFileSync(
    join(root, 'deploy/railway/web.Dockerfile'),
    `FROM ${images[0].source} AS build\nFROM ${images[1].source} AS runtime\n`,
  );
  const log = join(root, 'commands.jsonl');
  const binary = join(root, 'bin/docker');
  writeFileSync(
    binary,
    `#!${process.execPath}
const fs = require('node:fs');
const args = process.argv.slice(2);
fs.appendFileSync(process.env.COMMAND_LOG, JSON.stringify(args) + '\\n');
const data = JSON.parse(process.env.IMAGE_FIXTURE);
const scenario = JSON.parse(process.env.IMAGE_SCENARIO);
if (scenario.registryError && ['buildx', 'pull'].includes(args[0])) { console.error('429 Too Many Requests: Data limit exceeded'); process.exit(125); }
if (args[0] === 'buildx') process.stdout.write(data.manifests[args.at(-1)] + (scenario.rawNewline ? '\\n' : ''));
if (args[0] === 'image' && args[1] === 'inspect') {
 const image = data.images.find((item) => args.at(-1).includes(item.name));
 process.stdout.write(scenario.wrongId ? 'sha256:' + '0'.repeat(64) : image.id);
}
if (args[0] === 'save') fs.writeFileSync(args[2], 'verified image archive');
if (args[0] === 'load' && (!fs.existsSync(args[2]) || fs.readFileSync(args[2], 'utf8') !== 'verified image archive')) { console.error('invalid or missing image archive'); process.exit(1); }
`,
  );
  chmodSync(binary, 0o755);
  const directory = join(root, 'cache');
  const invoke = (mode) =>
    spawnSync(
      process.execPath,
      [join(root, 'scripts/ci-packaging-images.mjs'), mode],
      {
        env: {
          ...process.env,
          PATH: `${join(root, 'bin')}:${process.env.PATH}`,
          COMMAND_LOG: log,
          IMAGE_FIXTURE: JSON.stringify({ manifests, images }),
          IMAGE_SCENARIO: JSON.stringify(scenario),
          PACKAGING_IMAGE_DIRECTORY: directory,
        },
        encoding: 'utf8',
        timeout: 15_000,
      },
    );
  return {
    root,
    directory,
    log,
    images,
    scenario,
    invoke,
    cleanup: () => rmSync(root, { recursive: true, force: true }),
  };
}

test('cold acquire verifies pinned bytes and warm load works without any registry operation', () => {
  const setup = fixture();
  try {
    const cold = setup.invoke('acquire');
    assert.equal(cold.status, 0, cold.stdout + cold.stderr);
    writeFileSync(setup.log, '');
    const warm = setup.invoke('load');
    assert.equal(warm.status, 0, warm.stdout + warm.stderr);
    const calls = readFileSync(setup.log, 'utf8')
      .trim()
      .split('\n')
      .map(JSON.parse);
    assert.equal(
      calls.filter(([op]) => ['pull', 'buildx'].includes(op)).length,
      0,
    );
    assert.equal(calls.filter(([op]) => op === 'load').length, 1);
    const api = readFileSync(join(setup.directory, 'api.Dockerfile'), 'utf8');
    assert.match(api, /RUN echo unchanged/);
    assert.doesNotMatch(api, /public\.ecr\.aws/);
    assert.equal(
      [...api.matchAll(/^FROM prisma-prim-ci\/packaging-node:/gm)].length,
      2,
    );
  } finally {
    setup.cleanup();
  }
});

test('Docker raw output newline does not alter the verified manifest bytes', () => {
  const setup = fixture({ rawNewline: true });
  try {
    const cold = setup.invoke('acquire');
    assert.equal(cold.status, 0, cold.stdout + cold.stderr);
    assert.equal(setup.invoke('load').status, 0);
  } finally {
    setup.cleanup();
  }
});

for (const instruction of ['FROM node:latest', '  from node:latest']) {
  test(`an extra unpinned ${instruction} cannot survive into the temporary build file`, () => {
    const setup = fixture();
    try {
      const path = join(setup.root, 'deploy/railway/api.Dockerfile');
      writeFileSync(path, readFileSync(path, 'utf8') + instruction + '\n');
      const result = setup.invoke('acquire');
      assert.equal(result.status, 1, result.stdout + result.stderr);
      assert.match(result.stderr, /unverified|pinned/);
    } finally {
      setup.cleanup();
    }
  });
}

test('offline restore rejects damaged or missing proof and archive, and a different loaded config', () => {
  const setup = fixture();
  try {
    const cold = setup.invoke('acquire');
    assert.equal(cold.status, 0, cold.stdout + cold.stderr);
    const index = join(setup.directory, 'node-index.json');
    const manifest = join(setup.directory, 'node-manifest.json');
    const archive = join(setup.directory, 'images.tar');
    const originals = new Map(
      [index, manifest, archive].map((path) => [path, readFileSync(path)]),
    );
    for (const [label, damage, beforeLoad, expected] of [
      [
        'index',
        () => writeFileSync(index, '{}'),
        true,
        /index: digest mismatch/,
      ],
      [
        'manifest',
        () => writeFileSync(manifest, '{}'),
        true,
        /platform manifest: digest mismatch/,
      ],
      ['missing proof', () => unlinkSync(index), true, /ENOENT/],
      [
        'invalid archive',
        () => writeFileSync(archive, 'unverified bytes'),
        false,
        /invalid or missing image archive/,
      ],
      [
        'missing archive',
        () => unlinkSync(archive),
        false,
        /invalid or missing image archive/,
      ],
      [
        'wrong config',
        () => {
          setup.scenario.wrongId = true;
        },
        false,
        /loaded image config digest mismatch/,
      ],
    ]) {
      for (const [path, bytes] of originals) writeFileSync(path, bytes);
      setup.scenario.wrongId = false;
      writeFileSync(setup.log, '');
      damage();
      const result = setup.invoke('load');
      assert.equal(result.status, 1, label + result.stdout + result.stderr);
      assert.match(result.stderr, expected, label);
      const calls = readFileSync(setup.log, 'utf8')
        .trim()
        .split('\n')
        .filter(Boolean)
        .map(JSON.parse);
      assert.equal(
        calls.filter(([op]) => ['buildx', 'pull', 'save'].includes(op)).length,
        0,
        label,
      );
      if (beforeLoad)
        assert.equal(calls.filter(([op]) => op === 'load').length, 0, label);
    }
  } finally {
    setup.cleanup();
  }
});

test('a cache miss requires explicit acquisition and unavailable registry fails without fallback or archive', () => {
  const setup = fixture({ registryError: true });
  try {
    const missing = setup.invoke('load');
    assert.equal(missing.status, 1);
    assert.match(missing.stderr, /ENOENT/);
    const cold = setup.invoke('acquire');
    assert.equal(cold.status, 1);
    assert.match(cold.stderr, /429 Too Many Requests: Data limit exceeded/);
    assert.match(cold.stderr, /no unverified fallback/);
    const calls = readFileSync(setup.log, 'utf8')
      .trim()
      .split('\n')
      .map(JSON.parse);
    assert.deepEqual(
      calls.map(([op]) => op),
      ['buildx'],
    );
  } finally {
    setup.cleanup();
  }
});
