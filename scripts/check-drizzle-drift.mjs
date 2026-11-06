import { spawnSync } from 'node:child_process';
import {
  cp,
  mkdtemp,
  readdir,
  readFile,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { parseArgs } from 'node:util';
import { fileURLToPath } from 'node:url';

// Fails when the Drizzle schema and the committed migrations diverge, that is
// when `drizzle-kit generate` would still write a migration. It runs
// drizzle-kit on a temporary copy of the migrations folder, so it needs no
// database and never modifies the working tree.
//
// These values mirror apps/api/drizzle.config.ts. check-drizzle-drift.test.mjs
// fails if that file stops declaring them.
const dialect = 'postgresql';
const schemaEntry = 'src/database/schema/index.ts';
const migrationsFolder = 'drizzle';

const generateTimeoutMilliseconds = 180_000;
const reportedOutputLines = 40;
const reportedSqlLines = 60;

const defaultApiDirectory = fileURLToPath(
  new URL('../apps/api/', import.meta.url),
);

async function listFiles(directory) {
  const entries = await readdir(directory, {
    recursive: true,
    withFileTypes: true,
  });
  return entries
    .filter((entry) => entry.isFile())
    .map((entry) =>
      relative(directory, join(entry.parentPath, entry.name)).replaceAll(
        '\\',
        '/',
      ),
    )
    .sort();
}

async function requirePath(path, description) {
  try {
    await stat(path);
  } catch {
    throw new Error(
      `Cannot compare: the ${description} is missing at ${path}.`,
    );
  }
}

function incomparable(reason, output) {
  // drizzle-kit reports some failures, such as an unanswerable rename prompt,
  // on stderr while still exiting 0, so success is never inferred from its
  // exit status alone.
  return new Error(
    `drizzle-kit could not compare the schema with the migrations (${reason}). ` +
      'If it needed an interactive answer, such as whether a column was ' +
      'renamed, run `pnpm db:generate` locally and answer it.\n' +
      output.trimEnd().split('\n').slice(-reportedOutputLines).join('\n'),
  );
}

function generate(apiDirectory, workDirectory) {
  const child = spawnSync(
    process.execPath,
    [
      join(apiDirectory, 'node_modules/drizzle-kit/bin.cjs'),
      'generate',
      '--config',
      'drizzle.config.json',
    ],
    {
      cwd: workDirectory,
      encoding: 'utf8',
      // Never wait for an interactive answer, such as a rename prompt.
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: generateTimeoutMilliseconds,
      maxBuffer: 16 * 1024 * 1024,
    },
  );
  const output = `${child.stdout ?? ''}${child.stderr ?? ''}`;
  if (child.error || child.status !== 0)
    throw incomparable(
      child.error ? child.error.message : `exit status ${child.status}`,
      output,
    );
  return output;
}

async function changedFiles(before, after) {
  const [beforeFiles, afterFiles] = await Promise.all([
    listFiles(before),
    listFiles(after),
  ]);
  const changes = [];
  for (const file of afterFiles) {
    if (!beforeFiles.includes(file)) changes.push({ file, kind: 'added' });
    else if (
      Buffer.compare(
        await readFile(join(before, file)),
        await readFile(join(after, file)),
      ) !== 0
    )
      changes.push({ file, kind: 'changed' });
  }
  for (const file of beforeFiles)
    if (!afterFiles.includes(file)) changes.push({ file, kind: 'removed' });
  return changes;
}

/**
 * Resolves with the files `drizzle-kit generate` would add, change or remove
 * (empty when the migrations match the schema) and the SQL it would add.
 * Rejects when the comparison itself cannot be made.
 */
async function findMissingMigration(apiDirectory) {
  const migrations = join(apiDirectory, migrationsFolder);
  await requirePath(join(apiDirectory, schemaEntry), 'schema entry');
  await requirePath(migrations, 'migrations folder');
  const workDirectory = await mkdtemp(join(tmpdir(), 'drizzle-drift-'));
  try {
    const copy = join(workDirectory, migrationsFolder);
    await cp(migrations, copy, { recursive: true });
    // drizzle-kit resolves an absolute `out` against the working directory on
    // Windows, so the copy is addressed relatively from inside workDirectory.
    // The schema is a glob, which needs forward slashes.
    await writeFile(
      join(workDirectory, 'drizzle.config.json'),
      JSON.stringify({
        dialect,
        schema: join(apiDirectory, schemaEntry).replaceAll('\\', '/'),
        out: `./${migrationsFolder}`,
      }),
    );
    const output = generate(apiDirectory, workDirectory);
    const changes = await changedFiles(migrations, copy);
    if (changes.length === 0 && !output.includes('No schema changes'))
      throw incomparable(
        'it did not report that the schema is unchanged',
        output,
      );
    const sql = [];
    for (const { file, kind } of changes)
      if (kind === 'added' && file.endsWith('.sql'))
        sql.push({ file, text: await readFile(join(copy, file), 'utf8') });
    return { changes, sql };
  } finally {
    await rm(workDirectory, { recursive: true, force: true });
  }
}

function describeDrift(apiDirectory, { changes, sql }) {
  const symbols = { added: '+', changed: '~', removed: '-' };
  const lines = [
    `The Drizzle migrations in ${relative(process.cwd(), join(apiDirectory, migrationsFolder)) || migrationsFolder} diverge from the schema.`,
    '`drizzle-kit generate` would still write:',
    ...changes.map(({ file, kind }) => `  ${symbols[kind]} ${file}`),
  ];
  for (const { file, text } of sql) {
    const statements = text.trimEnd().split('\n');
    lines.push('', `Missing SQL (${file}):`);
    lines.push(...statements.slice(0, reportedSqlLines));
    if (statements.length > reportedSqlLines)
      lines.push(`... ${statements.length - reportedSqlLines} more lines`);
  }
  lines.push(
    '',
    'Run `pnpm db:generate`, review the migration, and commit it with the schema change.',
  );
  return lines.join('\n');
}

async function main(argv) {
  const { values } = parseArgs({
    args: argv,
    options: { 'api-directory': { type: 'string' } },
    strict: true,
  });
  const apiDirectory = values['api-directory'] ?? defaultApiDirectory;
  const result = await findMissingMigration(apiDirectory);
  if (result.changes.length > 0) {
    console.error(describeDrift(apiDirectory, result));
    process.exitCode = 1;
    return;
  }
  console.log('The Drizzle migrations match the schema.');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    await main(process.argv.slice(2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
