interface RecoveryTestContainerContext {
  readonly databaseUrl: string;
  readonly explicitContainer: string | undefined;
  readonly continuousIntegration: boolean;
  readonly runDocker: (args: readonly string[]) => Promise<string>;
}

function targetPort(databaseUrl: string): string {
  let target: URL;
  try {
    target = new URL(databaseUrl);
  } catch {
    throw new Error('A local PostgreSQL test target is required.');
  }
  if (
    !['postgres:', 'postgresql:'].includes(target.protocol) ||
    target.hostname !== '127.0.0.1' ||
    !/^\d+$/u.test(target.port) ||
    Number(target.port) < 1 ||
    Number(target.port) > 65_535 ||
    target.search ||
    target.hash
  )
    throw new Error('A local PostgreSQL test target is required.');
  return target.port;
}

/** Resolve only the explicitly supplied tool or the managed target's exact port. */
export async function resolveRecoveryTestContainer({
  databaseUrl,
  explicitContainer,
  continuousIntegration,
  runDocker,
}: RecoveryTestContainerContext): Promise<string> {
  const port = targetPort(databaseUrl);
  if (explicitContainer !== undefined) {
    if (!/^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,127}$/u.test(explicitContainer))
      throw new Error('Invalid explicit recovery test container.');
    return explicitContainer;
  }

  let output: string;
  try {
    output = await runDocker([
      '--host=unix:///var/run/docker.sock',
      'ps',
      '--filter',
      'status=running',
      '--filter',
      'label=com.prisma-prim.managed-postgres=true',
      '--filter',
      'label=com.prisma-prim.managed-postgres.run',
      '--format',
      '{"id":{{json .ID}},"ports":{{json .Ports}},"name":{{json .Names}},"runId":{{json (.Label "com.prisma-prim.managed-postgres.run")}}}',
    ]);
  } catch {
    throw new Error('Managed PostgreSQL test metadata is unavailable.');
  }
  if (output.length > 65_536)
    throw new Error('Managed PostgreSQL test metadata exceeds its limit.');
  const matches: string[] = [];
  for (const line of output.trim() ? output.trim().split('\n') : []) {
    let item: unknown;
    try {
      item = JSON.parse(line);
    } catch {
      throw new Error('Invalid managed PostgreSQL test metadata.');
    }
    if (
      typeof item !== 'object' ||
      item === null ||
      Array.isArray(item) ||
      !('id' in item) ||
      typeof item.id !== 'string' ||
      !/^[a-f0-9]{12,64}$/u.test(item.id) ||
      !('ports' in item) ||
      typeof item.ports !== 'string' ||
      !('runId' in item) ||
      typeof item.runId !== 'string' ||
      !/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/u.test(item.runId) ||
      !('name' in item) ||
      item.name !== `prisma-prim-postgres-${item.runId}`
    )
      throw new Error('Invalid managed PostgreSQL test metadata.');
    if (item.ports.split(', ').includes(`127.0.0.1:${port}->5432/tcp`))
      matches.push(item.id);
  }
  if (matches.length === 1) {
    const match = matches[0];
    if (match) return match;
  }
  if (matches.length > 1)
    throw new Error('Ambiguous managed PostgreSQL test target.');
  // The existing Actions container remains supported only at its declared port.
  if (continuousIntegration && port === '5432') return 'ci-postgres';
  throw new Error('No managed PostgreSQL container matches the test target.');
}
