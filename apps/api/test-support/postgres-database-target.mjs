import { isIP } from 'node:net';
import { URL } from 'node:url';

const postgresProtocols = new Set(['postgres:', 'postgresql:']);

export function parsePostgresDatabaseTarget(value) {
  try {
    const target = new URL(String(value));
    if (
      !postgresProtocols.has(target.protocol) ||
      target.search ||
      target.hash
    ) {
      return null;
    }

    const database = target.pathname.slice(1);
    if (!database || database.includes('/') || database.includes('%')) {
      return null;
    }

    return {
      database,
      hostname: target.hostname,
      port: target.port || '5432',
    };
  } catch {
    return null;
  }
}

export function assertLocalTestDatabaseUrl(connectionString) {
  const target = parsePostgresDatabaseTarget(connectionString);
  if (
    !target ||
    !isNumericLoopbackTarget(target) ||
    !target.database.endsWith('_test')
  ) {
    throw unsafeTargetError();
  }
}

export function databaseTargetsAreSafe(databaseUrl, testDatabaseUrl) {
  const developmentDatabase = parsePostgresDatabaseTarget(databaseUrl);
  const testDatabase = parsePostgresDatabaseTarget(testDatabaseUrl);

  return Boolean(
    developmentDatabase &&
    testDatabase &&
    isNumericLoopbackTarget(developmentDatabase) &&
    isNumericLoopbackTarget(testDatabase) &&
    developmentDatabase.database !== testDatabase.database &&
    testDatabase.database.endsWith('_test'),
  );
}

function isNumericLoopbackTarget(target) {
  const hostname = target.hostname.replace(/^\[|\]$/gu, '');
  return (
    (isIP(hostname) === 4 && hostname.startsWith('127.')) || hostname === '::1'
  );
}

function unsafeTargetError() {
  return new Error(
    'TEST_DATABASE_URL must identify a numeric-loopback database whose name ends with "_test", without connection-target overrides.',
  );
}
