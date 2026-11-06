import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const check = fileURLToPath(
  new URL('./check-drizzle-drift.mjs', import.meta.url),
);
const apiDirectory = fileURLToPath(new URL('../apps/api/', import.meta.url));
const drizzleKit = join(apiDirectory, 'node_modules/drizzle-kit/bin.cjs');

const widgetsSchema = (
  extraColumns = '',
) => `import { pgTable, text, uuid } from 'drizzle-orm/pg-core';

export const widgets = pgTable('widgets', {
  id: uuid('id').primaryKey(),
  name: text('name').notNull(),${extraColumns}
});
`;

function runCheck(directory) {
  return spawnSync(process.execPath, [check, '--api-directory', directory], {
    encoding: 'utf8',
    timeout: 240_000,
  });
}

// Generates a migration the way the author would: with drizzle-kit, in place.
function generateMigration(directory) {
  const child = spawnSync(
    process.execPath,
    [drizzleKit, 'generate', '--config', 'drizzle.config.json'],
    { cwd: directory, encoding: 'utf8', timeout: 240_000 },
  );
  assert.equal(child.status, 0, child.stdout + child.stderr);
}

// A minimal API project with the same layout as apps/api: a schema entry file
// and a drizzle folder. It borrows apps/api/node_modules for drizzle-orm.
async function createProject() {
  const directory = await mkdtemp(join(tmpdir(), 'drizzle-drift-test-'));
  const schemaDirectory = join(directory, 'src/database/schema');
  await mkdir(schemaDirectory, { recursive: true });
  await writeFile(join(schemaDirectory, 'index.ts'), widgetsSchema());
  await writeFile(
    join(directory, 'drizzle.config.json'),
    JSON.stringify({
      dialect: 'postgresql',
      schema: './src/database/schema/index.ts',
      out: './drizzle',
    }),
  );
  await symlink(
    join(apiDirectory, 'node_modules'),
    join(directory, 'node_modules'),
    'junction',
  );
  generateMigration(directory);
  return directory;
}

async function readTree(directory) {
  const tree = {};
  const entries = await readdir(directory, {
    recursive: true,
    withFileTypes: true,
  });
  for (const entry of entries.filter((file) => file.isFile())) {
    const path = join(entry.parentPath, entry.name);
    tree[relative(directory, path)] = await readFile(path, 'utf8');
  }
  return tree;
}

test('the check targets the schema entry and migrations folder declared by the drizzle configuration', async () => {
  const config = await readFile(
    join(apiDirectory, 'drizzle.config.ts'),
    'utf8',
  );
  assert.match(config, /dialect: 'postgresql'/u);
  assert.match(config, /schema: '\.\/src\/database\/schema\/index\.ts'/u);
  assert.match(config, /out: '\.\/drizzle'/u);
});

test('the package script runs the check from the repository root', async () => {
  const manifest = JSON.parse(
    await readFile(new URL('../package.json', import.meta.url), 'utf8'),
  );
  assert.equal(
    manifest.scripts['db:check-drift'],
    'node scripts/check-drizzle-drift.mjs',
  );
});

test('a schema change needs its generated migration, and the check never writes to the project', async (t) => {
  const project = await createProject();
  t.after(() => rm(project, { recursive: true, force: true }));
  const committed = await readTree(join(project, 'drizzle'));
  assert.ok(Object.keys(committed).some((file) => file.endsWith('.sql')));

  await t.test('passes while the migrations match the schema', async () => {
    const child = runCheck(project);
    assert.equal(child.status, 0, child.stdout + child.stderr);
    assert.match(child.stdout, /match the schema/u);
    assert.deepEqual(await readTree(join(project, 'drizzle')), committed);
  });

  await t.test(
    'fails with the missing migration when the schema changes',
    async () => {
      await writeFile(
        join(project, 'src/database/schema/index.ts'),
        widgetsSchema("\n  colour: text('colour'),"),
      );
      const child = runCheck(project);
      assert.equal(child.status, 1, child.stdout + child.stderr);
      const report = child.stdout + child.stderr;
      assert.match(report, /diverge/u);
      assert.match(report, /meta\/_journal\.json/u);
      assert.match(report, /ADD COLUMN "colour" text/u);
      assert.match(report, /pnpm db:generate/u);
      assert.deepEqual(await readTree(join(project, 'drizzle')), committed);
    },
  );

  await t.test('passes again once the migration is generated', () => {
    generateMigration(project);
    const child = runCheck(project);
    assert.equal(child.status, 0, child.stdout + child.stderr);
  });
});

test('a schema that drizzle-kit cannot load fails instead of passing', async (t) => {
  const project = await createProject();
  t.after(() => rm(project, { recursive: true, force: true }));
  await writeFile(
    join(project, 'src/database/schema/index.ts'),
    'export const broken = ;\n',
  );
  const child = runCheck(project);
  assert.equal(child.status, 1, child.stdout + child.stderr);
  assert.doesNotMatch(child.stdout, /match the schema/u);
  assert.match(child.stderr, /could not compare/u);
});

test('a change that needs an interactive answer fails instead of passing', async (t) => {
  // drizzle-kit asks whether a replaced column was renamed. It reports the
  // missing terminal on stderr but still exits 0, so the exit status is no proof.
  const project = await createProject();
  t.after(() => rm(project, { recursive: true, force: true }));
  await writeFile(
    join(project, 'src/database/schema/index.ts'),
    widgetsSchema().replace("text('name')", "text('label')"),
  );
  const child = runCheck(project);
  assert.equal(child.status, 1, child.stdout + child.stderr);
  assert.doesNotMatch(child.stdout, /match the schema/u);
  assert.match(child.stderr, /could not compare/u);
  assert.match(child.stderr, /pnpm db:generate/u);
});

test('a project without a schema entry or migrations folder fails', async (t) => {
  const empty = await mkdtemp(join(tmpdir(), 'drizzle-drift-empty-'));
  t.after(() => rm(empty, { recursive: true, force: true }));
  const child = runCheck(empty);
  assert.equal(child.status, 1, child.stdout + child.stderr);
  assert.match(child.stderr, /schema entry/u);
});
