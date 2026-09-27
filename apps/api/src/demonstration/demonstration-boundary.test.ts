import { readFile } from 'node:fs/promises';
import { dirname, join, normalize, relative } from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

const SOURCE_ROOT = normalize('./src');

/** Relative TypeScript modules reachable from one entry, as source paths. */
async function importGraph(entry: string): Promise<Set<string>> {
  const visited = new Set<string>();
  const pending = [normalize(entry)];
  for (let file = pending.pop(); file !== undefined; file = pending.pop()) {
    if (visited.has(file)) continue;
    visited.add(file);
    for (const specifier of moduleSpecifiers(
      file,
      await readFile(file, 'utf8'),
    )) {
      if (!specifier.startsWith('.')) continue;
      pending.push(
        normalize(join(dirname(file), specifier.replace(/\.js$/u, '.ts'))),
      );
    }
  }
  return visited;
}

function moduleSpecifiers(fileName: string, source: string): string[] {
  const sourceFile = ts.createSourceFile(
    fileName,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
  return sourceFile.statements.flatMap((statement) =>
    (ts.isImportDeclaration(statement) || ts.isExportDeclaration(statement)) &&
    statement.moduleSpecifier &&
    ts.isStringLiteral(statement.moduleSpecifier)
      ? [statement.moduleSpecifier.text]
      : [],
  );
}

function sourcePaths(files: Set<string>): string[] {
  return [...files].map((file) =>
    relative(SOURCE_ROOT, file).split('\\').join('/'),
  );
}

describe('demonstration module boundary', () => {
  it('stays outside the served application import graph', async () => {
    const served = sourcePaths(await importGraph('./src/main.ts'));
    expect(served).toContain('app.module.ts');
    expect(served.filter((path) => path.startsWith('demonstration/'))).toEqual(
      [],
    );
  });

  it('keeps the scenario and runner a pure client of the public API', async () => {
    const files = await importGraph(
      './src/demonstration/demonstration-runner.ts',
    );
    // Only constant and type vocabularies of the owning modules; no service,
    // database, driver or framework module.
    expect(sourcePaths(files).sort()).toEqual([
      'access/company-permissions.ts',
      'client/client.types.ts',
      'demonstration/demonstration-runner.ts',
      'demonstration/demonstration-scenario.ts',
      'task/task.types.ts',
    ]);
    for (const file of files)
      expect(
        moduleSpecifiers(file, await readFile(file, 'utf8')).filter(
          (specifier) => !specifier.startsWith('.'),
        ),
      ).toEqual([]);
  });
});
