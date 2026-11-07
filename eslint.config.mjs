import eslint from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';

// Tables only the Access module may read or write. The identity tables
// `workspaceMemberships` and `internalUsers` stay importable: event readers
// join them to resolve actor display names, which confers no authority.
const accessOwnedTables = [
  'companyContextAssignmentCommands',
  'companyRoleAssignments',
  'workspaceInvitationAcceptances',
  'workspaceInvitationCommands',
  'workspaceInvitationProofs',
  'workspaceInvitations',
  'workspaceMembershipSuspensionCommands',
  'workspacePermissionGrants',
];

export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/coverage/**',
      '**/node_modules/**',
      'apps/api/drizzle/**',
    ],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    // Mechanical part of docs/agents/typescript-discipline.md: no `!` or `as`
    // to manufacture evidence. Violations that predate these rules are recorded
    // in eslint-suppressions.json, so only new violations fail. `pnpm lint`
    // also fails when a recorded violation no longer occurs; run
    // `pnpm lint --prune-suppressions` and commit the smaller baseline.
    // Never run `--suppress-all`/`--suppress-rule` to silence a new violation.
    files: ['**/*.{ts,tsx,mts,cts}'],
    rules: {
      '@typescript-eslint/no-non-null-assertion': 'error',
      '@typescript-eslint/consistent-type-assertions': [
        'error',
        { assertionStyle: 'never' },
      ],
    },
  },
  {
    // AGENTS.md Code Review Rules, Authorization: a direct Access-table query
    // drifts from the Access module. A justified exception sits on the
    // offending import line with an `-- reason`. Extend this block rather
    // than configuring the rule again: a later block replaces its options.
    files: ['apps/api/**/*.ts'],
    // The tenancy schema test inspects every Drizzle table, Access tables
    // included, without querying them (#1103).
    ignores: [
      'apps/api/src/access/**',
      'apps/api/src/database/schema/**',
      'apps/api/src/database/tenancy-schema.test.ts',
    ],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              regex: '(^|/)schema(/|$)',
              importNames: accessOwnedTables,
              message:
                'Access owns this table. Use the ActorContext grants, rechecked inside the transaction by a CompanyContextAuthorization require/has method, or readMemberAuthority() for another member (apps/api/src/access/); add an Access function there when none fits.',
            },
          ],
        },
      ],
    },
  },
  {
    // AGENTS.md Code Review Rules, Activity Log: updating or deleting an
    // event rewrites evidence. Every event table is named `*Events`
    // (scripts/eslint-module-boundaries.test.mjs checks the schema). Extend
    // this block rather than configuring the rule again.
    files: ['apps/api/**/*.ts'],
    ignores: [
      '**/*.{test,spec}.ts',
      '**/*.test-{support,fixture}.ts',
      'apps/api/test-support/**',
    ],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector:
            'CallExpression[callee.property.name=/^(update|delete)$/] > Identifier.arguments[name=/Events$/]',
          message:
            'Activity Log events are append-only: never update or delete one; append a correcting event in the same transaction instead.',
        },
      ],
    },
  },
  {
    // Hand-rolled cancellation races scope changes (#1081, #1119). Existing
    // controllers are recorded in eslint-suppressions.json, like the `!` and
    // `as` baseline above: move a caller to the primitive when a feature
    // touches it, then prune. Extend this block rather than configuring the
    // rule again for web files.
    files: ['apps/web/src/**/*.{ts,tsx}'],
    ignores: [
      '**/*.{test,spec}.{ts,tsx}',
      '**/*.test-*.{ts,tsx}',
      'apps/web/src/test/**',
      'apps/web/src/api/use-scoped-operation.ts',
    ],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: 'NewExpression[callee.name="AbortController"]',
          message:
            'Do not hand-roll an AbortController: take the signal from useScopedOperation(scope).begin() (apps/web/src/api/use-scoped-operation.ts), and pass it as `signal` to runLatestAuthenticatedRequest.',
        },
      ],
    },
  },
  {
    files: ['apps/web/**/*.{ts,tsx}'],
    languageOptions: {
      globals: globals.browser,
    },
  },
  {
    files: ['apps/api/**/*.ts', '**/*.config.{js,mjs,ts}', 'scripts/**/*.mjs'],
    languageOptions: {
      globals: globals.node,
    },
  },
  {
    files: ['**/*.{test,spec}.{ts,tsx}'],
    languageOptions: {
      globals: {
        ...globals.node,
        ...globals.browser,
      },
    },
  },
);
