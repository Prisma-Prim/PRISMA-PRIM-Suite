import { readFile } from 'node:fs/promises';
/** Exact current public table set from the final committed Drizzle snapshot. */
export async function committedMigrationTables(
  entries: readonly Record<string, unknown>[],
): Promise<string[]> {
  const tag = entries.at(-1)?.tag;
  if (typeof tag !== 'string' || !/^\d{4}_[a-z0-9_]+$/u.test(tag))
    throw new Error('The final committed migration is required.');
  const parsed: unknown = JSON.parse(
    await readFile(
      'drizzle/meta/' + tag.slice(0, 4) + '_snapshot.json',
      'utf8',
    ),
  );
  if (
    !parsed ||
    typeof parsed !== 'object' ||
    !('tables' in parsed) ||
    !parsed.tables ||
    typeof parsed.tables !== 'object' ||
    Array.isArray(parsed.tables)
  )
    throw new Error('The committed schema tables are required.');
  const tables: string[] = [];
  for (const [key, value] of Object.entries(parsed.tables)) {
    if (
      !value ||
      typeof value !== 'object' ||
      !('name' in value) ||
      typeof value.name !== 'string' ||
      !/^[a-z_]+$/u.test(value.name) ||
      key !== 'public.' + value.name
    )
      throw new Error('Unexpected committed table definition.');
    tables.push(value.name);
  }
  if (!tables.length || new Set(tables).size !== tables.length)
    throw new Error('The complete committed schema is required.');
  return tables.sort();
}
