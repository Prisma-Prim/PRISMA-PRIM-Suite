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

// No new identifier or comment says "legacy" in application code (#1343,
// #1349): before launch nothing is deployed, so data, fixtures and readers
// move to the new shape and a product variant gets its real name. Import paths
// are string literals, so `pdfjs-dist/legacy/build` is not an Identifier.
// Occurrences that predate the rule sit in eslint-suppressions.json (recorded
// with `--suppress-rule no-restricted-syntax --suppress-rule no-warning-comments`
// only for these hits); prune it as owners rename them. The restriction is
// spread into the API and web `no-restricted-syntax` blocks below, because a
// later block replaces an earlier one's options for the same files.
const legacyNameRestriction = {
  selector: 'Identifier[name=/legacy/i]',
  message:
    'Do not name something legacy: nothing is deployed before launch, so move the data, fixtures and readers to the new shape (#1343, docs/agents/typescript-discipline.md); a product variant gets its real name.',
};

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
        legacyNameRestriction,
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
        legacyNameRestriction,
      ],
    },
  },
  {
    // Removing the final Playwright route can strand Chromium reads (#1097,
    // #1098). The helper keeps interception enabled until the page closes.
    files: ['apps/web/e2e/**/*.ts'],
    ignores: ['apps/web/e2e/route-removal.ts'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: 'CallExpression[callee.property.name=/^unroute(All)?$/]',
          message:
            'Use removeRoute(page, pattern, handler?) from ./route-removal to keep in-flight Chromium reads alive.',
        },
      ],
    },
  },
  {
    // The comment half of the legacy-name restriction above; same scope as the
    // identifier half (the API and web blocks above carry their own ignores).
    files: ['apps/api/src/**/*.ts', 'apps/web/src/**/*.{ts,tsx}'],
    ignores: [
      '**/*.{test,spec}.{ts,tsx}',
      '**/*.test-*.{ts,tsx}',
      'apps/api/test-support/**',
      'apps/web/src/test/**',
    ],
    rules: {
      'no-warning-comments': [
        'error',
        {
          terms: ['legacy'],
          location: 'anywhere',
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
