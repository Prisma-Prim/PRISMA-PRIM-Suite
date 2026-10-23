import { describe, expect, it } from 'vitest';
import { resolveRecoveryTestContainer } from '../../test-support/recovery-test-container.js';

const runId = '01234567-89ab-4cde-8fab-0123456789ab';
const databaseUrl =
  'postgresql://synthetic:synthetic@127.0.0.1:49123/recovery_test';
const managed = (id: string, port: number) =>
  JSON.stringify({
    id,
    ports: `127.0.0.1:${port}->5432/tcp`,
    name: `prisma-prim-postgres-${runId}`,
    runId,
  });

describe('recovery test container selection', () => {
  it('keeps the explicit caller tool without reading a Docker catalogue', async () => {
    await expect(
      resolveRecoveryTestContainer({
        databaseUrl,
        explicitContainer: 'recovery736-postgres',
        continuousIntegration: true,
        runDocker: async () => {
          throw new Error('Unrelated Docker discovery must not occur.');
        },
      }),
    ).resolves.toBe('recovery736-postgres');
  });

  it('selects only the unique exact loopback PostgreSQL port from managed metadata', async () => {
    const invocations: Array<readonly string[]> = [];
    const result = await resolveRecoveryTestContainer({
      databaseUrl,
      explicitContainer: undefined,
      continuousIntegration: true,
      runDocker: async (args) => {
        invocations.push(args);
        return [
          managed('bbbbbbbbbbbb', 49124),
          managed('aaaaaaaaaaaa', 49123),
        ].join('\n');
      },
    });
    expect(result).toBe('aaaaaaaaaaaa');
    expect(invocations).toHaveLength(1);
    expect(invocations[0]).toContain(
      'label=com.prisma-prim.managed-postgres=true',
    );
    expect(invocations[0]).toContain(
      'label=com.prisma-prim.managed-postgres.run',
    );
    expect(invocations[0]).toContain('ps');
    expect(invocations[0]).not.toContain('inspect');
    expect(invocations[0]?.join(' ')).not.toContain('Config');
  });

  it('refuses ambiguity even when the CI fallback would otherwise apply', async () => {
    await expect(
      resolveRecoveryTestContainer({
        databaseUrl: databaseUrl.replace(':49123/', ':5432/'),
        explicitContainer: undefined,
        continuousIntegration: true,
        runDocker: async () =>
          [managed('aaaaaaaaaaaa', 5432), managed('bbbbbbbbbbbb', 5432)].join(
            '\n',
          ),
      }),
    ).rejects.toThrow('Ambiguous managed PostgreSQL test target.');
  });

  it('retains the declared Actions container only when no managed target matches port5432', async () => {
    await expect(
      resolveRecoveryTestContainer({
        databaseUrl: databaseUrl.replace(':49123/', ':5432/'),
        explicitContainer: undefined,
        continuousIntegration: true,
        runDocker: async () => '',
      }),
    ).resolves.toBe('ci-postgres');
  });

  it('does not substitute an Actions tool for an unmatched disposable target', async () => {
    await expect(
      resolveRecoveryTestContainer({
        databaseUrl,
        explicitContainer: undefined,
        continuousIntegration: true,
        runDocker: async () => managed('bbbbbbbbbbbb', 49124),
      }),
    ).rejects.toThrow(
      'No managed PostgreSQL container matches the test target.',
    );
  });

  it('rejects wildcard or non-PostgreSQL bindings instead of widening target admission', async () => {
    await expect(
      resolveRecoveryTestContainer({
        databaseUrl,
        explicitContainer: undefined,
        continuousIntegration: false,
        runDocker: async () =>
          managed('aaaaaaaaaaaa', 49123).replace(
            '127.0.0.1:49123->5432/tcp',
            '0.0.0.0:49123->5432/tcp, 127.0.0.1:49123->5433/tcp',
          ),
      }),
    ).rejects.toThrow(
      'No managed PostgreSQL container matches the test target.',
    );
  });

  it('refuses an invalid explicit container before Docker discovery', async () => {
    let read = false;
    await expect(
      resolveRecoveryTestContainer({
        databaseUrl,
        explicitContainer: 'invalid container',
        continuousIntegration: false,
        runDocker: async () => {
          read = true;
          return '';
        },
      }),
    ).rejects.toThrow('Invalid explicit recovery test container.');
    expect(read).toBe(false);
  });

  it.each([
    'postgresql://synthetic:synthetic@elsewhere:49123/recovery_test',
    'postgresql://synthetic:synthetic@127.0.0.1/recovery_test',
    'https://127.0.0.1:49123/recovery_test',
  ])(
    'refuses an unsupported target before reading Docker metadata',
    async (url) => {
      let read = false;
      await expect(
        resolveRecoveryTestContainer({
          databaseUrl: url,
          explicitContainer: undefined,
          continuousIntegration: true,
          runDocker: async () => {
            read = true;
            return '';
          },
        }),
      ).rejects.toThrow('A local PostgreSQL test target is required.');
      expect(read).toBe(false);
    },
  );

  it.each([
    '{malformed',
    JSON.stringify({ id: 'aaaaaaaaaaaa', ports: '127.0.0.1:49123->5432/tcp' }),
    managed('aaaaaaaaaaaa', 5432).replace(runId, 'unknown'),
  ])(
    'refuses invalid metadata without falling back or exposing it',
    async (output) => {
      await expect(
        resolveRecoveryTestContainer({
          databaseUrl: databaseUrl.replace(':49123/', ':5432/'),
          explicitContainer: undefined,
          continuousIntegration: true,
          runDocker: async () => output,
        }),
      ).rejects.toThrow('Invalid managed PostgreSQL test metadata.');
    },
  );

  it('refuses oversized Docker output before decoding', async () => {
    await expect(
      resolveRecoveryTestContainer({
        databaseUrl,
        explicitContainer: undefined,
        continuousIntegration: true,
        runDocker: async () => 'x'.repeat(65_537),
      }),
    ).rejects.toThrow('Managed PostgreSQL test metadata exceeds its limit.');
  });

  it('sanitizes a failed Docker metadata boundary', async () => {
    await expect(
      resolveRecoveryTestContainer({
        databaseUrl,
        explicitContainer: undefined,
        continuousIntegration: true,
        runDocker: async () => {
          throw new Error('Never echo caller credentials or tool diagnostics.');
        },
      }),
    ).rejects.toThrow('Managed PostgreSQL test metadata is unavailable.');
  });
});
