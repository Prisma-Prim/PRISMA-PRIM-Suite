import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

// Makes the AGENTS.md Code Review Rule "Drop or rename in one step: loses
// data, breaks consumers. Safe: expand, backfill, contract" executable
// (ADR 0002). destructive-migrations.test.mjs runs it on every SQL migration
// in apps/api/drizzle through `pnpm test:scripts`.
//
// A destructive statement passes only with a marker comment next to it:
//
//   -- destructive-change: <reason>, approved in #<issue>
//   ALTER TABLE "x" DROP COLUMN "y";
//
// "Next to it" means on the statement's first line, or in the comment lines
// that directly precede it (no blank line, no Drizzle breakpoint between).
// Migrations that predate the check are listed in
// grandfatheredDestructiveStatements; applied migrations are never edited.

export const migrationsDirectory = fileURLToPath(
  new URL('../apps/api/drizzle/', import.meta.url),
);
const migrationsLabel = 'apps/api/drizzle';

export const markerSyntax =
  '-- destructive-change: <reason>, approved in #<issue>';
const markerPattern =
  /--\s*destructive-change:\s*(\S.{8,}?)\s*,?\s*approved in #(\d+)\b/;

// The grandfather list is frozen at the last migration that existed when the
// check was introduced. Later migrations must carry the marker.
export const lastGrandfatheredMigration = 99;

// Each entry names the migration, the kind of the statement and the statement
// itself (comments removed, whitespace collapsed, no trailing semicolon). An
// entry that matches nothing fails the check, so the list cannot rot.
export const grandfatheredDestructiveStatements = [
  {
    file: '0002_workspace-membership-authority.sql',
    kind: 'drop-key',
    statement:
      'ALTER TABLE "activity_log_events" DROP CONSTRAINT "activity_log_events_actor_workspace_fk"',
    reason:
      'Expand phase of #65 (PR #70): the same file first adds activity_log_events_actor_membership_fk and backfills actor_workspace_membership_id, so this Workspace-relative foreign key is replaced, not lost; no row or identifier is removed.',
  },
  {
    file: '0002_workspace-membership-authority.sql',
    kind: 'drop-key',
    statement:
      'ALTER TABLE "activity_log_events" DROP CONSTRAINT "activity_log_events_target_workspace_fk"',
    reason:
      'Expand phase of #65 (PR #70): replaced by activity_log_events_target_membership_fk, added and backfilled earlier in the same file; no row or identifier is removed.',
  },
  {
    file: '0016_sharp_master_chief.sql',
    kind: 'drop-key',
    statement:
      'ALTER TABLE "internal_users" DROP CONSTRAINT "internal_users_workspace_id_workspaces_id_fk"',
    reason:
      'Contract step #71 (PR #185) of the #65 expansion: the foreign key of internal_users.workspace_id goes with that column once workspace_memberships, backfilled by 0002, is the only authority relationship.',
  },
  {
    file: '0016_sharp_master_chief.sql',
    kind: 'drop-column',
    statement: 'ALTER TABLE "internal_users" DROP COLUMN "workspace_id"',
    reason:
      'Contract step #71 (PR #185): its data was copied into workspace_memberships by 0002 (#65, PR #70) and no pre-membership binary still runs (#160); Workspace, Internal User and Membership identifiers are unchanged.',
  },
  {
    file: '0016_sharp_master_chief.sql',
    kind: 'drop-column',
    statement: 'ALTER TABLE "workspaces" DROP COLUMN "singleton_key"',
    reason:
      'Contract step #71 (PR #185): singleton_key only enforced the pre-membership single-Workspace assumption (its unique index is dropped in the same file) and held no business data; admission now resolves a configured Workspace ID.',
  },
];

const adviceByKind = {
  'drop-table':
    'Add the replacement table, backfill it, move every reader and writer to it, and drop this table in a later migration.',
  'drop-schema':
    'Move every object out of the schema, backfill, move every consumer, and drop the schema in a later migration.',
  'drop-column':
    'Keep the column, stop writing it, backfill its data into the replacement, ship code that no longer reads it, and drop it in a later migration.',
  rename:
    'Add the new name beside the old one, backfill it, move every consumer to it, and drop the old name in a later migration.',
  'alter-type':
    'Add a column of the new type, backfill it with a checked cast, move every consumer, and drop the old column in a later migration. A pure widening may use the marker; say so in its reason.',
  'drop-key':
    'Add the replacement constraint first (re-adding a constraint of the same name to the same table in this file is accepted as a replacement); dropping a key with no replacement removes the integrity guarantee.',
  truncate:
    'Remove only the rows you name with DELETE ... WHERE, preserving identifiers and events; Activity Log events are append-only.',
  'delete-all':
    'Remove only the rows you name with DELETE ... WHERE, preserving identifiers and events; Activity Log events are append-only.',
};

const descriptionByKind = {
  'drop-table': 'drops a table',
  'drop-schema': 'drops a schema',
  'drop-column': 'drops a column',
  rename: 'renames an object',
  'alter-type': 'changes a column type',
  'drop-key': 'drops a primary or foreign key',
  truncate: 'truncates a table',
  'delete-all': 'deletes every row of a table',
};

const wordOrQuoted = String.raw`"[^"]*"|[\w$]+`;
const keyConstraintName = /(?:_fk|_fkey|_pk|_pkey)$/i;
const simpleRules = [
  ['drop-table', /\bDROP\s+TABLE\b/i],
  ['drop-schema', /\bDROP\s+SCHEMA\b/i],
  ['drop-column', /\bDROP\s+COLUMN\b/i],
  ['rename', /\bRENAME\b/i],
  [
    'alter-type',
    new RegExp(
      String.raw`\bALTER\s+(?:COLUMN\s+)?(?:${wordOrQuoted})\s+(?:SET\s+DATA\s+)?TYPE\b`,
      'i',
    ),
  ],
  ['truncate', /\bTRUNCATE\b/i],
];
// PostgreSQL allows `ALTER TABLE t DROP col` without the COLUMN keyword.
const implicitDropColumn = new RegExp(
  String.raw`\bDROP\s+(?!COLUMN\b|CONSTRAINT\b|NOT\b|DEFAULT\b|IDENTITY\b|EXPRESSION\b)(?:IF\s+EXISTS\s+)?(?:${wordOrQuoted})`,
  'i',
);
const dropConstraint = new RegExp(
  String.raw`\bDROP\s+CONSTRAINT\s+(?:IF\s+EXISTS\s+)?(${wordOrQuoted})`,
  'gid',
);
const addConstraint = new RegExp(
  String.raw`\bADD\s+CONSTRAINT\s+(${wordOrQuoted})`,
  'gid',
);
// The owning table of a constraint action: ALTER TABLE [IF EXISTS] [ONLY]
// [schema.]table. An unqualified table is resolved in the default schema.
const alterTable = new RegExp(
  String.raw`\bALTER\s+TABLE\s+(?:IF\s+EXISTS\s+)?(?:ONLY\s+)?(${wordOrQuoted})(?:\s*\.\s*(${wordOrQuoted}))?`,
  'gid',
);
const defaultSchema = 'public';

// PostgreSQL dollar quoting: $$...$$ or $tag$...$tag$. The tag follows the
// rules of an unquoted identifier, minus the dollar sign.
const dollarDelimiter = /\$(?:[A-Za-z_\u0080-\uFFFF][\w\u0080-\uFFFF]*)?\$/y;
const identifierCharacter = /[\w$\u0080-\uFFFF]/;
// The body of a DO block or of a function or procedure is SQL, not text: it
// stays visible so a destructive statement inside it is still found. Inside
// such a body every nested dollar-quoted string stays visible too, including
// the one behind EXECUTE: a false positive is acceptable for a guard, a hidden
// DROP is not.
const codeBodyStatement =
  /^\s*(?:DO|CREATE\s+(?:OR\s+REPLACE\s+)?(?:FUNCTION|PROCEDURE))\b/i;
const statementHeadLength = 256;

/**
 * Returns a copy of the SQL of the same length in which comments and string
 * literals (single-quoted and dollar-quoted) are blanked and quoted
 * identifiers keep their quotes but lose their text, so keywords can be
 * matched without false positives. The body of a DO block or of a function is
 * masked the same way but stays code. Offsets and line numbers are identical
 * to the original.
 *
 * The output is only appended to, never read back: reading a string under
 * construction flattens it and makes the scan quadratic. The last character
 * and the start of the current statement are tracked on the side.
 */
function maskSql(sql, insideBody = false) {
  const hide = (text, fill) => text.replace(/[^\n]/g, fill);
  let masked = '';
  let previous = '';
  let statementHead = '';
  const emit = (chunk) => {
    masked += chunk;
    if (chunk !== '') previous = chunk.at(-1);
    if (statementHead.length < statementHeadLength) {
      const visible = statementHead === '' ? chunk.trimStart() : chunk;
      statementHead = (statementHead + visible).slice(0, statementHeadLength);
    }
  };
  let index = 0;
  while (index < sql.length) {
    const pair = sql.slice(index, index + 2);
    const delimiter = dollarDelimiterAt(sql, index, previous);
    let end = index + 1;
    if (pair === '--') {
      end = sql.indexOf('\n', index);
      if (end === -1) end = sql.length;
      emit(hide(sql.slice(index, end), ' '));
    } else if (pair === '/*') {
      end = endOfBlockComment(sql, index);
      emit(hide(sql.slice(index, end), ' '));
    } else if (delimiter) {
      const bodyStart = index + delimiter.length;
      const closing = sql.indexOf(delimiter, bodyStart);
      const bodyEnd = closing === -1 ? sql.length : closing;
      const body = sql.slice(bodyStart, bodyEnd);
      const isCode = insideBody || codeBodyStatement.test(statementHead);
      end = closing === -1 ? sql.length : closing + delimiter.length;
      emit(hide(delimiter, ' '));
      emit(isCode ? maskSql(body, true) : hide(body, ' '));
      emit(hide(sql.slice(bodyEnd, end), ' '));
    } else if (sql[index] === "'") {
      const escapes = /(?:^|\W)[eE]$/.test(
        sql.slice(Math.max(0, index - 2), index),
      );
      end = endOfQuoted(sql, index, "'", escapes);
      emit(hide(sql.slice(index, end), ' '));
    } else if (sql[index] === '"') {
      end = endOfQuoted(sql, index, '"', false);
      const quoted = sql.slice(index, end);
      emit(
        quoted.length < 2
          ? quoted
          : `"${hide(quoted.slice(1, -1), '_')}${quoted.at(-1)}`,
      );
    } else {
      emit(sql[index]);
      if (sql[index] === ';') statementHead = '';
    }
    index = end;
  }
  return masked;
}

/**
 * Returns the dollar-quote delimiter that opens at `index`, or null. A dollar
 * sign inside an identifier (`price$$`) or a parameter (`$1`) opens nothing;
 * `previous` is the character masked just before `index`, or ''.
 */
function dollarDelimiterAt(sql, index, previous) {
  if (sql[index] !== '$' || identifierCharacter.test(previous)) return null;
  dollarDelimiter.lastIndex = index;
  return dollarDelimiter.exec(sql)?.[0] ?? null;
}

function endOfBlockComment(sql, start) {
  let depth = 1;
  let index = start + 2;
  while (index < sql.length && depth > 0) {
    const pair = sql.slice(index, index + 2);
    if (pair === '/*') {
      depth += 1;
      index += 2;
    } else if (pair === '*/') {
      depth -= 1;
      index += 2;
    } else {
      index += 1;
    }
  }
  return index;
}

function endOfQuoted(sql, start, quote, backslashEscapes) {
  let index = start + 1;
  while (index < sql.length) {
    if (backslashEscapes && sql[index] === '\\') {
      index += 2;
    } else if (sql[index] === quote && sql[index + 1] === quote) {
      index += 2;
    } else if (sql[index] === quote) {
      return index + 1;
    } else {
      index += 1;
    }
  }
  return sql.length;
}

function statementRanges(masked) {
  const ranges = [];
  let from = 0;
  for (let end = 0; end <= masked.length; end += 1) {
    if (end < masked.length && masked[end] !== ';') continue;
    const chunk = masked.slice(from, end);
    if (chunk.trim() !== '') {
      ranges.push({
        start: from + chunk.length - chunk.trimStart().length,
        end,
      });
    }
    from = end + 1;
  }
  return ranges;
}

/**
 * Finds the constraint actions of one statement that `pattern` matches, as
 * `{ name, key }`. `key` identifies the constraint by its owning schema, table
 * and name (PostgreSQL allows one name on several tables), or is null when the
 * statement names no owning table. `code` is the masked statement and `raw`
 * the same statement unmasked, at the same offsets.
 */
function constraintActions(code, raw, pattern) {
  const tables = [...code.matchAll(alterTable)].map((match) => {
    const parts = match.indices
      .slice(1)
      .filter(Boolean)
      .map(([from, to]) => normalizeIdentifier(raw.slice(from, to)));
    return {
      at: match.index,
      owner: parts.length === 2 ? parts : [defaultSchema, parts[0]],
    };
  });
  return [...code.matchAll(pattern)].map((match) => {
    const [from, to] = match.indices[1];
    const name = normalizeIdentifier(raw.slice(from, to));
    const table = tables.findLast(({ at }) => at < match.index);
    return { name, key: table ? JSON.stringify([...table.owner, name]) : null };
  });
}

/** Folds an unquoted identifier to lower case; a quoted one keeps its case. */
function normalizeIdentifier(identifier) {
  const quoted = /^"(.*)"$/s.exec(identifier);
  return quoted ? quoted[1].replaceAll('""', '"') : identifier.toLowerCase();
}

/**
 * Whether `code` holds a DELETE that removes every row: one with no WHERE of
 * its own. A WHERE inside parentheses (a CTE, a USING or RETURNING subquery)
 * belongs to another query, and a DELETE inside a CTE ends where its
 * enclosing parenthesis closes.
 */
function deletesEveryRow(code) {
  return [...code.matchAll(/\bDELETE\s+FROM\b/gi)].some(
    (match) => !hasOwnWhere(code, match.index + match[0].length),
  );
}

function hasOwnWhere(code, from) {
  let depth = 0;
  for (const token of code.slice(from).matchAll(/[()]|\bWHERE\b/gi)) {
    if (token[0] === '(') {
      depth += 1;
    } else if (token[0] === ')') {
      if (depth === 0) return false;
      depth -= 1;
    } else if (depth === 0) {
      return true;
    }
  }
  return false;
}

function collapse(text) {
  return text.replace(/\s+/g, ' ').trim();
}

function markerNextTo(lines, firstLine) {
  const parse = (match) => ({ reason: match[1], issue: Number(match[2]) });
  const own = markerPattern.exec(lines[firstLine - 1]);
  if (own) return parse(own);
  for (let index = firstLine - 2; index >= 0; index -= 1) {
    const text = lines[index].trim();
    if (!text.startsWith('--') || text.startsWith('-->')) break;
    const above = markerPattern.exec(text);
    if (above) return parse(above);
  }
  return null;
}

/**
 * Finds the destructive statements of one SQL migration. Each finding is
 * `{ kind, line, statement, marker }`, where `statement` is the statement with
 * whitespace collapsed and `marker` is the parsed marker comment next to it
 * or null.
 */
export function findDestructiveStatements(sql) {
  const raw = sql.replaceAll('\r\n', '\n');
  const masked = maskSql(raw);
  const lines = raw.split('\n');
  const statements = statementRanges(masked).map(({ start, end }) => ({
    start,
    code: masked.slice(start, end),
    text: raw.slice(start, end),
  }));
  // A key is replaced when the file adds a constraint of the same name to the
  // same table, whichever comes first.
  const replaced = new Set(
    statements
      .flatMap(({ code, text }) => constraintActions(code, text, addConstraint))
      .map(({ key }) => key)
      .filter((key) => key !== null),
  );
  const findings = [];

  for (const { start, code, text } of statements) {
    const kinds = new Set();
    for (const [kind, pattern] of simpleRules) {
      if (pattern.test(code)) kinds.add(kind);
    }
    if (/^ALTER\s+TABLE\b/i.test(code) && implicitDropColumn.test(code)) {
      kinds.add('drop-column');
    }
    if (deletesEveryRow(code)) kinds.add('delete-all');
    const lostKey = constraintActions(code, text, dropConstraint).some(
      ({ name, key }) =>
        keyConstraintName.test(name) && (key === null || !replaced.has(key)),
    );
    if (lostKey) kinds.add('drop-key');
    if (kinds.size === 0) continue;

    const line = masked.slice(0, start).split('\n').length;
    const marker = markerNextTo(lines, line);
    const statement = collapse(text);
    for (const kind of kinds) findings.push({ kind, line, statement, marker });
  }
  return findings;
}

function failureMessage(name, finding) {
  const shown =
    finding.statement.length > 160
      ? `${finding.statement.slice(0, 157)}...`
      : finding.statement;
  return [
    `${migrationsLabel}/${name}:${finding.line} ${descriptionByKind[finding.kind]} (${finding.kind}):`,
    `    ${shown}`,
    '  Dropping or renaming in one step loses data and breaks consumers (AGENTS.md Code Review Rules, ADR 0002).',
    `  Expand, backfill, contract: ${adviceByKind[finding.kind]}`,
    `  If this really is the safe contract step, put a marker directly above the statement: ${markerSyntax}`,
  ].join('\n');
}

function migrationNumber(name) {
  const match = /^(\d+)_/.exec(name);
  return match ? Number(match[1]) : Number.NaN;
}

/**
 * Checks migrations given as `[{ name, sql }]` against the grandfather list
 * and returns the failure messages, empty when every destructive statement is
 * marked or grandfathered.
 */
export function checkMigrations(
  files,
  grandfathered = grandfatheredDestructiveStatements,
) {
  const failures = [];
  const used = new Set();
  const present = new Set(files.map((file) => file.name));

  for (const entry of grandfathered) {
    if (migrationNumber(entry.file) > lastGrandfatheredMigration) {
      failures.push(
        `Grandfather entry for ${migrationsLabel}/${entry.file} is not allowed: the list is frozen after migration ${String(lastGrandfatheredMigration).padStart(4, '0')}. Remove it and use the marker comment instead: ${markerSyntax}`,
      );
    }
  }

  for (const file of files) {
    for (const finding of findDestructiveStatements(file.sql)) {
      const entry = grandfathered.find(
        (candidate) =>
          candidate.file === file.name &&
          candidate.kind === finding.kind &&
          candidate.statement === finding.statement,
      );
      if (entry) used.add(entry);
      if (!finding.marker && !entry) {
        failures.push(failureMessage(file.name, finding));
      }
    }
  }

  for (const entry of grandfathered) {
    if (used.has(entry)) continue;
    failures.push(
      `Grandfather entry for ${migrationsLabel}/${entry.file} (${entry.kind}) matches no destructive statement${present.has(entry.file) ? '' : ' because the migration does not exist'}: ${entry.statement}. Remove the stale entry from grandfatheredDestructiveStatements in scripts/destructive-migrations.mjs.`,
    );
  }
  return failures;
}

/** Reads every SQL migration of apps/api/drizzle in order. */
export async function readMigrationFiles(directory = migrationsDirectory) {
  const names = (await readdir(directory))
    .filter((name) => name.endsWith('.sql'))
    .sort();
  return Promise.all(
    names.map(async (name) => ({
      name,
      sql: (await readFile(join(directory, name), 'utf8')).replaceAll(
        '\r\n',
        '\n',
      ),
    })),
  );
}
