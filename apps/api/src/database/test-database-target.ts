const localHosts = new Set(['127.0.0.1', 'localhost', '[::1]']);
const postgresProtocols = new Set(['postgres:', 'postgresql:']);

export function assertLocalTestDatabaseUrl(connectionString: string): void {
  let target: URL;
  try {
    target = new URL(connectionString);
  } catch {
    throw unsafeTargetError();
  }
  const databaseName = decodeURIComponent(target.pathname.slice(1));
  if (
    !postgresProtocols.has(target.protocol) ||
    target.search ||
    target.hash ||
    !localHosts.has(target.hostname) ||
    !databaseName ||
    databaseName.includes('/') ||
    !databaseName.endsWith('_test')
  ) {
    throw unsafeTargetError();
  }
}

function unsafeTargetError(): Error {
  return new Error(
    'TEST_DATABASE_URL must identify a local database whose name ends with "_test", without connection-target overrides.',
  );
}
