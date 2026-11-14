// @vitest-environment node

import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import { LEGACY_COMPANY_GRANT_READS } from './legacy-company-grant-reads.allowlist';

// #1148 stage 4b (#1333): the web reads every live Company grant through
// grantOf and holds of ./company-grants. This guard type-checks apps/web/src
// and counts, per file, the reads of a legacy per-bundle field of the active
// Company context: every activeCompany field of ./current-actor except `id`,
// `displayName`, `grants` and the `*Capture` feature fences. A read is a
// property access, a string element access or a destructuring whose property
// resolves to that field, also through `Pick` and similar derived types.
// Writing the field in a fixture is not a read.
//
// The allowlist records the files not migrated yet. It may only shrink: a new
// read fails, and so does a stale count, so each migration lowers it.

const webRoot = fileURLToPath(new URL('../../', import.meta.url));
const actorFile = fileURLToPath(new URL('./current-actor.ts', import.meta.url));
const allowlistFile =
  'apps/web/src/access/legacy-company-grant-reads.allowlist.ts';

interface LegacyRead {
  file: string;
  line: number;
  field: string;
}

function normalized(file: string): string {
  return file.replaceAll('\\', '/');
}

function webProgram(extraFiles: ReadonlyMap<string, string> = new Map()) {
  const config = ts.getParsedCommandLineOfConfigFile(
    `${webRoot}tsconfig.app.json`,
    {},
    {
      ...ts.sys,
      onUnRecoverableConfigFileDiagnostic: (diagnostic) => {
        throw new Error(
          ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'),
        );
      },
    },
  );
  if (config === undefined) throw new Error('tsconfig.app.json is unreadable.');
  const host = ts.createCompilerHost(config.options);
  const extra = new Map(
    [...extraFiles].map(([file, text]) => [normalized(file), text]),
  );
  const readFile = host.readFile.bind(host);
  const fileExists = host.fileExists.bind(host);
  host.readFile = (file) => extra.get(normalized(file)) ?? readFile(file);
  host.fileExists = (file) => extra.has(normalized(file)) || fileExists(file);
  return ts.createProgram({
    rootNames:
      extra.size === 0
        ? config.fileNames
        : [normalized(actorFile), ...extra.keys()],
    options: config.options,
    host,
  });
}

/** Every read of a legacy per-bundle field of the active Company context. */
function legacyReads(program: ts.Program): LegacyRead[] {
  const checker = program.getTypeChecker();
  const actorSource = program.getSourceFile(normalized(actorFile));
  const actorAlias = actorSource?.statements.find(
    (statement): statement is ts.TypeAliasDeclaration =>
      ts.isTypeAliasDeclaration(statement) &&
      statement.name.text === 'ActorContext',
  );
  if (actorSource === undefined || actorAlias === undefined)
    throw new Error(
      'ActorContext is no longer a type alias of apps/web/src/access/current-actor.ts; update this guard.',
    );
  const activeCompanySymbol = checker
    .getTypeAtLocation(actorAlias.name)
    .getProperty('activeCompany');
  if (activeCompanySymbol === undefined)
    throw new Error('ActorContext has no activeCompany; update this guard.');
  const activeCompany = checker.getNonNullableType(
    checker.getTypeOfSymbol(activeCompanySymbol),
  );
  const legacyRoots = new Map<ts.Symbol, string>();
  for (const property of activeCompany.getProperties()) {
    const name = property.getName();
    if (
      ['id', 'displayName', 'grants'].includes(name) ||
      name.endsWith('Capture')
    )
      continue;
    for (const root of checker.getRootSymbols(property))
      legacyRoots.set(root, name);
  }
  if (legacyRoots.size === 0)
    throw new Error('No legacy field is left: delete this guard (#1334).');

  const reads: LegacyRead[] = [];
  for (const source of program.getSourceFiles()) {
    const file = normalized(source.fileName);
    if (
      source.isDeclarationFile ||
      !file.startsWith(`${normalized(webRoot)}src/`) ||
      file === normalized(actorFile)
    )
      continue;
    const visit = (node: ts.Node): void => {
      const symbol = readSymbol(checker, node);
      const field =
        symbol === undefined
          ? undefined
          : checker
              .getRootSymbols(symbol)
              .map((root) => legacyRoots.get(root))
              .find((name) => name !== undefined);
      if (field !== undefined)
        reads.push({
          file: `apps/web/${file.slice(normalized(webRoot).length)}`,
          line:
            source.getLineAndCharacterOfPosition(node.getStart(source)).line +
            1,
          field,
        });
      ts.forEachChild(node, visit);
    };
    visit(source);
  }
  return reads;
}

function readSymbol(
  checker: ts.TypeChecker,
  node: ts.Node,
): ts.Symbol | undefined {
  if (ts.isPropertyAccessExpression(node))
    return checker.getSymbolAtLocation(node.name);
  if (
    ts.isElementAccessExpression(node) &&
    ts.isStringLiteralLike(node.argumentExpression)
  )
    return checker.getSymbolAtLocation(node.argumentExpression);
  if (ts.isBindingElement(node) && ts.isObjectBindingPattern(node.parent)) {
    const name = node.propertyName ?? node.name;
    if (!ts.isIdentifier(name) && !ts.isStringLiteralLike(name))
      return undefined;
    return checker
      .getNonNullableType(checker.getTypeAtLocation(node.parent))
      .getProperty(name.text);
  }
  return undefined;
}

/** What to change so the allowlist matches the reads, as fixes. */
function allowlistDivergences(
  reads: readonly LegacyRead[],
  allowlist: Readonly<Record<string, number>>,
): string[] {
  const counts = new Map<string, LegacyRead[]>();
  for (const read of reads)
    counts.set(read.file, [...(counts.get(read.file) ?? []), read]);
  const problems: string[] = [];
  for (const [file, fileReads] of counts) {
    const allowed = Object.hasOwn(allowlist, file) ? allowlist[file] : 0;
    if (allowed !== undefined && fileReads.length > allowed)
      problems.push(
        `${file} reads legacy Company grant fields ${fileReads.length} times (allowed ${allowed}): ${fileReads
          .map((read) => `${read.field} (line ${read.line})`)
          .join(
            ', ',
          )}. Read the grant through grantOf or holds of apps/web/src/access/company-grants.ts instead.`,
      );
    else if (allowed !== undefined && fileReads.length < allowed)
      problems.push(
        `${file} now reads legacy Company grant fields ${fileReads.length} times: lower its entry in ${allowlistFile} from ${allowed} to ${fileReads.length}.`,
      );
  }
  for (const file of Object.keys(allowlist))
    if (!counts.has(file))
      problems.push(
        `${file} no longer reads legacy Company grant fields: remove its entry from ${allowlistFile}.`,
      );
  return problems;
}

const probeFile = `${normalized(webRoot)}src/legacy-company-grant-read-probe.ts`;
const probe = `import type { ActorContext } from './access/current-actor';
type Company = NonNullable<ActorContext['activeCompany']>;
export function probe(actor: ActorContext, company: Company) {
  const { taskPermissions } = company;
  const picked: Pick<Company, 'clientPermissions'> = company;
  return [
    actor.activeCompany?.ideasReaderPermissions,
    company['projectPermissions'],
    taskPermissions,
    picked.clientPermissions,
    company.id,
    company.displayName,
    company.grants,
    company.paymentObservationReadCapture,
    { ideasReaderPermissions: ['idea.read'] }.ideasReaderPermissions,
  ];
}
`;

describe('legacy Company grant reads on the web', () => {
  it('finds every form of a reintroduced read and nothing else', () => {
    const reads = legacyReads(webProgram(new Map([[probeFile, probe]])));
    expect(reads).toEqual([
      {
        file: 'apps/web/src/legacy-company-grant-read-probe.ts',
        line: 4,
        field: 'taskPermissions',
      },
      {
        file: 'apps/web/src/legacy-company-grant-read-probe.ts',
        line: 7,
        field: 'ideasReaderPermissions',
      },
      {
        file: 'apps/web/src/legacy-company-grant-read-probe.ts',
        line: 8,
        field: 'projectPermissions',
      },
      {
        file: 'apps/web/src/legacy-company-grant-read-probe.ts',
        line: 10,
        field: 'clientPermissions',
      },
    ]);
    expect(allowlistDivergences(reads, {})).toEqual([
      'apps/web/src/legacy-company-grant-read-probe.ts reads legacy Company grant fields 4 times (allowed 0): taskPermissions (line 4), ideasReaderPermissions (line 7), projectPermissions (line 8), clientPermissions (line 10). Read the grant through grantOf or holds of apps/web/src/access/company-grants.ts instead.',
    ]);
  });

  it('asks to lower or remove a stale allowlist entry', () => {
    const read = {
      file: 'apps/web/src/a.ts',
      line: 1,
      field: 'taskPermissions',
    };
    expect(
      allowlistDivergences([read], {
        'apps/web/src/a.ts': 2,
        'apps/web/src/b.ts': 1,
      }),
    ).toEqual([
      `apps/web/src/a.ts now reads legacy Company grant fields 1 times: lower its entry in ${allowlistFile} from 2 to 1.`,
      `apps/web/src/b.ts no longer reads legacy Company grant fields: remove its entry from ${allowlistFile}.`,
    ]);
  });

  it('reads them only in the files the allowlist still records', () => {
    expect(
      allowlistDivergences(
        legacyReads(webProgram()),
        LEGACY_COMPANY_GRANT_READS,
      ),
    ).toEqual([]);
  }, 180_000);
});
