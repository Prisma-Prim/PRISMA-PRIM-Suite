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

test('a foreign key dropped from one table is not replaced by the same name added to another table or schema', () => {
  const add = (table) =>
    `ALTER TABLE ${table} ADD CONSTRAINT "owner_fk" FOREIGN KEY ("owner_id") REFERENCES "owners"("id");`;
  const drop = (table) => `ALTER TABLE ${table} DROP CONSTRAINT "owner_fk";`;
  const lost = [
    [drop('"a"'), add('"b"')],
    [drop('"a"'), add('"legacy"."a"')],
    [drop('"legacy"."a"'), add('"a"')],
    [drop('"a"'), add('"public"."a_copy"')],
    [add('"b"'), drop('"a"')],
  ];

  for (const statements of lost) {
    const sql = statements.join('--> statement-breakpoint\n');
    const found = findDestructiveStatements(sql);

    assert.equal(found.length, 1, sql);
    assert.equal(found[0].kind, 'drop-key', sql);
    assert.match(found[0].statement, /DROP CONSTRAINT/, sql);
    assert.equal(checkMigrations(fixture(sql), []).length, 1, sql);
  }
});

test('a foreign key replaced on the same table is accepted however the table is spelled', () => {
  const replacement = (table) =>
    `ALTER TABLE ${table} ADD CONSTRAINT "owner_fk" FOREIGN KEY ("owner_id") REFERENCES "owners"("id");`;
  const drop = (table) => `ALTER TABLE ${table} DROP CONSTRAINT "owner_fk";`;
  const spellings = [
    ['"notes"', '"notes"'],
    ['"notes"', '"public"."notes"'],
    ['public.notes', 'notes'],
    ['NOTES', '"notes"'],
    ['ONLY "notes"', '"notes"'],
    ['IF EXISTS "public"."notes"', 'ONLY public . notes'],
  ];

  for (const [dropped, added] of spellings) {
    const sql = [drop(dropped), replacement(added)].join(
      '--> statement-breakpoint\n',
    );

    assert.deepEqual(findDestructiveStatements(sql), [], sql);
    assert.deepEqual(
      checkMigrations(
        fixture([replacement(added), drop(dropped)].join('\n')),
        [],
      ),
      [],
    );
  }

  const oneStatement =
    'ALTER TABLE "notes" DROP CONSTRAINT "owner_fk", ADD CONSTRAINT "owner_fk" FOREIGN KEY ("owner_id") REFERENCES "owners"("id");';
  assert.deepEqual(findDestructiveStatements(oneStatement), []);
});

test('a quoted table or constraint name is case-sensitive, an unquoted one is folded to lower case', () => {
  const replacement = (table, constraint) =>
    [
      `ALTER TABLE ${table[0]} DROP CONSTRAINT ${constraint[0]};`,
      `ALTER TABLE ${table[1]} ADD CONSTRAINT ${constraint[1]} FOREIGN KEY ("owner_id") REFERENCES "owners"("id");`,
    ].join('\n');
  const kept = (table, constraint) =>
    findDestructiveStatements(replacement(table, constraint));

  assert.deepEqual(kept(['"Notes"', '"Notes"'], ['a_fk', 'a_fk']), []);
  assert.equal(kept(['"Notes"', '"notes"'], ['a_fk', 'a_fk']).length, 1);
  assert.equal(kept(['"Notes"', 'Notes'], ['a_fk', 'a_fk']).length, 1);
  assert.deepEqual(kept(['Notes', '"notes"'], ['a_fk', 'a_fk']), []);
  assert.deepEqual(kept(['"notes"', '"notes"'], ['"a_fk"', 'A_FK']), []);
  assert.equal(kept(['"notes"', '"notes"'], ['"A_FK"', '"a_fk"']).length, 1);
});

test('a key dropped inside a DO block is replaced only by a key added to the same table', () => {
  const block = (body) => `DO $$ BEGIN ${body} END $$;`;
  const drop = 'ALTER TABLE "a" DROP CONSTRAINT "owner_fk";';
  const add = (table) =>
    `ALTER TABLE ${table} ADD CONSTRAINT "owner_fk" FOREIGN KEY ("owner_id") REFERENCES "owners"("id");`;

  assert.deepEqual(
    findDestructiveStatements(block(`${drop} ${add('"a"')}`)),
    [],
  );
  assert.equal(
    findDestructiveStatements(block(`${drop} ${add('"b"')}`)).length,
    1,
  );
});

test('a delete without a where clause fails, with one it does not', () => {
  assert.equal(checkMigrations(fixture('DELETE FROM "notes";'), []).length, 1);
  assert.deepEqual(
    checkMigrations(fixture('DELETE FROM "notes" WHERE "id" IS NULL;'), []),
    [],
  );
});

test('a where clause of a CTE, a USING subquery or a RETURNING subquery does not exempt an unfiltered delete', () => {
  const unfiltered = [
    'WITH selected AS (SELECT id FROM source WHERE enabled) DELETE FROM target;',
    'WITH selected AS (SELECT id FROM source WHERE enabled)\nDELETE FROM "target" RETURNING "id";',
    'DELETE FROM "target" USING (SELECT "id" FROM "source" WHERE "enabled") AS "s";',
    'DELETE FROM "target" AS "t" USING "source" AS "s" WHERE "t"."id" = "s"."id" AND "s"."ok"; DELETE FROM "other";',
    'DELETE FROM "target" RETURNING (SELECT 1 WHERE true);',
    'WITH gone AS (DELETE FROM "target" RETURNING "id") SELECT count(*) FROM "gone" WHERE true;',
    'WITH selected AS (SELECT 1 WHERE true), gone AS (DELETE FROM "target" RETURNING "id") SELECT * FROM "gone";',
    'WITH gone AS (DELETE FROM "a" RETURNING "id") DELETE FROM "b" WHERE "id" IN (SELECT "id" FROM "gone");',
  ];

  for (const sql of unfiltered) {
    const found = findDestructiveStatements(`SELECT 1;\n${sql}\n`);

    assert.deepEqual(
      found.map((finding) => [finding.kind, finding.line]),
      [['delete-all', 2]],
      sql,
    );
    assert.equal(checkMigrations(fixture(sql), []).length, 1, sql);
  }

  const [first] = findDestructiveStatements(unfiltered[0]);
  assert.match(first.statement, /^WITH selected AS .* DELETE FROM target$/);
});

test('a delete whose own where clause is present stays accepted next to CTEs and subqueries', () => {
  const filtered = [
    'WITH selected AS (SELECT id FROM source WHERE enabled) DELETE FROM target WHERE id IN (SELECT id FROM selected);',
    'WITH selected AS (SELECT id FROM source) DELETE FROM target\nUSING selected\nWHERE target.id = selected.id;',
    'DELETE FROM "target" USING (SELECT "id" FROM "source" WHERE "enabled") AS "s" WHERE "target"."id" = "s"."id";',
    'DELETE FROM "target" WHERE "id" IN (SELECT "id" FROM "source" WHERE "enabled");',
    'WITH gone AS (DELETE FROM "target" WHERE "stale" RETURNING "id") SELECT * FROM "gone";',
    'DELETE FROM "target" WHERE CURRENT OF "cursor";',
    'DELETE FROM ONLY "target" * WHERE "id" = 1 RETURNING *;',
  ];

  for (const sql of filtered) {
    assert.deepEqual(findDestructiveStatements(sql), [], sql);
  }
});

test('a delete without a where clause inside a DO block or a function body fails', () => {
  const sql = 'DO $$ BEGIN DELETE FROM "notes"; END $$;';

  assert.deepEqual(
    findDestructiveStatements(sql).map((finding) => finding.kind),
    ['delete-all'],
  );
  assert.deepEqual(
    findDestructiveStatements(
      'DO $$ BEGIN DELETE FROM "notes" WHERE "id" = 1; END $$;',
    ),
    [],
  );
});

test('an apostrophe inside a dollar-quoted string does not hide the statement that follows', () => {
  const hidden = [
    [
      `COMMENT ON TABLE "notes" IS $$User's notes$$;\nDROP TABLE "notes";`,
      ['drop-table', 2],
    ],
    [
      `COMMENT ON TABLE "notes" IS $note$User's $$ notes$note$;\nDROP TABLE "notes";`,
      ['drop-table', 2],
    ],
    [
      `COMMENT ON TABLE "notes" IS $$line one\nUser's line two\n$$;\nALTER TABLE "notes" DROP COLUMN "body";`,
      ['drop-column', 4],
    ],
    [
      `COMMENT ON TABLE "notes" IS $$it's$$; COMMENT ON TABLE "tags" IS $x$it's$x$;\nTRUNCATE "notes";`,
      ['truncate', 2],
    ],
    [`SELECT $$a$$$$b$$, 'it''s'; DELETE FROM "notes";`, ['delete-all', 1]],
  ];

  for (const [sql, [kind, line]] of hidden) {
    assert.deepEqual(
      findDestructiveStatements(sql).map((finding) => [
        finding.kind,
        finding.line,
      ]),
      [[kind, line]],
      sql,
    );
    assert.equal(checkMigrations(fixture(sql), []).length, 1, sql);
  }
});

test('a destructive keyword inside a dollar-quoted string is not flagged', () => {
  const harmless = [
    'SELECT $$DROP TABLE notes$$;',
    'SELECT $note$DROP TABLE notes; TRUNCATE notes; DELETE FROM notes$note$;',
    'COMMENT ON TABLE "notes" IS $$ALTER TABLE "notes" DROP COLUMN "body"; $$;',
    'INSERT INTO "notes" ("body") VALUES ($$it\'s DROP TABLE notes$$);',
    'INSERT INTO "notes" ("body") VALUES ($a$ $b$ DROP TABLE notes $b$ $a$);',
    'COMMENT ON COLUMN "notes"."body" IS $$-- DROP TABLE "notes"; /* RENAME $$;',
    'SELECT $$ DROP TABLE notes',
  ];

  for (const sql of harmless) {
    assert.deepEqual(findDestructiveStatements(sql), [], sql);
  }
});

test('a dollar sign that is part of an identifier or a parameter does not open a string', () => {
  const stillDestructive = [
    'CREATE TABLE "notes" ("a$$b" text, c$$d text);\nDROP TABLE "notes";',
    'SELECT price$$ FROM "notes";\nDROP TABLE "notes";',
    'PREPARE p AS SELECT $1, $2;\nDROP TABLE "notes";',
    'SELECT 1 AS "$$";\nDROP TABLE "notes";',
    'SELECT 1 AS a$1$;\nDROP TABLE "notes";',
  ];

  for (const sql of stillDestructive) {
    assert.deepEqual(
      findDestructiveStatements(sql).map((finding) => [
        finding.kind,
        finding.line,
      ]),
      [['drop-table', 2]],
      sql,
    );
  }
});

test('a DO block or a function body in dollar quotes is still scanned as code', () => {
  const bodies = [
    ['DO $$ BEGIN\n  DROP TABLE "notes";\nEND $$;', [['drop-table', 1]]],
    [
      'DO LANGUAGE plpgsql $body$ BEGIN ALTER TABLE "notes" DROP COLUMN "body"; END $body$;',
      [['drop-column', 1]],
    ],
    [
      'CREATE OR REPLACE FUNCTION "migrate"() RETURNS void LANGUAGE plpgsql AS $fn$\nBEGIN\n  TRUNCATE "notes";\nEND\n$fn$;',
      [['truncate', 1]],
    ],
    [
      'CREATE PROCEDURE "migrate"() AS $$ BEGIN ALTER TABLE "notes" RENAME TO "memos"; END $$ LANGUAGE plpgsql;',
      [['rename', 1]],
    ],
    ["DO $$ BEGIN RAISE NOTICE 'it''s DROP TABLE notes'; END $$;", []],
    [
      'CREATE FUNCTION "f"() RETURNS trigger AS $$ BEGIN RAISE EXCEPTION \'it\'\'s append-only\'; END $$ LANGUAGE plpgsql;\nDROP TABLE "notes";',
      [['drop-table', 2]],
    ],
  ];

  for (const [sql, expected] of bodies) {
    assert.deepEqual(
      findDestructiveStatements(sql).map((finding) => [
        finding.kind,
        finding.line,
      ]),
      expected,
      sql,
    );
  }
});

test('a dollar-quoted body nested inside an executable body is still scanned as code', () => {
  const nested = [
    'DO $$ BEGIN DO $inner$ BEGIN DROP TABLE notes; END $inner$; END $$;',
    'DO $$ BEGIN\n  DO $inner$ BEGIN\n    DROP TABLE notes;\n  END $inner$;\nEND $$;',
    'DO $a$ BEGIN DO $b$ BEGIN DO $c$ BEGIN DROP TABLE notes; END $c$; END $b$; END $a$;',
    'DO $$ BEGIN CREATE FUNCTION f() RETURNS void LANGUAGE plpgsql AS $f$ BEGIN DROP TABLE "notes"; END $f$; END $$;',
    'CREATE FUNCTION "outer"() RETURNS void LANGUAGE plpgsql AS $o$ BEGIN CREATE OR REPLACE PROCEDURE "p"() AS $p$ BEGIN DROP TABLE "notes"; END $p$ LANGUAGE plpgsql; END $o$;',
    'DO $$ BEGIN EXECUTE $q$ DROP TABLE notes $q$; END $$;',
    'DO $$ BEGIN EXECUTE $q$ ALTER TABLE notes DROP COLUMN body $q$; END $$;',
  ];

  for (const sql of nested) {
    assert.ok(
      findDestructiveStatements(sql).some((finding) =>
        finding.kind.startsWith('drop-'),
      ),
      sql,
    );
    assert.ok(checkMigrations(fixture(sql), []).length >= 1, sql);
  }
  assert.deepEqual(
    findDestructiveStatements(nested[0]).map((finding) => [
      finding.kind,
      finding.line,
    ]),
    [['drop-table', 1]],
  );
});

test('a dollar-quoted body nested inside a text literal stays text', () => {
  const harmless = [
    'SELECT $$ DO $x$ BEGIN DROP TABLE notes; END $x$ $$;',
    'COMMENT ON TABLE "notes" IS $c$ DO $$ BEGIN TRUNCATE notes; END $$ $c$;',
  ];

  for (const sql of harmless) {
    assert.deepEqual(findDestructiveStatements(sql), [], sql);
  }
});

// Every SQL migration is scanned in CI, so a large backfill must not stall it.
test('a very large statement is scanned in linear time', () => {
  const insert = (row) =>
    `INSERT INTO notes(id, body) VALUES ${Array.from({ length: 22_000 }, (_, id) => row(id)).join(', ')};`;
  const statements = [
    insert((id) => `(${id}, 1)`),
    insert((id) => `(${id}, 'it''s ${id}')`),
    insert((id) => `(${id}, $$it's ${id}$$)`),
  ];

  for (const sql of statements) {
    assert.ok(sql.length > 190_000, `${sql.length} characters`);
    const startedAt = performance.now();
    const found = findDestructiveStatements(sql);
    const elapsed = performance.now() - startedAt;

    assert.deepEqual(found, []);
    assert.ok(
      elapsed < 2000,
      `${Math.round(elapsed)} ms for ${sql.length} characters`,
    );
  }
});

test('a marker above a DO block accepts what its body drops', () => {
  const sql = [
    marker,
    'DO $$ BEGIN',
    '  ALTER TABLE "notes" DROP COLUMN "body";',
    'END $$;',
  ].join('\n');

  assert.equal(findDestructiveStatements(sql).length, 1);
  assert.deepEqual(checkMigrations(fixture(sql), []), []);
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
