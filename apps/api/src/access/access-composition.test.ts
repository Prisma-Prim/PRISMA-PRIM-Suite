import { readdir, readFile } from 'node:fs/promises';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

describe('Access composition boundaries', () => {
  it('allows Company dependencies only at the explicit composition root', async () => {
    const accessFiles = (await readdir('./src/access')).filter(
      (name) => name.endsWith('.ts') && !name.endsWith('.test.ts'),
    );
    const accessImports = await Promise.all(
      accessFiles.map(async (name) => ({
        name,
        imports: importedModules(
          name,
          await readFile(`./src/access/${name}`, 'utf8'),
        ),
      })),
    );

    expect(
      accessImports.flatMap(({ name, imports }) =>
        imports
          .filter((specifier) => specifier.startsWith('../company/'))
          .map((specifier) => ({ name, specifier })),
      ),
    ).toEqual([]);

    const wrapperFiles = (
      await Promise.all(
        ['access', 'company', 'accountability'].map((directory) =>
          readdir(`./src/${directory}`),
        ),
      )
    )
      .flat()
      .filter((name) => name.includes('composition.module'));
    expect(wrapperFiles).toEqual([]);

    const compositionImports = importedModules(
      'application-composition.module.ts',
      await readFile('./src/application-composition.module.ts', 'utf8'),
    );
    expect(compositionImports).toEqual(
      expect.arrayContaining([
        './access/access.module.js',
        './accountability/accountability.module.js',
        './company/company.module.js',
        './database/database.module.js',
      ]),
    );
  });
});

function importedModules(fileName: string, source: string): string[] {
  const sourceFile = ts.createSourceFile(
    fileName,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
  return sourceFile.statements.flatMap((statement) =>
    ts.isImportDeclaration(statement) &&
    ts.isStringLiteral(statement.moduleSpecifier)
      ? [statement.moduleSpecifier.text]
      : [],
  );
}
