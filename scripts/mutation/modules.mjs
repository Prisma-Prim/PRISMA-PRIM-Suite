// The weekly mutation run (.github/workflows/weekly-mutation.yml) mutates the
// modules below that changed on main in the last 7 days; add only a pure,
// sensitive module (Access or tenancy decision, transition or boundary
// validator) whose unit test runs without PostgreSQL or a browser, with the
// reason.
export const mutationModules = [
  {
    module: 'scripts/destructive-migrations.mjs',
    test: 'scripts/destructive-migrations.test.mjs',
    runner: 'node:test',
    // Its test reads the real migrations.
    reads: ['apps/api/drizzle/**'],
    reason:
      'Migration-safety guard: refuses a destructive migration without its approval marker (measured in #1123).',
  },
  {
    module: 'apps/api/src/access/external-invoice-captured-grants.ts',
    test: 'apps/api/src/access/external-invoice-captured-grants.test.ts',
    runner: 'vitest',
    reason:
      'Access: fail-closed decoding of captured external-invoice grants (measured in #1123).',
  },
  {
    module: 'apps/api/src/access/payment-captured-grants.ts',
    test: 'apps/api/src/access/payment-captured-grants.test.ts',
    runner: 'vitest',
    reason:
      'Access: fail-closed decoding of captured payment grants, the same shape as the measured invoice grants.',
  },
  {
    module: 'apps/api/src/access/opportunity-follow-up-captured-grants.ts',
    test: 'apps/api/src/access/opportunity-follow-up-captured-grants.test.ts',
    runner: 'vitest',
    reason:
      'Access: captured follow-up authority, bound to the native intake assignment and its read capture.',
  },
  {
    module: 'apps/web/src/commercial-intake/opportunity-outcome.ts',
    test: 'apps/web/src/commercial-intake/opportunity-outcome.test.ts',
    runner: 'vitest',
    reason:
      'Outcome transitions and history validation at the response boundary (measured in #1123).',
  },
];
