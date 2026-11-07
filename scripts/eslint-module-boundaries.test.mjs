import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rm,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repositoryRoot = fileURLToPath(new URL('../', import.meta.url));
const repositoryConfig = path.join(repositoryRoot, 'eslint.config.mjs');
const eslintBin = path.join(
  repositoryRoot,
  'node_modules',
  'eslint',
  'bin',
  'eslint.js',
);

// Exit code of the ESLint CLI when it reports lint errors.
const lintErrors = 1;

/**
 * Lints fixture files, keyed by their repository-relative path, with the
 * repository configuration inside a throwaway directory. Paths matter: both
 * rules are scoped to directories of `apps/api`.
 */
async function lintFiles(files) {
  const directory = await mkdtemp(path.join(tmpdir(), 'eslint-boundaries-'));
  try {
    await writeFile(
      path.join(directory, 'eslint.config.mjs'),
      `export { default } from ${JSON.stringify(pathToFileURL(repositoryConfig).href)};\n`,
    );
    for (const [file, source] of Object.entries(files)) {
      await mkdir(path.dirname(path.join(directory, file)), {
        recursive: true,
      });
      await writeFile(path.join(directory, file), source);
    }
    const result = spawnSync(process.execPath, [eslintBin, '.'], {
      cwd: directory,
      encoding: 'utf8',
    });
    assert.equal(result.error, undefined);
    return { status: result.status, output: result.stdout + result.stderr };
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

const accessRule = 'no-restricted-imports';
const activityRule = 'no-restricted-syntax';

// Reduced from e1a8a803 (#1004), apps/api/src/knowledge/knowledge.authorization.ts:
// the Knowledge module rechecked a captured grant by querying
// company_role_assignments itself; its query omits the membership, Internal
// User and Company liveness joins that the Access module's recheck applies.
const knowledgeGrantRecheck = [
  "import { and, eq, isNull } from 'drizzle-orm';",
  "import type { NodePgDatabase } from 'drizzle-orm/node-postgres';",
  "import { companyRoleAssignments } from '../database/schema/index.js';",
  '',
  'declare const connection: NodePgDatabase;',
  'export const live = connection',
  '  .select({ id: companyRoleAssignments.id })',
  '  .from(companyRoleAssignments)',
  '  .where(and(eq(companyRoleAssignments.id, 1), isNull(companyRoleAssignments.revokedAt)))',
  "  .for('share');",
  '',
].join('\n');

// Reduced from 21ed4b88 (#296), apps/api/src/client/client-operational-reference.service.ts:
// the Client module read the client.manage Workspace grant directly.
const clientManagerGrantRead = [
  'import {',
  '  clientAccounts,',
  '  companyRoleAssignments,',
  '  workspacePermissionGrants,',
  "} from '../database/schema/index.js';",
  '',
  'export const tables = [clientAccounts, companyRoleAssignments, workspacePermissionGrants];',
  '',
].join('\n');

test('a module outside Access that imports Access grant tables fails lint and names the Access functions', async () => {
  const result = await lintFiles({
    'apps/api/src/knowledge/knowledge.authorization.ts': knowledgeGrantRecheck,
    'apps/api/src/client/client-operational-reference.service.ts':
      clientManagerGrantRead,
  });

  assert.equal(result.status, lintErrors, result.output);
  const reports = result.output.match(
    new RegExp(`error .*companyRoleAssignments.*${accessRule}`, 'g'),
  );
  assert.equal(reports?.length, 2, result.output);
  assert.match(
    result.output,
    new RegExp(`workspacePermissionGrants.*${accessRule}`),
  );
  assert.doesNotMatch(result.output, /'clientAccounts'/);
  assert.match(result.output, /CompanyContextAuthorization/);
  assert.match(result.output, /readMemberAuthority\(\)/);
});

test('namespace imports, re-exports and sibling schema paths cannot bypass the Access boundary', async () => {
  const files = {
    'apps/api/src/documents/namespace.ts': [
      "import * as schema from '../database/schema/index.js';",
      'export const grants = schema.workspacePermissionGrants;',
      '',
    ].join('\n'),
    'apps/api/src/documents/reexport.ts':
      "export { companyRoleAssignments } from '../database/schema/core.js';\n",
    'apps/api/src/database/owned-resource-cleanup.ts':
      "export { workspacePermissionGrants } from './schema/index.js';\n",
  };
  const result = await lintFiles(files);

  assert.equal(result.status, lintErrors, result.output);
  const reports = result.output.match(new RegExp(`error .*${accessRule}`, 'g'));
  assert.equal(reports?.length, Object.keys(files).length, result.output);
  for (const file of Object.keys(files)) {
    assert.ok(result.output.includes(path.normalize(file)), result.output);
  }
});

test('Access, the schema and identity joins for display names may use their tables', async () => {
  const result = await lintFiles({
    'apps/api/src/access/member-authority.ts': knowledgeGrantRecheck,
    'apps/api/src/access/access.rest.test.ts': clientManagerGrantRead,
    'apps/api/src/database/schema/core.ts': [
      "import { companyRoleAssignments } from './grants.js';",
      'export const foreignColumns = [companyRoleAssignments];',
      '',
    ].join('\n'),
    'apps/api/src/documents/document-pdf-storage.ts': [
      "import { readMemberAuthority } from '../access/member-authority.js';",
      'import {',
      '  internalUsers,',
      '  workspaceMemberships,',
      "} from '../database/schema/index.js';",
      '',
      'export const joined = [internalUsers, workspaceMemberships, readMemberAuthority];',
      '',
    ].join('\n'),
  });

  assert.equal(result.status, 0, result.output);
});

// No commit, open or closed pull request head in the repository history ever
// called Drizzle update() or delete() on an event table, so these fixtures are
// deliberate mutations of the append-only write pattern.
const eventRewrites = [
  "import { eq } from 'drizzle-orm';",
  "import { activityLogEvents, offerEvents } from '../database/schema/index.js';",
  "import type { NodePgDatabase } from 'drizzle-orm/node-postgres';",
  '',
  'declare const transaction: NodePgDatabase;',
  'export async function rewrite(id: string) {',
  '  await transaction.update(activityLogEvents).set({ metadata: {} }).where(eq(activityLogEvents.id, id));',
  '  await transaction.delete(offerEvents).where(eq(offerEvents.id, id));',
  '}',
  '',
].join('\n');

test('production code that updates or deletes an Activity Log event fails lint and points to a correcting event', async () => {
  const result = await lintFiles({
    'apps/api/src/offer/offer.service.ts': eventRewrites,
  });

  assert.equal(result.status, lintErrors, result.output);
  const reports = result.output.match(
    new RegExp(`error .*append a correcting event.*${activityRule}`, 'g'),
  );
  assert.equal(reports?.length, 2, result.output);
});

test('appending events, rewriting non-event rows and test setup remain allowed', async () => {
  const result = await lintFiles({
    'apps/api/src/offer/offer.service.ts': [
      "import { eq } from 'drizzle-orm';",
      "import { activityLogEvents, offers } from '../database/schema/index.js';",
      "import type { NodePgDatabase } from 'drizzle-orm/node-postgres';",
      '',
      'declare const transaction: NodePgDatabase;',
      'const pendingEvents = new Map<string, number>();',
      'export async function record(id: string) {',
      '  await transaction.insert(activityLogEvents).values({ id });',
      '  await transaction.update(offers).set({ version: 2 }).where(eq(offers.id, id));',
      '  pendingEvents.delete(id);',
      '}',
      '',
    ].join('\n'),
    'apps/api/src/offer/offer.rest.test.ts': eventRewrites,
    'apps/api/src/offer/offer.test-support.ts': eventRewrites,
  });

  assert.equal(result.status, 0, result.output);
});

test('every event table follows the naming the append-only rule matches', async () => {
  const schemaDirectory = path.join(
    repositoryRoot,
    'apps',
    'api',
    'src',
    'database',
    'schema',
  );
  const eventTables = [];
  for (const file of await readdir(schemaDirectory)) {
    const source = await readFile(path.join(schemaDirectory, file), 'utf8');
    for (const [, identifier, table] of source.matchAll(
      /export const (\w+) = pgTable\(\s*'(\w+)'/g,
    )) {
      if (table.endsWith('_events')) eventTables.push(identifier);
    }
  }

  assert.ok(eventTables.includes('activityLogEvents'), eventTables.join());
  for (const identifier of eventTables) {
    assert.match(identifier, /Events$/, `${identifier} escapes the rule`);
  }
});
