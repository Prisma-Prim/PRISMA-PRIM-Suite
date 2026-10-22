import { execFile, spawn } from 'node:child_process';
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from 'node:crypto';
import {
  chmod,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  stat,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Client } from 'pg';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  createIsolatedPostgresTestDatabase,
  type IsolatedPostgresTestDatabase,
} from '../database/isolated-postgres-test-database.js';
import {
  createPostgresRestTestHarness,
  type PostgresRestTestHarness,
} from '../database/postgres-rest-test-harness.js';
import { runDemonstrationSeedCommand } from '../demonstration/demonstration-seed.command.js';
import { resolveRecoveryTestContainer } from '../../test-support/recovery-test-container.js';
import {
  prepareRecoveryPublicEvidence,
  startRecoveryScannerFixture,
} from '../../test-support/recovery-public-evidence.js';

const execute = promisify(execFile);
const databaseUrl = process.env.TEST_DATABASE_URL;
const withRecovery = databaseUrl ? describe : describe.skip;
const workspaceId = '00000000-0000-4000-8000-000000000736';
const workspaceName = 'Isolated recovery DEMO Workspace';
const owner = {
  provider: 'deterministic-test',
  subject: 'recovery-demo-owner',
  displayName: 'Recovery owner DEMO',
  email: 'recovery-owner@example.test',
};

interface CallerMeasurementFixture {
  readonly referenceInstant: string;
  readonly maximumRecencyMilliseconds: number;
  readonly maximumRecoveryMilliseconds: number;
}

interface CallerBoundRejectionFixture {
  readonly key: string;
  readonly change: (
    measurement: CallerMeasurementFixture,
  ) => Readonly<Record<string, unknown>>;
}

const callerBoundRejectionFixtures = [
  {
    key: 'revision',
    change: (measurement) => ({
      applicationRevision: '0'.repeat(40),
      measurement,
    }),
  },
  { key: 'missing', change: () => ({ measurement: undefined }) },
  {
    key: 'missing-recency',
    change: (measurement) => ({
      measurement: {
        referenceInstant: measurement.referenceInstant,
        maximumRecoveryMilliseconds: 30_000,
      },
    }),
  },
  {
    key: 'missing-duration',
    change: (measurement) => ({
      measurement: {
        referenceInstant: measurement.referenceInstant,
        maximumRecencyMilliseconds: 300_000,
      },
    }),
  },
  { key: 'nonfinite', change: (measurement) => ({ measurement }) },
  {
    key: 'invalid-reference',
    change: (measurement) => ({
      measurement: { ...measurement, referenceInstant: 'not-an-instant' },
    }),
  },
  {
    key: 'contradictory-reference',
    change: (measurement) => ({
      measurement: {
        ...measurement,
        referenceInstant: '2000-01-01T00:00:00.000Z',
      },
    }),
  },
  {
    key: 'exceeded-recency',
    change: (measurement) => ({
      measurement: {
        ...measurement,
        referenceInstant: new Date(
          Date.parse(measurement.referenceInstant) + 1,
        ).toISOString(),
        maximumRecencyMilliseconds: 0,
      },
    }),
  },
  {
    key: 'negative-recency',
    change: (measurement) => ({
      measurement: { ...measurement, maximumRecencyMilliseconds: -1 },
    }),
  },
  {
    key: 'zero-duration',
    change: (measurement) => ({
      measurement: { ...measurement, maximumRecoveryMilliseconds: 0 },
    }),
  },
] satisfies readonly CallerBoundRejectionFixture[];

/** Actual compiled operator entry, supplied PostgreSQL and ordinary public reads. */
withRecovery('retained synthetic recovery through the compiled CLI', () => {
  let container: string | undefined;
  let source: IsolatedPostgresTestDatabase;
  let sourceApplication: PostgresRestTestHarness | undefined;
  let destination: IsolatedPostgresTestDatabase | undefined;
  let temporaryRoot: string;
  let entry: string;
  let backupConfig: string;
  let archivePath: string;
  let completionEvidencePath: string;
  let sourceServerVersion: string;
  let sourceToolVersion: string;
  let scanner: Awaited<ReturnType<typeof startRecoveryScannerFixture>>;
  let publicEvidence: Awaited<ReturnType<typeof prepareRecoveryPublicEvidence>>;
  const originalEnvironment = { ...process.env };

  beforeAll(async () => {
    if (!databaseUrl)
      throw new Error('A supplied PostgreSQL17 test target is required.');
    container = await resolveRecoveryTestContainer({
      databaseUrl,
      explicitContainer: process.env.RECOVERY_TEST_CONTAINER,
      continuousIntegration: process.env.CI === 'true',
      runDocker: async (args) =>
        (
          await execute('docker', args, {
            timeout: 10_000,
            maxBuffer: 65_536,
          })
        ).stdout,
    });
    temporaryRoot = await mkdtemp(join(tmpdir(), 'prisma-recovery736-'));
    const compiledRoot = join(temporaryRoot, 'compiled');
    const revision = (
      await execute('git', ['rev-parse', 'HEAD'])
    ).stdout.trim();
    if (!/^[0-9a-f]{40}$/u.test(revision))
      throw new Error('The exact application revision is required.');
    await symlink(
      resolve('node_modules'),
      join(temporaryRoot, 'node_modules'),
      'dir',
    );
    // Compile once for this real operator boundary. Restored startup never runs
    // this harness's automatic migrations or any seed/bootstrap repair.
    // Emit fixture JS only; strict types and the normal build are separate gates.
    await execute(
      process.execPath,
      [
        resolve('../../node_modules/typescript/bin/tsc'),
        '-p',
        'tsconfig.build.json',
        '--incremental',
        'false',
        '--declaration',
        'false',
        '--sourceMap',
        'false',
        '--noCheck',
        '--outDir',
        compiledRoot,
      ],
      { timeout: 90_000, maxBuffer: 1024 * 1024 },
    );
    entry = join(compiledRoot, 'recovery/synthetic-recovery.main.js');
    source = await createIsolatedPostgresTestDatabase({
      baseDatabaseUrl: databaseUrl,
      namePrefix: 'recovery736_source',
    });
    const observedVersion = await source.targetPool.query<
      Record<string, unknown>
    >("SELECT current_setting('server_version_num') AS version");
    const serverVersion = observedVersion.rows[0]?.version;
    if (typeof serverVersion !== 'string')
      throw new Error('Expected actual PostgreSQL server version.');
    sourceServerVersion = serverVersion;
    sourceToolVersion = (
      await execute('docker', [
        '--host=unix:///var/run/docker.sock',
        'exec',
        container,
        'pg_dump',
        '--version',
      ])
    ).stdout.trim();
    await migrate(drizzle({ client: source.targetPool }), {
      migrationsFolder: './drizzle',
    });
    const environment = {
      NODE_ENV: 'test',
      DATABASE_URL: source.targetUrl,
      ACCESS_IDENTITY_MODE: 'test',
      ACCESS_BOOTSTRAP_EXTERNAL_PROVIDER: owner.provider,
      ACCESS_BOOTSTRAP_EXTERNAL_SUBJECT: owner.subject,
      ACCESS_BOOTSTRAP_WORKSPACE_ID: workspaceId,
      ACCESS_BOOTSTRAP_WORKSPACE_NAME: workspaceName,
    };
    const records = new Map<string, string>();
    const seeded = await runDemonstrationSeedCommand({
      argv: ['--confirm-workspace', workspaceId],
      environment,
      write: (line) => {
        const parsed: unknown = JSON.parse(line);
        if (
          typeof parsed === 'object' &&
          parsed !== null &&
          'step' in parsed &&
          typeof parsed.step === 'string' &&
          'recordId' in parsed &&
          typeof parsed.recordId === 'string'
        )
          records.set(parsed.step, parsed.recordId);
      },
    });
    expect(seeded.outcome).toBe('converged');
    scanner = await startRecoveryScannerFixture();
    sourceApplication = await createPostgresRestTestHarness({
      databaseUrl: source.targetUrl,
      environment: {
        ...environment,
        DOCUMENT_MALWARE_SCANNER_HOST: '127.0.0.1',
        DOCUMENT_MALWARE_SCANNER_PORT: String(scanner.port),
      },
    });
    const response = await fetch(`${sourceApplication.origin}/api/companies`, {
      headers: {
        'x-test-external-provider': owner.provider,
        'x-test-external-subject': owner.subject,
        'x-test-display-name': owner.displayName,
        'x-test-email': owner.email,
      },
    });
    expect(response.status).toBe(200);
    const companyBytes = Buffer.from(await response.arrayBuffer());
    expect(companyBytes.toString('utf8')).toContain('PRISMA-PRIM');
    publicEvidence = await prepareRecoveryPublicEvidence({
      origin: sourceApplication.origin,
      owner,
      records,
    });
    archivePath = join(temporaryRoot, 'retained-backup.enc');
    completionEvidencePath = join(temporaryRoot, 'archive-completion.json');
    const keyPath = join(temporaryRoot, 'independently-retained.key');
    const verificationEvidencePath = join(
      temporaryRoot,
      'public-expectations.json',
    );
    await writeFile(keyPath, randomBytes(32), { mode: 0o600, flag: 'wx' });
    await writeFile(
      verificationEvidencePath,
      JSON.stringify(publicEvidence.evidence),
      { mode: 0o600, flag: 'wx' },
    );
    backupConfig = join(temporaryRoot, 'backup-config.json');
    await writeFile(
      backupConfig,
      JSON.stringify({
        version: 1,
        attestation: 'exclusive-synthetic-non-production',
        applicationRevision: revision,
        workspace: { id: workspaceId, name: workspaceName },
        database: { url: source.targetUrl, container },
        archivePath,
        keyPath,
        verificationEvidencePath,
        completionEvidencePath,
      }),
      { mode: 0o600, flag: 'wx' },
    );
  }, 120_000);

  afterAll(async () => {
    await sourceApplication?.close();
    await scanner?.close();
    await source?.close();
    await destination?.close();
    if (temporaryRoot)
      await rm(temporaryRoot, { recursive: true, force: true });
    for (const key of Object.keys(process.env))
      if (!Object.hasOwn(originalEnvironment, key)) delete process.env[key];
    Object.assign(process.env, originalEnvironment);
  });

  it('binds Workspace admission and complete dumping to one held snapshot during a concurrent change', async () => {
    if (!databaseUrl || !container) throw new Error('Expected supplied tools.');
    const original: unknown = JSON.parse(await readFile(backupConfig, 'utf8'));
    if (
      typeof original !== 'object' ||
      original === null ||
      Array.isArray(original)
    )
      throw new Error('Expected independently prepared configuration.');
    const target = await createIsolatedPostgresTestDatabase({
      baseDatabaseUrl: databaseUrl,
      namePrefix: 'recovery736_snapshot',
    });
    const tools = join(temporaryRoot, 'snapshot-tools');
    await mkdir(tools, { mode: 0o700 });
    const realDocker = (await execute('which', ['docker'])).stdout.trim();
    const barrier = join(tools, 'snapshot-ready');
    const release = join(tools, 'snapshot-release');
    await writeFile(
      join(tools, 'docker'),
      `#!${process.execPath}\nconst fs = require('node:fs');\nconst cp = require('node:child_process');\nconst args = process.argv.slice(2);\nif (args.some(value => value.startsWith('--snapshot='))) {\n  fs.writeFileSync(${JSON.stringify(barrier)}, 'ready', { mode: 0o600, flag: 'wx' });\n  const deadline = Date.now() + 10000;\n  while (!fs.existsSync(${JSON.stringify(release)})) {\n    if (Date.now() > deadline) process.exit(95);\n    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 10);\n  }\n}\nconst result = cp.spawnSync(${JSON.stringify(realDocker)}, args, { stdio: 'inherit' });\nprocess.exit(result.status ?? 96);\n`,
      { mode: 0o700, flag: 'wx' },
    );
    const snapshotConfig = {
      ...original,
      archivePath: join(temporaryRoot, 'snapshot-backup.enc'),
      completionEvidencePath: join(temporaryRoot, 'snapshot-completion.json'),
    };
    const configPath = join(tools, 'backup.json');
    await writeFile(configPath, JSON.stringify(snapshotConfig), {
      mode: 0o600,
      flag: 'wx',
    });
    const running = invokeOperator({
      entry,
      operation: 'backup',
      configPath,
      environment: {
        ...process.env,
        NODE_ENV: 'test',
        PATH: `${tools}:${process.env.PATH ?? ''}`,
      },
    });
    try {
      await vi.waitFor(
        async () => expect(await readFile(barrier, 'utf8')).toBe('ready'),
        { timeout: 10_000, interval: 10 },
      );
      // Exported snapshot/admission have completed, while real pg_dump has not
      // begun. A later independent dump would now capture this invalid name.
      await source.targetPool.query(
        'UPDATE workspaces SET name=$1 WHERE id=$2',
        ['Concurrent unadmitted workspace', workspaceId],
      );
      await writeFile(release, 'continue', { mode: 0o600, flag: 'wx' });
      const backup = await running;
      expect(backup).toMatchObject({ exitCode: 0, stderr: '' });
      expect(backup.stdout).toContain('"outcome":"archive-created"');
      await source.targetPool.query(
        'UPDATE workspaces SET name=$1 WHERE id=$2',
        [workspaceName, workspaceId],
      );
      const restoreConfig = join(tools, 'restore.json');
      await writeFile(
        restoreConfig,
        JSON.stringify({
          ...snapshotConfig,
          database: { url: target.targetUrl, container },
          measurement: {
            referenceInstant: await readRetainedReference({
              completionEvidencePath: snapshotConfig.completionEvidencePath,
            }),
            maximumRecencyMilliseconds: 300_000,
            maximumRecoveryMilliseconds: 30_000,
          },
        }),
        { mode: 0o600, flag: 'wx' },
      );
      const restored = await invokeOperator({
        entry,
        operation: 'restore',
        configPath: restoreConfig,
        environment: ordinaryEnvironment(target.targetUrl),
      });
      expect(restored, restored.stdout).toMatchObject({
        exitCode: 0,
        stderr: '',
      });
      expect(restored.stdout).toContain('"outcome":"recovered"');
      const observed = await target.targetPool.query<{ name: string }>(
        'SELECT name FROM workspaces WHERE id=$1',
        [workspaceId],
      );
      expect(observed.rows).toEqual([{ name: workspaceName }]);
    } finally {
      await writeFile(release, 'continue', { mode: 0o600 });
      await running;
      await source.targetPool.query(
        'UPDATE workspaces SET name=$1 WHERE id=$2',
        [workspaceName, workspaceId],
      );
      await target.close();
    }
  }, 60_000);

  it('retains an encrypted complete backup without claiming a completed recovery', async () => {
    let exitCode = 0;
    let stdout: string;
    let stderr: string;
    try {
      const result = await execute(
        process.execPath,
        [entry, 'backup', '--config', backupConfig],
        {
          env: { ...process.env, NODE_ENV: 'test' },
          timeout: 30_000,
        },
      );
      stdout = result.stdout;
      stderr = result.stderr;
    } catch (error: unknown) {
      if (
        typeof error !== 'object' ||
        error === null ||
        !('code' in error) ||
        !('stdout' in error) ||
        !('stderr' in error)
      )
        throw error;
      if (
        typeof error.code !== 'number' ||
        typeof error.stdout !== 'string' ||
        typeof error.stderr !== 'string'
      )
        throw error;
      exitCode = error.code;
      stdout = error.stdout;
      stderr = error.stderr;
    }
    // First RED must be this observable incomplete outcome, not a missing file,
    // import, database, tool or malformed fixture.
    expect({ exitCode, stdout, stderr }).toMatchObject({
      exitCode: 0,
      stderr: '',
    });
    expect(stdout).toContain('"outcome":"archive-created"');
    expect(stdout).not.toContain('"outcome":"recovered"');
    const encrypted = await readFile(archivePath);
    expect(encrypted.length).toBeGreaterThan(1024);
    expect(encrypted.includes(Buffer.from('PRISMA-PRIM'))).toBe(false);
    expect(encrypted.includes(Buffer.from(source.targetUrl))).toBe(false);
    await publicEvidence.commitLaterSourceWrite();
    await sourceApplication?.close();
    sourceApplication = undefined;
    await scanner.close();
  }, 30_000);

  it('never overwrites a retained archive or its independent completion report on retry', async () => {
    const before = await readFile(archivePath);
    const config: unknown = JSON.parse(await readFile(backupConfig, 'utf8'));
    if (
      typeof config !== 'object' ||
      config === null ||
      !('completionEvidencePath' in config) ||
      typeof config.completionEvidencePath !== 'string'
    )
      throw new Error('Expected retained completion reference.');
    const completionBefore = await readFile(config.completionEvidencePath);
    const result = await invokeOperator({
      entry,
      operation: 'backup',
      configPath: backupConfig,
      environment: { ...process.env, NODE_ENV: 'test' },
    });
    expect(result).toMatchObject({ exitCode: 1, stderr: '' });
    expect(result.stdout).not.toContain('"outcome":"archive-created"');
    expect(await readFile(archivePath)).toEqual(before);
    expect(await readFile(config.completionEvidencePath)).toEqual(
      completionBefore,
    );
    expect(
      (await readdir(temporaryRoot)).filter((name) =>
        name.endsWith('.staging'),
      ),
    ).toEqual([]);
  }, 30_000);

  it('refuses production, unknown attestation, wrong Workspace and an empty uninitialized source', async () => {
    if (!databaseUrl || !container) throw new Error('Expected supplied tools.');
    const original: unknown = JSON.parse(await readFile(backupConfig, 'utf8'));
    if (
      typeof original !== 'object' ||
      original === null ||
      Array.isArray(original)
    )
      throw new Error('Expected retained configuration.');
    const empty = await createIsolatedPostgresTestDatabase({
      baseDatabaseUrl: databaseUrl,
      namePrefix: 'recovery736_empty',
    });
    try {
      const cases = [
        {
          key: 'production',
          environment: { ...process.env, NODE_ENV: 'production' },
          change: {},
        },
        {
          key: 'attestation',
          environment: { ...process.env, NODE_ENV: 'test' },
          change: { attestation: 'unknown' },
        },
        {
          key: 'wrong-workspace',
          environment: { ...process.env, NODE_ENV: 'test' },
          change: {
            workspace: {
              id: '00000000-0000-4000-8000-000000000999',
              name: workspaceName,
            },
          },
        },
        {
          key: 'non-demo',
          environment: { ...process.env, NODE_ENV: 'test' },
          change: {
            workspace: { id: workspaceId, name: 'Ordinary Workspace' },
          },
        },
        {
          key: 'empty-source',
          environment: { ...process.env, NODE_ENV: 'test' },
          change: { database: { url: empty.targetUrl, container } },
        },
      ];
      for (const entryCase of cases) {
        const rejectedArchive = join(
          temporaryRoot,
          `${entryCase.key}-source.enc`,
        );
        const configPath = join(temporaryRoot, `${entryCase.key}-source.json`);
        await writeFile(
          configPath,
          JSON.stringify({
            ...original,
            ...entryCase.change,
            archivePath: rejectedArchive,
            completionEvidencePath: join(
              temporaryRoot,
              `${entryCase.key}-source-completion.json`,
            ),
          }),
          { mode: 0o600, flag: 'wx' },
        );
        const result = await invokeOperator({
          entry,
          operation: 'backup',
          configPath,
          environment: entryCase.environment,
        });
        expect(result, entryCase.key).toMatchObject({
          exitCode: 2,
          stderr: '',
        });
        expect(result.stdout).toContain('"outcome":"refused"');
        expect(
          await readFile(rejectedArchive).catch(() => undefined),
        ).toBeUndefined();
      }
    } finally {
      await empty.close();
    }
  }, 60_000);

  it('refuses an unsupported committed migration journal without repairing it', async () => {
    const original: unknown = JSON.parse(await readFile(backupConfig, 'utf8'));
    if (
      typeof original !== 'object' ||
      original === null ||
      Array.isArray(original)
    )
      throw new Error('Expected retained configuration.');
    const journal = await source.targetPool.query<{ id: number; hash: string }>(
      'SELECT id, hash FROM drizzle.__drizzle_migrations ORDER BY id LIMIT 1',
    );
    const entryJournal = journal.rows[0];
    if (!entryJournal)
      throw new Error('Expected populated source migration journal.');
    const configPath = join(temporaryRoot, 'migration-refusal.json');
    const rejectedArchive = join(temporaryRoot, 'migration-refusal.enc');
    await writeFile(
      configPath,
      JSON.stringify({
        ...original,
        archivePath: rejectedArchive,
        completionEvidencePath: join(
          temporaryRoot,
          'migration-refusal-completion.json',
        ),
      }),
      { mode: 0o600, flag: 'wx' },
    );
    try {
      await source.targetPool.query(
        'UPDATE drizzle.__drizzle_migrations SET hash=$1 WHERE id=$2',
        ['unsupported-committed-migration', entryJournal.id],
      );
      const result = await invokeOperator({
        entry,
        operation: 'backup',
        configPath,
        environment: { ...process.env, NODE_ENV: 'test' },
      });
      expect(result).toMatchObject({ exitCode: 2, stderr: '' });
      expect(result.stdout).toContain('unsupported-migration-state');
      expect(
        (
          await source.targetPool.query<{ hash: string }>(
            'SELECT hash FROM drizzle.__drizzle_migrations WHERE id=$1',
            [entryJournal.id],
          )
        ).rows,
      ).toEqual([{ hash: 'unsupported-committed-migration' }]);
      expect(
        await readFile(rejectedArchive).catch(() => undefined),
      ).toBeUndefined();
    } finally {
      await source.targetPool.query(
        'UPDATE drizzle.__drizzle_migrations SET hash=$1 WHERE id=$2',
        [entryJournal.hash, entryJournal.id],
      );
    }
  }, 30_000);

  it('refuses unsupported or unavailable supplied tools without leaking their diagnostics', async () => {
    const original: unknown = JSON.parse(await readFile(backupConfig, 'utf8'));
    if (
      typeof original !== 'object' ||
      original === null ||
      Array.isArray(original)
    )
      throw new Error('Expected retained configuration.');
    const realDocker = (await execute('which', ['docker'])).stdout.trim();
    const canary = 'PRIVATE_TOOL_DIAGNOSTIC_CANARY';
    for (const mode of ['unsupported', 'unsupported-suffix', 'unavailable']) {
      const tools = join(temporaryRoot, `tool-${mode}`);
      await mkdir(tools, { mode: 0o700 });
      await writeFile(
        join(tools, 'docker'),
        `#!${process.execPath}\nconst cp = require('node:child_process');\nconst args = process.argv.slice(2);\nif (args.includes('pg_dump') && args.includes('--version')) {\n  if (${JSON.stringify(mode)} === 'unsupported') { process.stdout.write('pg_dump (PostgreSQL) 18.0\\n'); process.exit(0); }\n  if (${JSON.stringify(mode)} === 'unsupported-suffix') { process.stdout.write('pg_dump (PostgreSQL) 17.11 custom\\n'); process.exit(0); }\n  process.stderr.write(${JSON.stringify(canary)}); process.exit(79);\n}\nconst result = cp.spawnSync(${JSON.stringify(realDocker)}, args, { stdio: 'inherit' });\nprocess.exit(result.status ?? 96);\n`,
        { mode: 0o700, flag: 'wx' },
      );
      const rejectedArchive = join(tools, 'backup.enc');
      const configPath = join(tools, 'backup.json');
      await writeFile(
        configPath,
        JSON.stringify({
          ...original,
          archivePath: rejectedArchive,
          completionEvidencePath: join(tools, 'completion.json'),
        }),
        { mode: 0o600, flag: 'wx' },
      );
      const result = await invokeOperator({
        entry,
        operation: 'backup',
        configPath,
        environment: {
          ...process.env,
          NODE_ENV: 'test',
          PATH: `${tools}:${process.env.PATH ?? ''}`,
        },
      });
      expect(result).toMatchObject({
        exitCode: mode === 'unavailable' ? 1 : 2,
        stderr: '',
      });
      expect(result.stdout).not.toContain(canary);
      expect(result.stdout).not.toContain('"outcome":"archive-created"');
      expect(
        await readFile(rejectedArchive).catch(() => undefined),
      ).toBeUndefined();
    }
  }, 60_000);

  it('reports owned cleanup failure without overall success or sensitive diagnostics', async () => {
    const original: unknown = JSON.parse(await readFile(backupConfig, 'utf8'));
    if (
      typeof original !== 'object' ||
      original === null ||
      Array.isArray(original)
    )
      throw new Error('Expected retained configuration.');
    const tools = join(temporaryRoot, 'cleanup-tools');
    await mkdir(tools, { mode: 0o700 });
    const preload = join(tools, 'cleanup.cjs');
    const failedArchive = join(temporaryRoot, 'cleanup-failure-backup.enc');
    const canary = 'PRIVATE_OWNED_CLEANUP_DIAGNOSTIC_CANARY';
    await writeFile(
      preload,
      `const fs = require('node:fs/promises');\nconst original = fs.rm;\nfs.rm = async (path, ...options) => {\n  if (typeof path === 'string' && path.includes('.cleanup-failure-backup.enc.') && path.endsWith('.staging')) throw new Error(${JSON.stringify(canary)});\n  return original(path, ...options);\n};\n`,
      { mode: 0o600, flag: 'wx' },
    );
    const configPath = join(tools, 'backup.json');
    await writeFile(
      configPath,
      JSON.stringify({
        ...original,
        archivePath: failedArchive,
        completionEvidencePath: join(tools, 'completion.json'),
      }),
      { mode: 0o600, flag: 'wx' },
    );
    const result = await invokeOperator({
      entry,
      operation: 'backup',
      configPath,
      environment: { ...process.env, NODE_ENV: 'test' },
      nodeArguments: ['--require', preload],
    });
    expect(result).toMatchObject({ exitCode: 1, stderr: '' });
    expect(result.stdout).toContain('owned-cleanup-incomplete');
    expect(result.stdout).not.toContain('"outcome":"archive-created"');
    expect(result.stdout).not.toContain('"outcome":"recovered"');
    expect(result.stdout).not.toContain(canary);
    expect(result.stdout).not.toContain(source.targetUrl);
    const retained = await readFile(failedArchive);
    expect(retained.length).toBeGreaterThan(1024);
    const staging = (await readdir(temporaryRoot)).filter(
      (name) =>
        name.startsWith('.cleanup-failure-backup.enc.') &&
        name.endsWith('.staging'),
    );
    expect(staging).toHaveLength(1);
    for (const name of staging) {
      const path = join(temporaryRoot, name);
      expect((await stat(path)).mode & 0o077).toBe(0);
      expect(await readFile(path)).toEqual(retained);
      // Explicit fixture-owner cleanup after verifying the command's failure.
      await rm(path);
    }
  }, 30_000);

  it('rejects unauthenticated archives before touching an empty destination', async () => {
    if (!databaseUrl || !container) throw new Error('Expected supplied tools.');
    const target = await createIsolatedPostgresTestDatabase({
      baseDatabaseUrl: databaseUrl,
      namePrefix: 'recovery736_refusals',
    });
    try {
      const original: unknown = JSON.parse(
        await readFile(backupConfig, 'utf8'),
      );
      if (
        typeof original !== 'object' ||
        original === null ||
        Array.isArray(original)
      )
        throw new Error('Expected retained configuration.');
      const archive = await readFile(archivePath);
      const wrongKeyPath = join(temporaryRoot, 'wrong-retained.key');
      await writeFile(wrongKeyPath, randomBytes(32), {
        mode: 0o600,
        flag: 'wx',
      });
      const modified = Buffer.from(archive);
      modified[modified.length - 20] =
        (modified[modified.length - 20] ?? 0) ^ 1;
      const badLength = Buffer.from(archive);
      badLength.writeUInt32BE(0xffffffff, 8);
      const unknownEnvelope = Buffer.from(archive);
      unknownEnvelope.write('PPRREC02', 0, 'ascii');
      const cases = [
        { key: 'wrong-key', bytes: archive, keyPath: wrongKeyPath },
        { key: 'corrupt', bytes: modified },
        { key: 'truncated', bytes: archive.subarray(0, -1) },
        {
          key: 'trailing',
          bytes: Buffer.concat([archive, Buffer.from('trailing')]),
        },
        { key: 'invalid-length', bytes: badLength },
        { key: 'unknown-envelope', bytes: unknownEnvelope },
      ];
      for (const entryCase of cases) {
        const candidateArchive = join(temporaryRoot, `${entryCase.key}.enc`);
        const configPath = join(temporaryRoot, `${entryCase.key}.json`);
        await writeFile(candidateArchive, entryCase.bytes, {
          mode: 0o600,
          flag: 'wx',
        });
        await writeFile(
          configPath,
          JSON.stringify({
            ...original,
            archivePath: candidateArchive,
            ...(entryCase.keyPath ? { keyPath: entryCase.keyPath } : {}),
            database: { url: target.targetUrl, container },
            measurement: {
              referenceInstant: await readRetainedReference({
                completionEvidencePath: completionEvidencePath,
              }),
              maximumRecencyMilliseconds: 300_000,
              maximumRecoveryMilliseconds: 30_000,
            },
          }),
          { mode: 0o600, flag: 'wx' },
        );
        const result = await invokeOperator({
          entry,
          operation: 'restore',
          configPath,
          environment: ordinaryEnvironment(target.targetUrl),
        });
        expect(result, entryCase.key).toMatchObject({
          exitCode: 2,
          stderr: '',
        });
        expect(result.stdout, entryCase.key).toContain('"outcome":"refused"');
        expect(result.stdout).not.toContain('"outcome":"recovered"');
        expect(result.stdout).not.toContain(target.targetUrl);
        // Independent observation after each actual invocation: authentication
        // failure did not create schemas, application tables, or migrations.
        const observer = new Client({ connectionString: target.targetUrl });
        try {
          await observer.connect();
          const objects = await observer.query<{
            count: number;
          }>(`SELECT count(*)::integer AS count FROM pg_class c
            JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname !~ '^pg_' AND n.nspname <> 'information_schema'`);
          expect(objects.rows[0]?.count, entryCase.key).toBe(0);
        } finally {
          await observer.end();
        }
      }
      expect(await readFile(archivePath)).toEqual(archive);
    } finally {
      await target.close();
    }
  }, 60_000);

  it('rolls back an actual mid-restore failure and preserves the retained source and archive', async () => {
    if (!databaseUrl || !container) throw new Error('Expected supplied tools.');
    const original: unknown = JSON.parse(await readFile(backupConfig, 'utf8'));
    if (
      typeof original !== 'object' ||
      original === null ||
      Array.isArray(original) ||
      !('keyPath' in original) ||
      typeof original.keyPath !== 'string' ||
      !('completionEvidencePath' in original) ||
      typeof original.completionEvidencePath !== 'string'
    )
      throw new Error('Expected retained configuration.');
    const archive = await readFile(archivePath);
    const key = await readFile(original.keyPath);
    const headerEnd = 12 + archive.readUInt32BE(8);
    const decipher = createDecipheriv(
      'aes-256-gcm',
      key,
      archive.subarray(headerEnd, headerEnd + 12),
    );
    decipher.setAAD(archive.subarray(0, headerEnd + 12));
    decipher.setAuthTag(archive.subarray(-16));
    const dump = Buffer.concat([
      decipher.update(archive.subarray(headerEnd + 12, -16)),
      decipher.final(),
    ]);
    expect(dump.subarray(0, 5).toString('ascii')).toBe('PGDMP');
    const metadata: unknown = JSON.parse(
      archive.subarray(12, headerEnd).toString('utf8'),
    );
    const completion: unknown = JSON.parse(
      await readFile(original.completionEvidencePath, 'utf8'),
    );
    if (
      typeof metadata !== 'object' ||
      metadata === null ||
      Array.isArray(metadata) ||
      typeof completion !== 'object' ||
      completion === null ||
      Array.isArray(completion)
    )
      throw new Error(
        'Expected complete independently retained envelope evidence.',
      );
    // A holder of the synthetic fixture key supplies an authenticated envelope
    // with a damaged custom dump. Authentication must pass, then real pg_restore
    // must fail after starting its transaction, without committing its tables.
    const damagedDump = dump.subarray(0, -64);
    const metadataBytes = Buffer.from(
      JSON.stringify({ ...metadata, payloadLength: damagedDump.length }),
    );
    const headerLength = Buffer.alloc(4);
    headerLength.writeUInt32BE(metadataBytes.length);
    const nonce = randomBytes(12);
    const header = Buffer.concat([
      archive.subarray(0, 8),
      headerLength,
      metadataBytes,
      nonce,
    ]);
    const cipher = createCipheriv('aes-256-gcm', key, nonce);
    cipher.setAAD(header);
    const damagedArchive = Buffer.concat([
      header,
      cipher.update(damagedDump),
      cipher.final(),
      cipher.getAuthTag(),
    ]);
    key.fill(0);
    dump.fill(0);
    const tools = join(temporaryRoot, 'rollback-tools');
    await mkdir(tools, { mode: 0o700 });
    const toolLog = join(tools, 'owned-restore-diagnostic');
    const realDocker = (await execute('which', ['docker'])).stdout.trim();
    await writeFile(
      join(tools, 'docker'),
      `#!${process.execPath}\nconst fs = require('node:fs');\nconst cp = require('node:child_process');\nconst args = process.argv.slice(2);\nif (args.includes('--single-transaction')) {\n  const result = cp.spawnSync(${JSON.stringify(realDocker)}, [...args, '--verbose'], { stdio: ['inherit', 'inherit', 'pipe'], maxBuffer: 1024 * 1024 });\n  fs.writeFileSync(${JSON.stringify(toolLog)}, result.stderr ?? '', { mode: 0o600, flag: 'wx' });\n  process.stderr.write((result.stderr ?? Buffer.alloc(0)).subarray(-2048));\n  process.exit(result.status ?? 96);\n}\nconst result = cp.spawnSync(${JSON.stringify(realDocker)}, args, { stdio: 'inherit' });\nprocess.exit(result.status ?? 96);\n`,
      { mode: 0o700, flag: 'wx' },
    );
    const failedArchivePath = join(tools, 'authenticated-damaged-dump.enc');
    const failedCompletionPath = join(tools, 'completion.json');
    await writeFile(failedArchivePath, damagedArchive, {
      mode: 0o600,
      flag: 'wx',
    });
    await writeFile(
      failedCompletionPath,
      JSON.stringify({
        ...completion,
        archiveSha256: createHash('sha256')
          .update(damagedArchive)
          .digest('hex'),
      }),
      { mode: 0o600, flag: 'wx' },
    );
    const target = await createIsolatedPostgresTestDatabase({
      baseDatabaseUrl: databaseUrl,
      namePrefix: 'recovery736_rollback',
    });
    try {
      const configPath = join(tools, 'restore.json');
      await writeFile(
        configPath,
        JSON.stringify({
          ...original,
          archivePath: failedArchivePath,
          completionEvidencePath: failedCompletionPath,
          database: { url: target.targetUrl, container },
          measurement: {
            referenceInstant: await readRetainedReference({
              completionEvidencePath: failedCompletionPath,
            }),
            maximumRecencyMilliseconds: 300_000,
            maximumRecoveryMilliseconds: 30_000,
          },
        }),
        { mode: 0o600, flag: 'wx' },
      );
      const result = await invokeOperator({
        entry,
        operation: 'restore',
        configPath,
        environment: {
          ...ordinaryEnvironment(target.targetUrl),
          PATH: `${tools}:${process.env.PATH ?? ''}`,
        },
      });
      expect(result).toMatchObject({ exitCode: 2, stderr: '' });
      expect(result.stdout).toContain('transactional-restore-failed');
      expect(result.stdout).not.toContain('"outcome":"recovered"');
      const diagnostic = await readFile(toolLog, 'utf8');
      expect(diagnostic).toMatch(/creating TABLE/u);
      expect(diagnostic).toMatch(/unexpected end of file|could not read/u);
      const objects = await target.targetPool.query<{
        count: number;
      }>(`SELECT count(*)::integer AS count FROM pg_class c
        JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname !~ '^pg_' AND n.nspname <> 'information_schema'`);
      expect(objects.rows[0]?.count).toBe(0);
      expect(
        (
          await source.targetPool.query<{ name: string }>(
            'SELECT name FROM workspaces WHERE id=$1',
            [workspaceId],
          )
        ).rows,
      ).toEqual([{ name: workspaceName }]);
      expect(await readFile(archivePath)).toEqual(archive);
    } finally {
      await target.close();
    }
  }, 60_000);

  it('refuses mismatched verification profiles without rewriting restored identities', async () => {
    if (!databaseUrl || !container) throw new Error('Expected supplied tools.');
    const original: unknown = JSON.parse(await readFile(backupConfig, 'utf8'));
    if (
      typeof original !== 'object' ||
      original === null ||
      Array.isArray(original) ||
      !('verificationEvidencePath' in original) ||
      typeof original.verificationEvidencePath !== 'string'
    )
      throw new Error('Expected retained configuration.');
    const evidence: unknown = JSON.parse(
      await readFile(original.verificationEvidencePath, 'utf8'),
    );
    if (
      typeof evidence !== 'object' ||
      evidence === null ||
      Array.isArray(evidence) ||
      !('principals' in evidence) ||
      !Array.isArray(evidence.principals)
    )
      throw new Error('Expected independently captured principals.');
    const principals = evidence.principals.map((value: unknown) => {
      if (
        typeof value !== 'object' ||
        value === null ||
        Array.isArray(value) ||
        !('key' in value)
      )
        throw new Error('Expected principal boundary.');
      return value.key === 'owner'
        ? { ...value, displayName: 'Unpersisted replacement DEMO profile' }
        : value;
    });
    const tools = join(temporaryRoot, 'profile-mismatch');
    await mkdir(tools, { mode: 0o700 });
    const evidencePath = join(tools, 'expectations.json');
    await writeFile(evidencePath, JSON.stringify({ ...evidence, principals }), {
      mode: 0o600,
      flag: 'wx',
    });
    const mismatched = {
      ...original,
      archivePath: join(tools, 'backup.enc'),
      completionEvidencePath: join(tools, 'completion.json'),
      verificationEvidencePath: evidencePath,
    };
    const configPath = join(tools, 'backup.json');
    await writeFile(configPath, JSON.stringify(mismatched), {
      mode: 0o600,
      flag: 'wx',
    });
    const backup = await invokeOperator({
      entry,
      operation: 'backup',
      configPath,
      environment: { ...process.env, NODE_ENV: 'test' },
    });
    expect(backup).toMatchObject({ exitCode: 0, stderr: '' });
    const sourceIdentity = await source.targetPool.query<{
      displayName: string;
      email: string;
    }>(
      `SELECT display_name AS "displayName", email FROM internal_users WHERE external_provider=$1 AND external_subject=$2`,
      [owner.provider, owner.subject],
    );
    expect(sourceIdentity.rows).toEqual([
      { displayName: owner.displayName, email: owner.email },
    ]);
    const target = await createIsolatedPostgresTestDatabase({
      baseDatabaseUrl: databaseUrl,
      namePrefix: 'recovery736_profile',
    });
    try {
      const restoreConfig = join(tools, 'restore.json');
      await writeFile(
        restoreConfig,
        JSON.stringify({
          ...mismatched,
          database: { url: target.targetUrl, container },
          measurement: {
            referenceInstant: await readRetainedReference({
              completionEvidencePath: mismatched.completionEvidencePath,
            }),
            maximumRecencyMilliseconds: 300_000,
            maximumRecoveryMilliseconds: 30_000,
          },
        }),
        { mode: 0o600, flag: 'wx' },
      );
      const result = await invokeOperator({
        entry,
        operation: 'restore',
        configPath: restoreConfig,
        environment: ordinaryEnvironment(target.targetUrl),
      });
      expect(result).toMatchObject({ exitCode: 2, stderr: '' });
      expect(result.stdout).not.toContain('"outcome":"recovered"');
      const restoredIdentity = await target.targetPool.query<{
        displayName: string;
        email: string;
      }>(
        `SELECT display_name AS "displayName", email FROM internal_users WHERE external_provider=$1 AND external_subject=$2`,
        [owner.provider, owner.subject],
      );
      expect(restoredIdentity.rows).toEqual(sourceIdentity.rows);
      expect(result.stdout).toContain('persisted-principal-mismatch');
    } finally {
      await target.close();
    }
  }, 60_000);

  it('refuses a database name that libpq would reinterpret as another database', async () => {
    if (!databaseUrl || !container) throw new Error('Expected supplied tools.');
    const original: unknown = JSON.parse(await readFile(backupConfig, 'utf8'));
    if (
      typeof original !== 'object' ||
      original === null ||
      Array.isArray(original)
    )
      throw new Error('Expected retained configuration.');
    const sentinel = await createIsolatedPostgresTestDatabase({
      baseDatabaseUrl: databaseUrl,
      namePrefix: 'r736route',
    });
    const literalName = `dbname=${sentinel.databaseName}`;
    expect(literalName.length).toBeLessThanOrEqual(63);
    const literalUrl = new URL(sentinel.targetUrl);
    literalUrl.pathname = `/${literalName}`;
    let literalCreated = false;
    try {
      await sentinel.targetPool.query(
        'CREATE TABLE foreign_workload_synthetic (marker text NOT NULL)',
      );
      await sentinel.targetPool.query(
        "INSERT INTO foreign_workload_synthetic VALUES ('DEMO controlled existing workload')",
      );
      // Generated fixture-owned names contain only the fixed prefix, '=', and
      // the already validated isolated helper identifier; no caller SQL input.
      await sentinel.administrationPool.query(
        `CREATE DATABASE "${literalName}"`,
      );
      literalCreated = true;
      const configPath = join(temporaryRoot, 'connection-info-restore.json');
      await writeFile(
        configPath,
        JSON.stringify({
          ...original,
          database: { url: literalUrl.toString(), container },
          measurement: {
            referenceInstant: await readRetainedReference({
              completionEvidencePath: completionEvidencePath,
            }),
            maximumRecencyMilliseconds: 300_000,
            maximumRecoveryMilliseconds: 30_000,
          },
        }),
        { mode: 0o600, flag: 'wx' },
      );
      const result = await invokeOperator({
        entry,
        operation: 'restore',
        configPath,
        environment: ordinaryEnvironment(literalUrl.toString()),
      });
      const observed = await sentinel.targetPool.query<{
        marker: string;
        application: string | null;
      }>(
        `SELECT marker, to_regclass('public.workspaces')::text AS application FROM foreign_workload_synthetic`,
      );
      expect(observed.rows).toEqual([
        { marker: 'DEMO controlled existing workload', application: null },
      ]);
      expect(result).toMatchObject({ exitCode: 2, stderr: '' });
      expect(result.stdout).toContain('invalid-database-name');
    } finally {
      if (literalCreated)
        await sentinel.administrationPool.query(
          `DROP DATABASE IF EXISTS "${literalName}" WITH (FORCE)`,
        );
      await sentinel.close();
    }
  }, 30_000);

  it('refuses an ordinary large object even when destination schemas are otherwise empty', async () => {
    if (!databaseUrl || !container) throw new Error('Expected supplied tools.');
    const original: unknown = JSON.parse(await readFile(backupConfig, 'utf8'));
    if (
      typeof original !== 'object' ||
      original === null ||
      Array.isArray(original)
    )
      throw new Error('Expected retained configuration.');
    const target = await createIsolatedPostgresTestDatabase({
      baseDatabaseUrl: databaseUrl,
      namePrefix: 'recovery736_objects',
    });
    const creator = new Client({ connectionString: target.targetUrl });
    try {
      await creator.connect();
      await creator.query(
        "SELECT lo_from_bytea(736, decode('44454D4F', 'hex'))",
      );
    } finally {
      await creator.end();
    }
    try {
      const configPath = join(temporaryRoot, 'large-object-restore.json');
      await writeFile(
        configPath,
        JSON.stringify({
          ...original,
          database: { url: target.targetUrl, container },
          measurement: {
            referenceInstant: await readRetainedReference({
              completionEvidencePath: completionEvidencePath,
            }),
            maximumRecencyMilliseconds: 300_000,
            maximumRecoveryMilliseconds: 30_000,
          },
        }),
        { mode: 0o600, flag: 'wx' },
      );
      const result = await invokeOperator({
        entry,
        operation: 'restore',
        configPath,
        environment: ordinaryEnvironment(target.targetUrl),
      });
      const observed = await target.targetPool.query<{
        bytes: string;
        application: string | null;
      }>(
        `SELECT encode(lo_get(736), 'hex') AS bytes, to_regclass('public.workspaces')::text AS application`,
      );
      expect(observed.rows).toEqual([{ bytes: '44454d4f', application: null }]);
      expect(result).toMatchObject({ exitCode: 2, stderr: '' });
      expect(result.stdout).toContain('nonempty-or-incompatible-destination');
    } finally {
      await target.close();
    }
  }, 30_000);

  it('refuses destination-only default privileges without changing grants, source or retained evidence', async () => {
    if (!databaseUrl || !container) throw new Error('Expected supplied tools.');
    const original: unknown = JSON.parse(await readFile(backupConfig, 'utf8'));
    if (
      typeof original !== 'object' ||
      original === null ||
      Array.isArray(original)
    )
      throw new Error('Expected retained configuration.');
    const target = await createIsolatedPostgresTestDatabase({
      baseDatabaseUrl: databaseUrl,
      namePrefix: 'recovery736_default_acl',
    });
    const setup = new Client({ connectionString: target.targetUrl });
    let expectedPrivileges: unknown;
    try {
      await setup.connect();
      await setup.query(
        'ALTER DEFAULT PRIVILEGES GRANT SELECT ON TABLES TO PUBLIC',
      );
      expectedPrivileges = (
        await setup.query(
          'SELECT defaclrole, defaclnamespace, defaclobjtype, defaclacl::text AS privileges FROM pg_default_acl ORDER BY oid',
        )
      ).rows;
      expect(expectedPrivileges).toHaveLength(1);
    } finally {
      await setup.end();
    }
    const retainedArchive = await readFile(archivePath);
    const retainedCompletion = await readFile(completionEvidencePath);
    const sourceBefore = await source.targetPool.query<{ count: number }>(
      'SELECT count(*)::integer AS count FROM client_accounts',
    );
    try {
      const configPath = join(temporaryRoot, 'default-privileges-restore.json');
      await writeFile(
        configPath,
        JSON.stringify({
          ...original,
          database: { url: target.targetUrl, container },
          measurement: {
            referenceInstant: await readRetainedReference({
              completionEvidencePath,
            }),
            maximumRecencyMilliseconds: 300_000,
            maximumRecoveryMilliseconds: 30_000,
          },
        }),
        { mode: 0o600, flag: 'wx' },
      );
      const result = await invokeOperator({
        entry,
        operation: 'restore',
        configPath,
        environment: ordinaryEnvironment(target.targetUrl),
      });
      expect(result).toMatchObject({ exitCode: 2, stderr: '' });
      expect(result.stdout).toContain('nonempty-or-incompatible-destination');
      expect(result.stdout).not.toContain('"outcome":"recovered"');
      expect(
        (
          await target.targetPool.query<{ application: string | null }>(
            "SELECT to_regclass('public.workspaces')::text AS application",
          )
        ).rows,
      ).toEqual([{ application: null }]);
      expect(
        (
          await target.targetPool.query(
            'SELECT defaclrole, defaclnamespace, defaclobjtype, defaclacl::text AS privileges FROM pg_default_acl ORDER BY oid',
          )
        ).rows,
      ).toEqual(expectedPrivileges);
      expect(
        (
          await source.targetPool.query(
            'SELECT count(*)::integer AS count FROM client_accounts',
          )
        ).rows,
      ).toEqual(sourceBefore.rows);
      expect(await readFile(archivePath)).toEqual(retainedArchive);
      expect(await readFile(completionEvidencePath)).toEqual(
        retainedCompletion,
      );
    } finally {
      await target.close();
    }
  }, 30_000);

  it.each([
    {
      name: 'public-collation',
      create: 'CREATE COLLATION public.destination_only FROM pg_catalog."C"',
      inspect:
        "SELECT to_jsonb(c) AS object FROM pg_collation c WHERE collname='destination_only'",
    },
    {
      name: 'catalog-collation',
      create:
        'CREATE COLLATION pg_catalog.destination_only FROM pg_catalog."C"',
      inspect:
        "SELECT to_jsonb(c) AS object FROM pg_collation c WHERE collname='destination_only'",
    },
    {
      name: 'text-search-configuration',
      create:
        'CREATE TEXT SEARCH CONFIGURATION public.destination_only (COPY=pg_catalog.simple)',
      inspect:
        "SELECT to_jsonb(c) AS object FROM pg_ts_config c WHERE cfgname='destination_only'",
    },
    {
      name: 'foreign-data-wrapper',
      create: 'CREATE FOREIGN DATA WRAPPER destination_only',
      inspect:
        "SELECT to_jsonb(c) AS object FROM pg_foreign_data_wrapper c WHERE fdwname='destination_only'",
    },
    {
      name: 'access-method',
      create:
        'CREATE ACCESS METHOD destination_only TYPE TABLE HANDLER pg_catalog.heap_tableam_handler',
      inspect:
        "SELECT to_jsonb(c) AS object FROM pg_am c WHERE amname='destination_only'",
    },
  ])(
    'refuses destination-only standalone $name without changing source or retained inputs',
    async (fixture) => {
      if (!databaseUrl || !container)
        throw new Error('Expected supplied tools.');
      const original: unknown = JSON.parse(
        await readFile(backupConfig, 'utf8'),
      );
      if (
        typeof original !== 'object' ||
        original === null ||
        Array.isArray(original) ||
        !('keyPath' in original) ||
        typeof original.keyPath !== 'string' ||
        !('verificationEvidencePath' in original) ||
        typeof original.verificationEvidencePath !== 'string'
      )
        throw new Error('Expected independently retained inputs.');
      const target = await createIsolatedPostgresTestDatabase({
        baseDatabaseUrl: databaseUrl,
        namePrefix: 'recovery736_standalone',
      });
      const setup = new Client({ connectionString: target.targetUrl });
      let expectedObject: unknown;
      const inspectObject = fixture.inspect;
      try {
        await setup.connect();
        await setup.query(fixture.create);
        expectedObject = (await setup.query(inspectObject)).rows;
        expect(expectedObject).toHaveLength(1);
      } finally {
        await setup.end();
      }
      const retainedPaths = [
        archivePath,
        completionEvidencePath,
        original.keyPath,
        original.verificationEvidencePath,
      ];
      const retainedBefore = await fingerprintRetainedFiles(retainedPaths);
      const sourceBefore = (
        await source.targetPool.query(
          'SELECT to_jsonb(c) AS record FROM client_accounts c ORDER BY id',
        )
      ).rows;
      try {
        const configPath = join(
          temporaryRoot,
          `standalone-${fixture.name}-restore.json`,
        );
        await writeFile(
          configPath,
          JSON.stringify({
            ...original,
            database: { url: target.targetUrl, container },
            measurement: {
              referenceInstant: await readRetainedReference({
                completionEvidencePath,
              }),
              maximumRecencyMilliseconds: 300_000,
              maximumRecoveryMilliseconds: 30_000,
            },
          }),
          { mode: 0o600, flag: 'wx' },
        );
        const result = await invokeOperator({
          entry,
          operation: 'restore',
          configPath,
          environment: ordinaryEnvironment(target.targetUrl),
        });
        // This valid invocation must refuse before any application restoration.
        expect(result, result.stdout).toMatchObject({
          exitCode: 2,
          stderr: '',
        });
        expect(result.stdout).toContain('nonempty-or-incompatible-destination');
        expect(result.stdout).not.toContain('"outcome":"recovered"');
        expect(
          (
            await target.targetPool.query(
              "SELECT to_regclass('public.workspaces')::text AS application",
            )
          ).rows,
        ).toEqual([{ application: null }]);
        expect((await target.targetPool.query(inspectObject)).rows).toEqual(
          expectedObject,
        );
        expect(
          (
            await source.targetPool.query(
              'SELECT to_jsonb(c) AS record FROM client_accounts c ORDER BY id',
            )
          ).rows,
        ).toEqual(sourceBefore);
        expect(await fingerprintRetainedFiles(retainedPaths)).toEqual(
          retainedBefore,
        );
      } finally {
        await target.close();
      }
    },
    30_000,
  );

  it.each([
    { operation: 'backup', input: 'config' },
    { operation: 'backup', input: 'keyPath' },
    { operation: 'backup', input: 'verificationEvidencePath' },
    { operation: 'restore', input: 'config' },
    { operation: 'restore', input: 'archivePath' },
    { operation: 'restore', input: 'keyPath' },
    { operation: 'restore', input: 'verificationEvidencePath' },
    { operation: 'restore', input: 'completionEvidencePath' },
  ] satisfies readonly (
    | {
        readonly operation: 'backup';
        readonly input: 'config' | 'keyPath' | 'verificationEvidencePath';
      }
    | {
        readonly operation: 'restore';
        readonly input:
          | 'config'
          | 'archivePath'
          | 'keyPath'
          | 'verificationEvidencePath'
          | 'completionEvidencePath';
      }
  )[])(
    'refuses protected FIFO $operation $input promptly without a writer',
    async (fixture) => {
      if (!databaseUrl || !container)
        throw new Error('Expected supplied tools.');
      const original: unknown = JSON.parse(
        await readFile(backupConfig, 'utf8'),
      );
      if (
        typeof original !== 'object' ||
        original === null ||
        Array.isArray(original) ||
        !('keyPath' in original) ||
        typeof original.keyPath !== 'string' ||
        !('verificationEvidencePath' in original) ||
        typeof original.verificationEvidencePath !== 'string'
      )
        throw new Error('Expected independently retained inputs.');
      const target =
        fixture.operation === 'restore'
          ? await createIsolatedPostgresTestDatabase({
              baseDatabaseUrl: databaseUrl,
              namePrefix: 'recovery736_fifo',
            })
          : undefined;
      try {
        const targetUrl = target?.targetUrl ?? source.targetUrl;
        const fifo = join(
          temporaryRoot,
          `${fixture.operation}-${fixture.input}.fifo`,
        );
        await execute('mkfifo', ['-m', '600', fifo], { timeout: 5_000 });
        const details = await stat(fifo);
        expect(details.isFIFO()).toBe(true);
        expect(details.mode & 0o077).toBe(0);
        const configPath =
          fixture.input === 'config'
            ? fifo
            : join(
                temporaryRoot,
                `fifo-${fixture.operation}-${fixture.input}.json`,
              );
        if (fixture.input !== 'config') {
          await writeFile(
            configPath,
            JSON.stringify({
              ...original,
              database: { url: targetUrl, container },
              ...(fixture.operation === 'restore'
                ? {
                    measurement: {
                      referenceInstant: await readRetainedReference({
                        completionEvidencePath,
                      }),
                      maximumRecencyMilliseconds: 300_000,
                      maximumRecoveryMilliseconds: 30_000,
                    },
                  }
                : {}),
              [fixture.input]: fifo,
            }),
            { mode: 0o600, flag: 'wx' },
          );
        }
        const sourceBefore = (
          await source.targetPool.query(
            'SELECT to_jsonb(c) AS record FROM client_accounts c ORDER BY id',
          )
        ).rows;
        const retainedPaths = [
          archivePath,
          completionEvidencePath,
          original.keyPath,
          original.verificationEvidencePath,
        ];
        const retainedBefore = await fingerprintRetainedFiles(retainedPaths);
        const filesBefore = (await readdir(temporaryRoot)).sort();
        const child = spawn(
          process.execPath,
          [entry, fixture.operation, '--config', configPath],
          {
            env: ordinaryEnvironment(targetUrl),
            stdio: ['ignore', 'pipe', 'pipe'],
          },
        );
        let stdout = '';
        let stderr = '';
        let result:
          { code: number | null; signal: NodeJS.Signals | null } | undefined;
        let spawnFailure: Error | undefined;
        child.stdout.on('data', (bytes: Buffer) => {
          stdout += bytes.toString('utf8');
        });
        child.stderr.on('data', (bytes: Buffer) => {
          stderr += bytes.toString('utf8');
        });
        child.once('error', (error) => {
          spawnFailure = error;
        });
        const closed = new Promise<void>((done) =>
          child.once('close', (code, signal) => {
            result = { code, signal };
            done();
          }),
        );
        try {
          // No writer is opened, including while cancellation/cleanup is handled.
          await vi.waitFor(
            () => {
              if (spawnFailure) throw spawnFailure;
              expect(result).toEqual({ code: 2, signal: null });
            },
            { timeout: 5_000, interval: 10 },
          );
          await closed;
          expect(stdout).toContain('"outcome":"refused"');
          expect(stdout).toContain('unprotected-or-oversized-input');
          expect(stdout).not.toContain(fifo);
          expect(stdout).not.toContain(targetUrl);
          expect(stdout).not.toContain(source.targetUrl);
          expect(stderr).toBe('');
          expect((await stat(fifo)).isFIFO()).toBe(true);
          expect((await readdir(temporaryRoot)).sort()).toEqual(filesBefore);
          expect(await fingerprintRetainedFiles(retainedPaths)).toEqual(
            retainedBefore,
          );
          expect(
            (
              await source.targetPool.query(
                'SELECT to_jsonb(c) AS record FROM client_accounts c ORDER BY id',
              )
            ).rows,
          ).toEqual(sourceBefore);
          if (target)
            expect(
              (
                await target.targetPool.query(
                  "SELECT to_regclass('public.workspaces')::text AS application",
                )
              ).rows,
            ).toEqual([{ application: null }]);
        } finally {
          if (!result) {
            child.kill('SIGTERM');
            await new Promise((done) => setTimeout(done, 500));
            if (!result) child.kill('SIGKILL');
          }
          await closed;
        }
      } finally {
        await target?.close();
      }
    },
    15_000,
  );

  it('refuses an otherwise empty destination with another connected workload', async () => {
    if (!databaseUrl || !container) throw new Error('Expected supplied tools.');
    const target = await createIsolatedPostgresTestDatabase({
      baseDatabaseUrl: databaseUrl,
      namePrefix: 'recovery736_shared',
    });
    const workload = new Client({ connectionString: target.targetUrl });
    try {
      await workload.connect();
      const original: unknown = JSON.parse(
        await readFile(backupConfig, 'utf8'),
      );
      if (
        typeof original !== 'object' ||
        original === null ||
        Array.isArray(original)
      )
        throw new Error('Expected retained configuration.');
      const configPath = join(temporaryRoot, 'shared-restore.json');
      await writeFile(
        configPath,
        JSON.stringify({
          ...original,
          database: { url: target.targetUrl, container },
          measurement: {
            referenceInstant: await readRetainedReference({
              completionEvidencePath: completionEvidencePath,
            }),
            maximumRecencyMilliseconds: 300_000,
            maximumRecoveryMilliseconds: 30_000,
          },
        }),
        { mode: 0o600, flag: 'wx' },
      );
      const result = await invokeOperator({
        entry,
        operation: 'restore',
        configPath,
        environment: ordinaryEnvironment(target.targetUrl),
      });
      expect(result).toMatchObject({ exitCode: 2, stderr: '' });
      expect(result.stdout).toContain('shared-destination');
      const objects = await workload.query<{
        count: number;
      }>(`SELECT count(*)::integer AS count FROM pg_class c
        JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname !~ '^pg_' AND n.nspname <> 'information_schema'`);
      expect(objects.rows[0]?.count).toBe(0);
    } finally {
      await workload.end();
      await target.close();
    }
  }, 30_000);

  it.each(callerBoundRejectionFixtures)(
    'refuses the $key caller contract before mutation',
    async (entryCase) => {
      if (!databaseUrl || !container)
        throw new Error('Expected supplied tools.');
      const target = await createIsolatedPostgresTestDatabase({
        baseDatabaseUrl: databaseUrl,
        namePrefix: 'recovery736_bounds',
      });
      try {
        const original: unknown = JSON.parse(
          await readFile(backupConfig, 'utf8'),
        );
        if (
          typeof original !== 'object' ||
          original === null ||
          Array.isArray(original)
        )
          throw new Error('Expected retained configuration.');
        const validMeasurement = {
          referenceInstant: await readRetainedReference({
            completionEvidencePath: completionEvidencePath,
          }),
          maximumRecencyMilliseconds: 300_000,
          maximumRecoveryMilliseconds: 30_000,
        };
        const configPath = join(temporaryRoot, `${entryCase.key}-bounds.json`);
        const serialized = JSON.stringify({
          ...original,
          key: entryCase.key,
          ...entryCase.change(validMeasurement),
          database: { url: target.targetUrl, container },
        });
        await writeFile(
          configPath,
          entryCase.key === 'nonfinite'
            ? serialized.replace(
                '"maximumRecencyMilliseconds":300000',
                '"maximumRecencyMilliseconds":1e999',
              )
            : serialized,
          { mode: 0o600, flag: 'wx' },
        );
        const result = await invokeOperator({
          entry,
          operation: 'restore',
          configPath,
          environment: ordinaryEnvironment(target.targetUrl),
        });
        expect(result, entryCase.key).toMatchObject({
          exitCode: 2,
          stderr: '',
        });
        expect(result.stdout).toContain('"outcome":"refused"');
        const observer = new Client({ connectionString: target.targetUrl });
        try {
          await observer.connect();
          const objects = await observer.query<{
            count: number;
          }>(`SELECT count(*)::integer AS count FROM pg_class c
            JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname !~ '^pg_' AND n.nspname <> 'information_schema'`);
          expect(objects.rows[0]?.count, entryCase.key).toBe(0);
        } finally {
          await observer.end();
        }
      } finally {
        await target.close();
      }
    },
    60_000,
  );

  it.each([true, false])(
    'settles a blocked source query and cleans owned sessions while the external lock stays held (cancel: %s)',
    async (cancel) => {
      const original: unknown = JSON.parse(
        await readFile(backupConfig, 'utf8'),
      );
      if (
        typeof original !== 'object' ||
        original === null ||
        Array.isArray(original)
      )
        throw new Error('Expected retained configuration.');
      const retainedArchive = await readFile(archivePath);
      const retainedCompletion = await readFile(completionEvidencePath);
      const blockedArchive = join(
        temporaryRoot,
        `blocked-${cancel}-backup.enc`,
      );
      const blockedCompletion = join(
        temporaryRoot,
        `blocked-${cancel}-completion.json`,
      );
      const configPath = join(temporaryRoot, `blocked-${cancel}-backup.json`);
      await writeFile(
        configPath,
        JSON.stringify({
          ...original,
          archivePath: blockedArchive,
          completionEvidencePath: blockedCompletion,
        }),
        { mode: 0o600, flag: 'wx' },
      );
      const sourceBefore = await source.targetPool.query<{ count: number }>(
        'SELECT count(*)::integer AS count FROM client_accounts',
      );
      const filesBefore = (await readdir(temporaryRoot)).sort();
      const locker = new Client({ connectionString: source.targetUrl });
      await locker.connect();
      await locker.query('BEGIN');
      await locker.query('LOCK public.workspaces IN ACCESS EXCLUSIVE MODE');
      const locked = await locker.query<{ pid: number }>(
        'SELECT pg_backend_pid() AS pid',
      );
      const lockerPid = locked.rows[0]?.pid;
      if (lockerPid === undefined)
        throw new Error('Expected external lock owner.');
      const child = spawn(
        process.execPath,
        [entry, 'backup', '--config', configPath],
        {
          env: { ...process.env, NODE_ENV: 'test' },
          stdio: ['ignore', 'pipe', 'pipe'],
        },
      );
      let stdout = '';
      let stderr = '';
      let outcome:
        { code: number | null; signal: NodeJS.Signals | null } | undefined;
      let spawnFailure: Error | undefined;
      child.stdout.on('data', (bytes: Buffer) => {
        stdout += bytes.toString('utf8');
      });
      child.stderr.on('data', (bytes: Buffer) => {
        stderr += bytes.toString('utf8');
      });
      child.once('error', (error) => {
        spawnFailure = error;
      });
      child.once('exit', (code, signal) => {
        outcome = { code, signal };
      });
      const closed = new Promise<void>((done) =>
        child.once('close', () => done()),
      );
      let blockedPid: number | undefined;
      try {
        await vi.waitFor(
          async () => {
            if (spawnFailure) throw spawnFailure;
            const blocked = await source.targetPool.query<{ pid: number }>(
              `SELECT a.pid FROM pg_stat_activity a JOIN pg_locks l ON l.pid=a.pid
             WHERE a.datname=$1 AND l.relation='public.workspaces'::regclass
             AND l.mode='AccessShareLock' AND NOT l.granted`,
              [source.databaseName],
            );
            expect(blocked.rows).toHaveLength(1);
            blockedPid = blocked.rows[0]?.pid;
          },
          { timeout: 10_000, interval: 10 },
        );
        if (blockedPid === undefined)
          throw new Error('Expected blocked operator session.');
        if (cancel) child.kill('SIGTERM');
        await vi.waitFor(
          () => {
            if (spawnFailure) throw spawnFailure;
            expect(outcome).toEqual({ code: cancel ? 2 : 1, signal: null });
          },
          { timeout: cancel ? 2_000 : 8_000, interval: 10 },
        );
        await closed;
        expect(stdout).toContain(
          cancel ? '"outcome":"cancelled"' : '"outcome":"failed"',
        );
        expect(stdout).toContain(
          cancel ? 'backup-cancelled' : 'backup-incomplete',
        );
        expect(stdout).not.toContain(source.targetUrl);
        expect(stderr).toBe('');
        expect(
          (
            await source.targetPool.query(
              'SELECT pid FROM pg_stat_activity WHERE pid=$1',
              [blockedPid],
            )
          ).rows,
        ).toEqual([]);
        expect(
          (
            await source.targetPool.query(
              `SELECT pid FROM pg_locks WHERE pid=$1 AND relation='public.workspaces'::regclass
           AND mode='AccessExclusiveLock' AND granted`,
              [lockerPid],
            )
          ).rows,
        ).toEqual([{ pid: lockerPid }]);
        expect(
          (
            await source.targetPool.query(
              'SELECT count(*)::integer AS count FROM client_accounts',
            )
          ).rows,
        ).toEqual(sourceBefore.rows);
        expect(
          await readFile(blockedArchive).catch(() => undefined),
        ).toBeUndefined();
        expect(
          await readFile(blockedCompletion).catch(() => undefined),
        ).toBeUndefined();
        expect((await readdir(temporaryRoot)).sort()).toEqual(filesBefore);
        expect(await readFile(archivePath)).toEqual(retainedArchive);
        expect(await readFile(completionEvidencePath)).toEqual(
          retainedCompletion,
        );
      } finally {
        child.kill('SIGKILL');
        await closed;
        await locker.query('ROLLBACK');
        await locker.end();
      }
    },
    30_000,
  );

  it('handles cancellation during dumping and cleans only its owned child and staging', async () => {
    const original: unknown = JSON.parse(await readFile(backupConfig, 'utf8'));
    if (
      typeof original !== 'object' ||
      original === null ||
      Array.isArray(original)
    )
      throw new Error('Expected retained configuration.');
    const controlledTools = join(temporaryRoot, 'cancellation-tools');
    await mkdir(controlledTools, { mode: 0o700 });
    const docker = (await execute('which', ['docker'])).stdout.trim();
    const barrierPath = join(temporaryRoot, 'dump-barrier.json');
    const wrapperPath = join(controlledTools, 'docker');
    // A controlled real child-process boundary; all unblocked tool calls still
    // execute the supplied Docker binary. No production flag or timing sleep.
    await writeFile(
      wrapperPath,
      `#!${process.execPath}\nconst fs = require('node:fs');\nconst cp = require('node:child_process');\nconst args = process.argv.slice(2);\nif (args.some(value => value.startsWith('--snapshot='))) {\n  fs.writeFileSync(${JSON.stringify(barrierPath)}, JSON.stringify({ pid: process.pid }), { mode: 0o600, flag: 'wx' });\n  setTimeout(() => process.exit(95), 20000);\n} else {\n  const result = cp.spawnSync(${JSON.stringify(docker)}, args, { stdio: 'inherit' });\n  process.exit(result.status ?? 96);\n}\n`,
      { mode: 0o700, flag: 'wx' },
    );
    await chmod(wrapperPath, 0o700);
    const cancelledArchive = join(temporaryRoot, 'cancelled-backup.enc');
    const configPath = join(temporaryRoot, 'cancelled-backup.json');
    await writeFile(
      configPath,
      JSON.stringify({
        ...original,
        archivePath: cancelledArchive,
        completionEvidencePath: join(
          temporaryRoot,
          'cancelled-completion.json',
        ),
      }),
      { mode: 0o600, flag: 'wx' },
    );
    const child = spawn(
      process.execPath,
      [entry, 'backup', '--config', configPath],
      {
        env: {
          ...process.env,
          NODE_ENV: 'test',
          PATH: `${controlledTools}:${process.env.PATH ?? ''}`,
        },
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    );
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (bytes: Buffer) => {
      stdout += bytes.toString('utf8');
    });
    child.stderr.on('data', (bytes: Buffer) => {
      stderr += bytes.toString('utf8');
    });
    const exited = new Promise<{
      code: number | null;
      signal: NodeJS.Signals | null;
    }>((done, fail) => {
      child.once('error', fail);
      child.once('exit', (code, signal) => done({ code, signal }));
    });
    const closed = new Promise<void>((done) =>
      child.once('close', () => done()),
    );
    let toolPid: number | undefined;
    try {
      await vi.waitFor(
        async () => {
          const value: unknown = JSON.parse(
            await readFile(barrierPath, 'utf8'),
          );
          if (
            typeof value !== 'object' ||
            value === null ||
            !('pid' in value) ||
            typeof value.pid !== 'number' ||
            !Number.isInteger(value.pid) ||
            value.pid <= 0
          )
            throw new Error('Expected owned child barrier.');
          toolPid = value.pid;
        },
        { timeout: 10_000, interval: 10 },
      );
      child.kill('SIGTERM');
      expect(await exited).toEqual({ code: 2, signal: null });
      expect(stdout).toContain('cancelled');
      expect(stdout).not.toContain(source.targetUrl);
      expect(stderr).toBe('');
      expect(
        await readFile(cancelledArchive).catch(() => undefined),
      ).toBeUndefined();
      if (!toolPid) throw new Error('Expected owned tool process.');
      const ownedTool = toolPid;
      expect(() => process.kill(ownedTool, 0)).toThrow();
    } finally {
      child.kill('SIGKILL');
      if (toolPid) {
        try {
          process.kill(toolPid, 'SIGKILL');
        } catch {
          /* Already cleaned. */
        }
      }
      await closed;
    }
  }, 30_000);

  it('settles cancellation during blocked public verification without releasing the external lock', async () => {
    if (!databaseUrl || !container) throw new Error('Expected supplied tools.');
    const original: unknown = JSON.parse(await readFile(backupConfig, 'utf8'));
    if (
      typeof original !== 'object' ||
      original === null ||
      Array.isArray(original)
    )
      throw new Error('Expected retained configuration.');
    const retainedArchive = await readFile(archivePath);
    const retainedCompletion = await readFile(completionEvidencePath);
    const sourceBefore = await source.targetPool.query<{ count: number }>(
      'SELECT count(*)::integer AS count FROM client_accounts',
    );
    const target = await createIsolatedPostgresTestDatabase({
      baseDatabaseUrl: databaseUrl,
      namePrefix: 'recovery736_public_lock',
    });
    try {
      const tools = join(temporaryRoot, 'public-verification-tools');
      await mkdir(tools, { mode: 0o700 });
      const barrier = join(tools, 'restore-complete.json');
      const release = join(tools, 'continue');
      const realDocker = (await execute('which', ['docker'])).stdout.trim();
      // Wait only after the real single-transaction restore has committed.
      // Admission therefore sees the original empty, unshared destination.
      await writeFile(
        join(tools, 'docker'),
        `#!${process.execPath}\nconst fs = require('node:fs');\nconst cp = require('node:child_process');\nconst args = process.argv.slice(2);\nconst result = cp.spawnSync(${JSON.stringify(realDocker)}, args, { stdio: 'inherit' });\nif (result.status !== 0) process.exit(result.status ?? 96);\nif (args.includes('--single-transaction')) {\n  fs.writeFileSync(${JSON.stringify(barrier)}, JSON.stringify({ pid: process.pid }), { mode: 0o600, flag: 'wx' });\n  const poll = setInterval(() => {\n    if (fs.existsSync(${JSON.stringify(release)})) { clearInterval(poll); process.exit(0); }\n  }, 10);\n  setTimeout(() => process.exit(95), 20000);\n} else process.exit(0);\n`,
        { mode: 0o700, flag: 'wx' },
      );
      const configPath = join(
        temporaryRoot,
        'public-verification-restore.json',
      );
      await writeFile(
        configPath,
        JSON.stringify({
          ...original,
          database: { url: target.targetUrl, container },
          measurement: {
            referenceInstant: await readRetainedReference({
              completionEvidencePath,
            }),
            maximumRecencyMilliseconds: 300_000,
            maximumRecoveryMilliseconds: 30_000,
          },
        }),
        { mode: 0o600, flag: 'wx' },
      );
      const filesBefore = (await readdir(temporaryRoot)).sort();
      const child = spawn(
        process.execPath,
        [entry, 'restore', '--config', configPath],
        {
          env: {
            ...ordinaryEnvironment(target.targetUrl),
            PATH: `${tools}:${process.env.PATH ?? ''}`,
          },
          stdio: ['ignore', 'pipe', 'pipe'],
        },
      );
      let stdout = '';
      let stderr = '';
      let outcome:
        { code: number | null; signal: NodeJS.Signals | null } | undefined;
      let spawnFailure: Error | undefined;
      child.stdout.on('data', (bytes: Buffer) => {
        stdout += bytes.toString('utf8');
      });
      child.stderr.on('data', (bytes: Buffer) => {
        stderr += bytes.toString('utf8');
      });
      child.once('error', (error) => {
        spawnFailure = error;
      });
      child.once('exit', (code, signal) => {
        outcome = { code, signal };
      });
      const closed = new Promise<void>((done) =>
        child.once('close', () => done()),
      );
      let toolPid: number | undefined;
      let locker: Client | undefined;
      try {
        await vi.waitFor(
          async () => {
            if (spawnFailure) throw spawnFailure;
            const value: unknown = JSON.parse(await readFile(barrier, 'utf8'));
            if (
              typeof value !== 'object' ||
              value === null ||
              !('pid' in value) ||
              typeof value.pid !== 'number' ||
              !Number.isInteger(value.pid) ||
              value.pid <= 0
            )
              throw new Error('Expected committed restore tool barrier.');
            toolPid = value.pid;
          },
          { timeout: 10_000, interval: 10 },
        );
        locker = new Client({ connectionString: target.targetUrl });
        await locker.connect();
        await locker.query('BEGIN');
        // Principal verification reads internal_users, not companies. Only the
        // restored ordinary App's subsequent public verification is blocked.
        await locker.query('LOCK public.companies IN ACCESS EXCLUSIVE MODE');
        const locked = await locker.query<{ pid: number }>(
          'SELECT pg_backend_pid() AS pid',
        );
        const lockerPid = locked.rows[0]?.pid;
        if (lockerPid === undefined)
          throw new Error('Expected external lock owner.');
        await writeFile(release, '', { mode: 0o600, flag: 'wx' });
        const held = locker;
        await vi.waitFor(
          async () => {
            if (spawnFailure) throw spawnFailure;
            await held.query('SELECT pg_stat_clear_snapshot()');
            const blocked = await held.query<{ pid: number }>(
              `SELECT a.pid FROM pg_stat_activity a JOIN pg_locks l ON l.pid=a.pid
               WHERE a.datname=current_database() AND l.relation='public.companies'::regclass
               AND l.mode='AccessShareLock' AND NOT l.granted`,
            );
            expect(blocked.rows).toHaveLength(1);
          },
          { timeout: 10_000, interval: 10 },
        );
        child.kill('SIGTERM');
        await vi.waitFor(
          () => {
            if (spawnFailure) throw spawnFailure;
            expect(outcome).toEqual({ code: 2, signal: null });
          },
          { timeout: 8_000, interval: 10 },
        );
        await closed;
        expect(stdout).toContain('"outcome":"cancelled"');
        expect(stdout).not.toContain('"outcome":"recovered"');
        expect(stdout).not.toContain(target.targetUrl);
        expect(stderr).toBe('');
        await vi.waitFor(
          async () => {
            await held.query('SELECT pg_stat_clear_snapshot()');
            expect(
              (
                await held.query(
                  'SELECT pid FROM pg_stat_activity WHERE datname=current_database() AND pid<>pg_backend_pid()',
                )
              ).rows,
            ).toEqual([]);
          },
          { timeout: 2_000, interval: 10 },
        );
        expect(
          (
            await held.query(
              `SELECT pid FROM pg_locks WHERE pid=$1 AND relation='public.companies'::regclass
               AND mode='AccessExclusiveLock' AND granted`,
              [lockerPid],
            )
          ).rows,
        ).toEqual([{ pid: lockerPid }]);
        expect(
          (
            await source.targetPool.query(
              'SELECT count(*)::integer AS count FROM client_accounts',
            )
          ).rows,
        ).toEqual(sourceBefore.rows);
        expect((await readdir(temporaryRoot)).sort()).toEqual(filesBefore);
        expect((await readdir(tools)).sort()).toEqual([
          'continue',
          'docker',
          'restore-complete.json',
        ]);
        expect(await readFile(archivePath)).toEqual(retainedArchive);
        expect(await readFile(completionEvidencePath)).toEqual(
          retainedCompletion,
        );
        if (!toolPid) throw new Error('Expected committed restore tool.');
        const ownedTool = toolPid;
        expect(() => process.kill(ownedTool, 0)).toThrow();
      } finally {
        child.kill('SIGKILL');
        if (toolPid) {
          try {
            process.kill(toolPid, 'SIGKILL');
          } catch {
            /* Already cleaned. */
          }
        }
        await closed;
        if (locker) {
          try {
            await locker.query('ROLLBACK');
          } finally {
            await locker.end();
          }
        }
      }
    } finally {
      await target.close();
    }
  }, 30_000);

  it('refuses a populated source reached through another URL without altering it', async () => {
    if (!container) throw new Error('Expected supplied tool container.');
    const original: unknown = JSON.parse(await readFile(backupConfig, 'utf8'));
    if (
      typeof original !== 'object' ||
      original === null ||
      Array.isArray(original)
    )
      throw new Error('Expected retained configuration.');
    const configPath = join(temporaryRoot, 'source-alias-restore.json');
    const sourceAlias = source.targetUrl.replace(/^postgresql:/u, 'postgres:');
    expect(sourceAlias).not.toBe(source.targetUrl);
    const before = await source.targetPool.query<{ count: number }>(
      'SELECT count(*)::integer AS count FROM client_accounts',
    );
    await writeFile(
      configPath,
      JSON.stringify({
        ...original,
        database: { url: sourceAlias, container },
        measurement: {
          referenceInstant: await readRetainedReference({
            completionEvidencePath: completionEvidencePath,
          }),
          maximumRecencyMilliseconds: 300_000,
          maximumRecoveryMilliseconds: 30_000,
        },
      }),
      { mode: 0o600, flag: 'wx' },
    );
    const result = await invokeOperator({
      entry,
      operation: 'restore',
      configPath,
      environment: ordinaryEnvironment(sourceAlias),
    });
    expect(result).toMatchObject({ exitCode: 2, stderr: '' });
    expect(result.stdout).toContain('nonempty-or-incompatible-destination');
    expect(
      await source.targetPool.query<{ count: number }>(
        'SELECT count(*)::integer AS count FROM client_accounts',
      ),
    ).toMatchObject({ rows: before.rows });
  }, 30_000);

  it('restores separately with the source unavailable and reopens exact public evidence', async () => {
    if (!databaseUrl || !container)
      throw new Error(
        'A supplied PostgreSQL17 target and existing tool container are required.',
      );
    destination = await createIsolatedPostgresTestDatabase({
      baseDatabaseUrl: databaseUrl,
      namePrefix: 'recovery736_destination',
    });
    // This is fixture-owned source removal AFTER independent retention, not a
    // restore operation. The new invocation gets no source URL or seed manifest.
    await source.close();
    const config: unknown = JSON.parse(await readFile(backupConfig, 'utf8'));
    if (typeof config !== 'object' || config === null || Array.isArray(config))
      throw new Error('Expected the independently prepared configuration.');
    const restoreConfig = join(temporaryRoot, 'restore-config.json');
    await writeFile(
      restoreConfig,
      JSON.stringify({
        ...config,
        database: { url: destination.targetUrl, container },
        measurement: {
          referenceInstant: await readRetainedReference({
            completionEvidencePath: completionEvidencePath,
          }),
          maximumRecencyMilliseconds: 300_000,
          maximumRecoveryMilliseconds: 30_000,
        },
      }),
      { mode: 0o600, flag: 'wx' },
    );
    // The ordinary application admission configuration is intentionally absent:
    // only exact already-persisted synthetic identities/memberships may resolve.
    const environment: Record<string, string | undefined> = {
      ...process.env,
      NODE_ENV: 'test',
      DATABASE_URL: destination.targetUrl,
    };
    for (const key of Object.keys(environment)) {
      if (
        key.startsWith('ACCESS_BOOTSTRAP_') ||
        key === 'ACCESS_ACCEPTED_INVITATIONS_JSON' ||
        key === 'ACCESS_IDENTITY_MODE'
      )
        delete environment[key];
    }
    let exitCode = 0;
    let stdout: string;
    let stderr: string;
    try {
      const result = await execute(
        process.execPath,
        [entry, 'restore', '--config', restoreConfig],
        {
          env: environment,
          timeout: 30_000,
        },
      );
      stdout = result.stdout;
      stderr = result.stderr;
    } catch (error: unknown) {
      if (
        typeof error !== 'object' ||
        error === null ||
        !('code' in error) ||
        !('stdout' in error) ||
        !('stderr' in error)
      )
        throw error;
      if (
        typeof error.code !== 'number' ||
        typeof error.stdout !== 'string' ||
        typeof error.stderr !== 'string'
      )
        throw error;
      exitCode = error.code;
      stdout = error.stdout;
      stderr = error.stderr;
    }
    expect({ exitCode, stdout, stderr }, stdout).toMatchObject({
      exitCode: 0,
      stderr: '',
    });
    expect(stdout).toContain('"outcome":"recovered"');
    expect(stdout).toContain('exact-companies');
    expect(stdout).not.toContain('PRISMA-PRIM');
    if (
      !('applicationRevision' in config) ||
      typeof config.applicationRevision !== 'string' ||
      !('verificationEvidencePath' in config) ||
      typeof config.verificationEvidencePath !== 'string'
    )
      throw new Error(
        'Expected independent reviewed-revision and expectation references.',
      );
    const observed: unknown = JSON.parse(stdout);
    expect(observed).toMatchObject({
      outcome: 'recovered',
      applicationRevision: config.applicationRevision,
      archiveSha256: createHash('sha256')
        .update(await readFile(archivePath))
        .digest('hex'),
      verificationFingerprint: createHash('sha256')
        .update(await readFile(config.verificationEvidencePath))
        .digest('hex'),
      postgresServerVersion: sourceServerVersion,
      postgresToolVersion: sourceToolVersion,
      checks: expect.arrayContaining(
        publicEvidence.evidence.reads.map((read) => ({
          key: read.key,
          status: read.expectedStatus,
          sha256: read.sha256,
        })),
      ),
    });
  }, 30_000);

  it('accepts exact caller bounds and rejects elapsed time beyond them with a controlled real clock boundary', async () => {
    if (!databaseUrl || !container) throw new Error('Expected supplied tools.');
    const original: unknown = JSON.parse(await readFile(backupConfig, 'utf8'));
    if (
      typeof original !== 'object' ||
      original === null ||
      Array.isArray(original) ||
      !('completionEvidencePath' in original) ||
      typeof original.completionEvidencePath !== 'string'
    )
      throw new Error('Expected retained configuration.');
    const completion: unknown = JSON.parse(
      await readFile(original.completionEvidencePath, 'utf8'),
    );
    if (
      typeof completion !== 'object' ||
      completion === null ||
      !('snapshotCutoff' in completion) ||
      typeof completion.snapshotCutoff !== 'string' ||
      !('completedAt' in completion) ||
      typeof completion.completedAt !== 'string'
    )
      throw new Error('Expected independent archive completion evidence.');
    const exactRecency =
      Date.parse(completion.completedAt) -
      Date.parse(completion.snapshotCutoff);
    expect(Number.isFinite(exactRecency)).toBe(true);
    expect(exactRecency).toBeGreaterThanOrEqual(0);
    const realDocker = (await execute('which', ['docker'])).stdout.trim();
    for (const elapsed of [25, 26]) {
      const target = await createIsolatedPostgresTestDatabase({
        baseDatabaseUrl: databaseUrl,
        namePrefix: 'recovery736_clock',
      });
      try {
        const tools = join(temporaryRoot, `clock-tools-${elapsed}`);
        await mkdir(tools, { mode: 0o700 });
        const clockPath = join(tools, 'clock');
        const preload = join(tools, 'clock.cjs');
        await writeFile(clockPath, '0', { mode: 0o600, flag: 'wx' });
        await writeFile(
          preload,
          `const fs = require('node:fs');\nObject.defineProperty(performance, 'now', { value: () => Number(fs.readFileSync(${JSON.stringify(clockPath)}, 'utf8')) });\n`,
          { mode: 0o600, flag: 'wx' },
        );
        // Move the external monotonic clock only at the actual restore boundary.
        // The ordinary command has no test clock or duration-bypass setting.
        await writeFile(
          join(tools, 'docker'),
          `#!${process.execPath}\nconst fs = require('node:fs');\nconst cp = require('node:child_process');\nconst args = process.argv.slice(2);\nif (args.includes('--single-transaction')) fs.writeFileSync(${JSON.stringify(clockPath)}, ${JSON.stringify(String(elapsed))});\nconst result = cp.spawnSync(${JSON.stringify(realDocker)}, args, { stdio: 'inherit' });\nprocess.exit(result.status ?? 96);\n`,
          { mode: 0o700, flag: 'wx' },
        );
        const configPath = join(tools, 'restore.json');
        await writeFile(
          configPath,
          JSON.stringify({
            ...original,
            database: { url: target.targetUrl, container },
            measurement: {
              referenceInstant: completion.completedAt,
              maximumRecencyMilliseconds: exactRecency,
              maximumRecoveryMilliseconds: 25,
            },
          }),
          { mode: 0o600, flag: 'wx' },
        );
        const result = await invokeOperator({
          entry,
          operation: 'restore',
          configPath,
          environment: {
            ...ordinaryEnvironment(target.targetUrl),
            PATH: `${tools}:${process.env.PATH ?? ''}`,
          },
          nodeArguments: ['--require', preload],
        });
        expect(result.stderr).toBe('');
        if (elapsed === 25) {
          expect(result.exitCode, result.stdout).toBe(0);
          expect(result.stdout).toContain('"outcome":"recovered"');
          expect(result.stdout).toContain('"recoveryMilliseconds":25');
          expect(result.stdout).toContain(
            `"recencyMilliseconds":${exactRecency}`,
          );
        } else {
          expect(result.exitCode, result.stdout).toBe(2);
          expect(result.stdout).toContain('recovery-duration-bound-exceeded');
          expect(result.stdout).not.toContain('"outcome":"recovered"');
        }
      } finally {
        await target.close();
      }
    }
  }, 60_000);
});

/** Explicit caller reference retained independently of the source and suite age. */
async function readRetainedReference(input: {
  readonly completionEvidencePath: string;
}): Promise<string> {
  const completion: unknown = JSON.parse(
    await readFile(input.completionEvidencePath, 'utf8'),
  );
  if (
    typeof completion !== 'object' ||
    completion === null ||
    Array.isArray(completion) ||
    !('snapshotCutoff' in completion) ||
    typeof completion.snapshotCutoff !== 'string' ||
    !('completedAt' in completion) ||
    typeof completion.completedAt !== 'string'
  )
    throw new Error('Expected independently retained archive instants.');
  const cutoff = Date.parse(completion.snapshotCutoff);
  const completed = Date.parse(completion.completedAt);
  if (
    !Number.isFinite(cutoff) ||
    !Number.isFinite(completed) ||
    cutoff > completed
  )
    throw new Error('Expected finite ordered archive instants.');
  return completion.completedAt;
}

function ordinaryEnvironment(
  database: string,
): Record<string, string | undefined> {
  const environment: Record<string, string | undefined> = {
    ...process.env,
    NODE_ENV: 'test',
    DATABASE_URL: database,
  };
  for (const key of Object.keys(environment)) {
    if (
      key.startsWith('ACCESS_BOOTSTRAP_') ||
      key === 'ACCESS_ACCEPTED_INVITATIONS_JSON' ||
      key === 'ACCESS_IDENTITY_MODE'
    )
      delete environment[key];
  }
  return environment;
}

async function invokeOperator(input: {
  readonly entry: string;
  readonly operation: 'backup' | 'restore';
  readonly configPath: string;
  readonly environment: Record<string, string | undefined>;
  readonly nodeArguments?: readonly string[];
}): Promise<{
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
}> {
  try {
    const result = await execute(
      process.execPath,
      [
        ...(input.nodeArguments ?? []),
        input.entry,
        input.operation,
        '--config',
        input.configPath,
      ],
      {
        env: input.environment,
        timeout: 30_000,
        maxBuffer: 1024 * 1024,
      },
    );
    return { exitCode: 0, stdout: result.stdout, stderr: result.stderr };
  } catch (error: unknown) {
    if (
      typeof error !== 'object' ||
      error === null ||
      !('code' in error) ||
      typeof error.code !== 'number' ||
      !('stdout' in error) ||
      typeof error.stdout !== 'string' ||
      !('stderr' in error) ||
      typeof error.stderr !== 'string'
    )
      throw error;
    return { exitCode: error.code, stdout: error.stdout, stderr: error.stderr };
  }
}

/** Compare retained bytes without printing keys if a preservation assertion fails. */
async function fingerprintRetainedFiles(
  paths: readonly string[],
): Promise<string[]> {
  return Promise.all(
    paths.map(async (path) =>
      createHash('sha256')
        .update(await readFile(path))
        .digest('hex'),
    ),
  );
}
