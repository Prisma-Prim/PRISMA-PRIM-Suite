export interface PostgresDatabaseTarget {
  readonly database: string;
  readonly hostname: string;
  readonly port: string;
}

export function parsePostgresDatabaseTarget(
  value: unknown,
): PostgresDatabaseTarget | null;

export function assertLocalTestDatabaseUrl(connectionString: string): void;

export function databaseTargetsAreSafe(
  databaseUrl: unknown,
  testDatabaseUrl: unknown,
): boolean;
