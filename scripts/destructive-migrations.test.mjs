import assert from 'node:assert/strict';
import test from 'node:test';

import {
  checkMigrations,
  findDestructiveStatements,
  grandfatheredDestructiveStatements,
  lastGrandfatheredMigration,
  readMigrationFiles,
} from './destructive-migrations.mjs';

// AGENTS.md Code Review Rules, "Drizzle migrations": drop or rename in one
// step loses data and breaks consumers. This test makes that rule executable
// for every SQL migration in apps/api/drizzle.

const marker =
  '-- destructive-change: superseded by notes.text, approved in #1101';

const destructiveStatements = [
  ['drop-table', 'DROP TABLE "notes";'],
  ['drop-table', 'DROP TABLE IF EXISTS "notes" CASCADE;'],
  ['drop-schema', 'DROP SCHEMA "legacy" CASCADE;'],
  ['drop-column', 'ALTER TABLE "notes" DROP COLUMN "body";'],
  ['drop-column', 'ALTER TABLE "notes" DROP "body";'],
  ['rename', 'ALTER TABLE "notes" RENAME COLUMN "body" TO "text";'],
  ['rename', 'ALTER TABLE "notes" RENAME TO "memos";'],
  ['rename', "ALTER TYPE \"note_state\" RENAME VALUE 'open' TO 'opened';"],
  ['rename', 'ALTER TABLE "notes" RENAME CONSTRAINT "a" TO "b";'],
  [
    'alter-type',
    'ALTER TABLE "notes" ALTER COLUMN "body" SET DATA TYPE varchar(10);',
  ],
  [
    'alter-type',
    'ALTER TABLE "notes" ALTER COLUMN "body" TYPE varchar(10) USING "body"::varchar;',
  ],
  ['drop-key', 'ALTER TABLE "notes" DROP CONSTRAINT "notes_owner_fk";'],
  ['drop-key', 'ALTER TABLE "notes" DROP CONSTRAINT IF EXISTS notes_pkey;'],
  ['drop-key', 'ALTER TABLE "notes" DROP CONSTRAINT "notes_owner_tag_pk";'],
  ['truncate', 'TRUNCATE TABLE "notes";'],
  ['truncate', 'TRUNCATE "notes", "tags" RESTART IDENTITY;'],
  ['delete-all', 'DELETE FROM "notes";'],
];

const harmlessSql = [
  'ALTER TABLE "notes" ADD COLUMN "body" text;',
  'ALTER TABLE "notes" ALTER COLUMN "body" DROP NOT NULL;',
  'ALTER TABLE "notes" ALTER COLUMN "body" DROP DEFAULT;',
  'ALTER TABLE "notes" DROP CONSTRAINT "notes_body_check";',
  'ALTER TABLE "notes" DROP CONSTRAINT "notes_body_unique";',
  'DROP INDEX "notes_body_idx";',
  'DROP TRIGGER "notes_touch" ON "notes";',
  'DROP FUNCTION "touch_note"();',
  'DELETE FROM "notes" WHERE "id" = 1;',
  'DELETE FROM "notes" AS n USING "tags" AS t\nWHERE n."tag" = t."id";',
  'ALTER TABLE "notes" ADD CONSTRAINT "notes_owner_fk" FOREIGN KEY ("owner_id") REFERENCES "owners"("id") ON DELETE CASCADE ON UPDATE NO ACTION;',
  'ALTER TYPE "public"."note_state" ADD VALUE \'archived\';',
  'ALTER TABLE "notes" ADD COLUMN "truncated_at" timestamp;',
  'UPDATE "notes" SET "renamed" = true;',
  'CREATE TABLE "notes" ("rename" text, "truncate" text, "drop" text);',
  'INSERT INTO "notes" ("body") VALUES (\'DROP TABLE notes; TRUNCATE notes\');',
  'INSERT INTO "notes" ("body") VALUES (\'it\'\'s DROP TABLE notes\');',
  'INSERT INTO "notes" ("body") VALUES (E\'it\\\'s DROP TABLE notes\');',
  '-- DROP TABLE "notes";\nSELECT 1;',
  '/* TRUNCATE "notes"; */ SELECT 1;',
  '/* outer /* nested */ DROP TABLE "notes"; */ SELECT 1;',
];

const fixture = (sql, name = '0100_fixture.sql') => [{ name, sql }];

test('every destructive statement kind is found, once, with its line', () => {
  for (const [kind, sql] of destructiveStatements) {
    const found = findDestructiveStatements(`SELECT 1;\n\n${sql}\n`);

    assert.deepEqual(
      found.map((finding) => [finding.kind, finding.line]),
      [[kind, 3]],
      sql,
    );
  }
});

test('harmless statements, comments and string literals are not flagged', () => {
  for (const sql of harmlessSql) {
    assert.deepEqual(findDestructiveStatements(sql), [], sql);
  }
});

test('an unmarked destructive statement fails, naming the file, line, statement and the safe alternative', () => {
  for (const [, sql] of destructiveStatements) {
    const failures = checkMigrations(
      fixture(`SELECT 1;--> statement-breakpoint\n${sql}\n`),
      [],
    );

    assert.equal(failures.length, 1, sql);
    const [message] = failures;
    assert.match(message, /apps\/api\/drizzle\/0100_fixture\.sql:2\b/, sql);
    assert.ok(message.includes(sql.replace(/;$/, '')), message);
    assert.match(message, /expand/i);
    assert.match(message, /backfill/i);
    assert.match(message, /contract/i);
    assert.match(
      message,
      /-- destructive-change: <reason>, approved in #<issue>/,
    );
  }
});

test('a marker directly above the statement accepts it', () => {
  for (const [, sql] of destructiveStatements) {
    assert.deepEqual(
      checkMigrations(fixture(`SELECT 1;\n${marker}\n${sql}\n`), []),
      [],
      sql,
    );
  }
});

test('a marker on the first line of the statement accepts it', () => {
  assert.deepEqual(
    checkMigrations(
      fixture(`ALTER TABLE "notes" DROP COLUMN "body"; ${marker}\n`),
      [],
    ),
    [],
  );
  assert.equal(
    checkMigrations(
      fixture(`ALTER TABLE "notes"\n  DROP COLUMN "body"; ${marker}\n`),
      [],
    ).length,
    1,
    'the marker must be next to the first line of the statement, not its tail',
  );
});

test('a marker with a reason sits above a statement that follows a Drizzle breakpoint', () => {
  const sql = [
    'ALTER TABLE "notes" ADD COLUMN "text" text;--> statement-breakpoint',
    '-- destructive-change: moved to notes.text by 0100, approved in #1101',
    '-- the body column has no reader left',
    'ALTER TABLE "notes" DROP COLUMN "body";',
  ].join('\n');

  assert.deepEqual(checkMigrations(fixture(sql), []), []);
});

test('a marker that is not next to the statement does not accept it', () => {
  const farAway = [
    marker,
    'SELECT 1;',
    'ALTER TABLE "notes" DROP COLUMN "body";',
  ].join('\n');
  const blankLine = [
    marker,
    '',
    'ALTER TABLE "notes" DROP COLUMN "body";',
  ].join('\n');
  const breakpointBetween = [
    marker,
    '--> statement-breakpoint',
    'ALTER TABLE "notes" DROP COLUMN "body";',
  ].join('\n');
  const belongsToPrevious = [
    `ALTER TABLE "notes" DROP COLUMN "body"; ${marker}`,
    'ALTER TABLE "notes" DROP COLUMN "title";',
  ].join('\n');

  for (const sql of [farAway, blankLine, breakpointBetween]) {
    assert.equal(checkMigrations(fixture(sql), []).length, 1, sql);
  }
  const failures = checkMigrations(fixture(belongsToPrevious), []);
  assert.equal(failures.length, 1, 'only the second statement is unmarked');
  assert.match(failures[0], /0100_fixture\.sql:2\b/);
  assert.match(failures[0], /DROP COLUMN "title"/);
});

test('a marker without a reason or without an approving issue does not count', () => {
  const unusable = [
    '-- destructive-change: approved in #1101',
    '-- destructive-change: superseded by notes.text',
    '-- destructive-change: superseded by notes.text, approved in review',
    '-- destructive-change: x, approved in #1101',
    '-- destructive: superseded by notes.text, approved in #1101',
    '-- TODO destructive-change superseded by notes.text approved in 1101',
  ];

  for (const comment of unusable) {
    assert.equal(
      checkMigrations(
        fixture(`${comment}\nALTER TABLE "notes" DROP COLUMN "body";\n`),
        [],
      ).length,
      1,
      comment,
    );
  }
});

test('one marker accepts every destructive action of the statement it sits above', () => {
  const sql = `${marker}\nALTER TABLE "notes" DROP COLUMN "body", DROP COLUMN "title";\n`;

  assert.equal(findDestructiveStatements(sql).length, 1, 'deduplicated');
  assert.deepEqual(checkMigrations(fixture(sql), []), []);
});

test('a statement that spans lines is read as one, and CRLF files give the same lines', () => {
  const sql = 'ALTER TABLE "notes"\r\n  DROP COLUMN "body";\r\n';
  const [finding] = findDestructiveStatements(sql.replaceAll('\r\n', '\n'));

  assert.equal(finding.line, 1);
  assert.equal(finding.statement, 'ALTER TABLE "notes" DROP COLUMN "body"');
});

test('a foreign key dropped and added back under the same name is a replacement, not a loss', () => {
  const replaced = [
    'ALTER TABLE "notes" DROP CONSTRAINT "notes_owner_fk";--> statement-breakpoint',
    'ALTER TABLE "notes" ADD COLUMN "tenant_id" uuid;--> statement-breakpoint',
    'ALTER TABLE "notes" ADD CONSTRAINT "notes_owner_fk" FOREIGN KEY ("tenant_id","owner_id") REFERENCES "owners"("tenant_id","id");',
  ].join('\n');
  const replacedByAnotherName = replaced.replace(
    'ADD CONSTRAINT "notes_owner_fk"',
    'ADD CONSTRAINT "notes_owner_tenant_fk"',
  );

  assert.deepEqual(checkMigrations(fixture(replaced), []), []);
  assert.equal(checkMigrations(fixture(replacedByAnotherName), []).length, 1);
});

test('a delete without a where clause fails, with one it does not', () => {
  assert.equal(checkMigrations(fixture('DELETE FROM "notes";'), []).length, 1);
  assert.deepEqual(
    checkMigrations(fixture('DELETE FROM "notes" WHERE "id" IS NULL;'), []),
    [],
  );
});

test('a grandfathered statement passes, a new one in the same file or a stale entry fails', () => {
  const name = '0050_fixture.sql';
  const sql = [
    'ALTER TABLE "notes" DROP COLUMN "body";--> statement-breakpoint',
    'ALTER TABLE "notes" DROP COLUMN "title";',
  ].join('\n');
  const entry = (statement) => ({
    file: name,
    kind: 'drop-column',
    statement,
    reason: 'contract step of the notes split, approved in #1101',
  });

  assert.deepEqual(
    checkMigrations(fixture(sql, name), [
      entry('ALTER TABLE "notes" DROP COLUMN "body"'),
      entry('ALTER TABLE "notes" DROP COLUMN "title"'),
    ]),
    [],
  );

  const added = checkMigrations(fixture(sql, name), [
    entry('ALTER TABLE "notes" DROP COLUMN "body"'),
  ]);
  assert.equal(added.length, 1, 'the second drop is not grandfathered');
  assert.match(added[0], /"title"/);

  const stale = checkMigrations(fixture('SELECT 1;', name), [
    entry('ALTER TABLE "notes" DROP COLUMN "body"'),
  ]);
  assert.equal(stale.length, 1, 'the entry matches nothing');
  assert.match(stale[0], /grandfather/i);
  assert.match(stale[0], /0050_fixture\.sql/);
  assert.match(stale[0], /remove/i);
});

test('the grandfather list is frozen: a migration after the last one needs a marker', () => {
  const name = `${String(lastGrandfatheredMigration + 1).padStart(4, '0')}_new.sql`;
  const failures = checkMigrations(
    fixture('ALTER TABLE "notes" DROP COLUMN "body";', name),
    [
      {
        file: name,
        kind: 'drop-column',
        statement: 'ALTER TABLE "notes" DROP COLUMN "body"',
        reason: 'new migrations use the marker comment, approved in #1101',
      },
    ],
  );

  assert.equal(failures.length, 1);
  assert.match(failures[0], /frozen/i);
  assert.match(failures[0], /destructive-change/);
});

test('every migration in apps/api/drizzle is scanned and only the grandfathered statements are destructive', async () => {
  const files = await readMigrationFiles();

  assert.ok(files.length > 0, 'no migration found: is the folder moved?');
  assert.deepEqual(
    checkMigrations(files, grandfatheredDestructiveStatements),
    [],
  );
});

test('every grandfathered entry names an existing migration, a statement and an approving issue', async () => {
  const names = new Set((await readMigrationFiles()).map((file) => file.name));

  assert.ok(grandfatheredDestructiveStatements.length > 0);
  for (const entry of grandfatheredDestructiveStatements) {
    assert.ok(names.has(entry.file), `${entry.file} is not a migration`);
    assert.match(entry.reason, /#\d+/, `${entry.file} reason cites no issue`);
    assert.ok(entry.reason.length >= 40, `${entry.file} reason is too thin`);
  }
});

// Proof on a real past migration. 0016 is the only migration in the history
// that drops columns (#71, PR #185, the contract step of #65 / PR #70). It is
// grandfathered, so without its entries the check must fail on it.
test('the real contract migration 0016 fails the check once it is not grandfathered', async () => {
  const files = await readMigrationFiles();
  const contract = files.filter((file) => file.name.startsWith('0016_'));
  assert.equal(contract.length, 1);

  const failures = checkMigrations(contract, []);

  assert.deepEqual(
    failures.map((message) => /\((drop-[a-z]+)\)/.exec(message)?.[1]),
    ['drop-key', 'drop-column', 'drop-column'],
  );
  assert.match(failures[1], /0016_sharp_master_chief\.sql:10\b/);
  assert.match(failures[1], /DROP COLUMN "workspace_id"/);
});

// Deliberate mutation of the latest real migration: the history holds no
// unapproved destructive migration to replay, so one is appended to a copy.
test('a destructive statement appended to the latest real migration fails', async () => {
  const files = await readMigrationFiles();
  const latest = files.at(-1);
  const mutated = [
    ...files.slice(0, -1),
    {
      ...latest,
      sql: `${latest.sql}\nALTER TABLE "tasks" DROP COLUMN "title";\n`,
    },
  ];

  const failures = checkMigrations(mutated, grandfatheredDestructiveStatements);

  assert.equal(failures.length, 1);
  assert.ok(failures[0].includes(latest.name));
  assert.match(failures[0], /DROP COLUMN "title"/);
});
