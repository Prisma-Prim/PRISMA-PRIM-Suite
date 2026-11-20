import assert from 'node:assert/strict';
import test from 'node:test';
import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import {
  BROWSER_SEQUENCE_CASES,
  browserSequenceReplayCommand,
  readBrowserSequenceOptions,
} from './browser-sequences.mjs';

function callsTo(root, name) {
  const calls = [];
  function visit(node) {
    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === name
    )
      calls.push(node);
    ts.forEachChild(node, visit);
  }
  visit(root);
  return calls;
}

test('every generated browser case names its runnable native test and adapter', async () => {
  assert.deepEqual(BROWSER_SEQUENCE_CASES.map(({ id }) => id).sort(), [
    'certification-recommendation',
    'company-context',
    'contract-signing',
    'document-pdf',
    'document-version',
    'invoice-record',
    'mission-task-result',
    'offer-version-owner',
    'operational-risk',
    'payment-evidence',
    'payment-observation',
    'pricing-snapshot-owner',
    'profitability-version-owner',
    'project-task',
    'working-evidence',
    'workspace-access',
  ]);
  const e2e = new URL('../apps/web/e2e/', import.meta.url);
  for (const {
    id,
    journey,
    title,
    fixture,
    adapter,
  } of BROWSER_SEQUENCE_CASES) {
    const specName = `${journey}.acceptance.spec.ts`;
    const [spec, implementation] = await Promise.all([
      readFile(new URL(specName, e2e), 'utf8'),
      readFile(new URL(`${fixture}.ts`, e2e), 'utf8'),
    ]);
    const source = ts.createSourceFile(specName, spec, ts.ScriptTarget.Latest);
    const namedTests = callsTo(source, 'test').filter(
      ({ arguments: [name] }) =>
        name && ts.isStringLiteral(name) && name.text === title,
    );
    assert.equal(
      namedTests.length,
      1,
      `${id} must have one test named ${title}`,
    );
    const callback = namedTests[0].arguments[1];
    assert.ok(callback, `${id} has no test callback`);
    const runners = callsTo(callback, 'runBrowserSequences');
    assert.equal(runners.length, 1, `${id} must run its generated case once`);
    const [options] = runners[0].arguments;
    assert.ok(options && ts.isObjectLiteralExpression(options));
    const adapterOption = options.properties.find(
      (property) =>
        ts.isPropertyAssignment(property) &&
        ts.isIdentifier(property.name) &&
        property.name.text === 'adapter',
    );
    const expression = adapterOption?.initializer;
    const argument =
      expression &&
      ts.isCallExpression(expression) &&
      ts.isIdentifier(expression.expression) &&
      expression.expression.text === 'atNativeLocale' &&
      expression.arguments.length === 1
        ? expression.arguments[0]
        : expression;
    assert.ok(
      argument && ts.isIdentifier(argument) && argument.text === adapter,
      `${id} must run ${adapter} in ${title}; found ${expression?.getText(source)}`,
    );
    const fixtureImport = source.statements.find(
      (statement) =>
        ts.isImportDeclaration(statement) &&
        ts.isStringLiteral(statement.moduleSpecifier) &&
        statement.moduleSpecifier.text === `./${fixture}` &&
        !statement.importClause?.isTypeOnly,
    );
    const bindings = fixtureImport?.importClause?.namedBindings;
    assert.ok(
      bindings &&
        ts.isNamedImports(bindings) &&
        bindings.elements.some(
          ({ isTypeOnly, name, propertyName }) =>
            !isTypeOnly && name.text === adapter && !propertyName,
        ),
      `${id} must import ${adapter} from ${fixture}`,
    );
    assert.match(implementation, new RegExp(`export const ${adapter}\\b`, 'u'));
  }
});

test('validates a Project Task replay only for the native Project Task journey', () => {
  const environment = {
    UI_CHAOS_SEED: '1447001',
    UI_SEQUENCE_REPLAY: 'project-task@narrow~10~0:1',
  };
  assert.equal(
    readBrowserSequenceOptions({
      journey: 'project-task-action-sequences',
      environment,
    }).replay.caseId,
    'project-task',
  );
  assert.throws(
    () =>
      readBrowserSequenceOptions({
        journey: 'document-action-sequences',
        environment,
      }),
    /Unknown sequence case/u,
  );
  assert.equal(
    browserSequenceReplayCommand({
      caseId: 'project-task',
      width: 'narrow',
      seed: 1447001,
      steps: 10,
      path: '0:1',
    }),
    "UI_SEQUENCE_REPLAY='project-task@narrow~10~0:1' pnpm verify:journey project-task-action-sequences --chaos 1447001",
  );
});

test('validates a replay against its actual journey before invoking any harness', () => {
  const script = fileURLToPath(
    new URL('./browser-sequences.mjs', import.meta.url),
  );
  const selection = 'workspace-access@desktop~10~0:1';
  const check = (journey) =>
    spawnSync(process.execPath, [script, 'validate-replay', journey], {
      env: {
        ...process.env,
        UI_CHAOS_SEED: '1422001',
        UI_SEQUENCE_REPLAY: selection,
      },
      encoding: 'utf8',
    });
  const actual = check('access-action-sequences');
  assert.equal(actual.status, 0, actual.stderr);
  assert.equal(actual.stdout, '');
  const wrong = check('financial-action-sequences');
  assert.equal(wrong.status, 2);
  assert.match(wrong.stderr, /Unknown sequence case/u);
  assert.equal(wrong.stdout, '');
  const ungenerated = check('certification-journey');
  assert.equal(ungenerated.status, 2);
  assert.match(ungenerated.stderr, /no generated browser sequence case/u);
  assert.equal(ungenerated.stdout, '');
  assert.equal(
    browserSequenceReplayCommand({
      caseId: 'workspace-access',
      width: 'desktop',
      seed: 1422001,
      steps: 10,
      path: '0:1',
    }),
    "UI_SEQUENCE_REPLAY='workspace-access@desktop~10~0:1' pnpm verify:journey access-action-sequences --chaos 1422001",
  );
});

test('refuses a replay for an unknown adapter before running a browser', () => {
  assert.throws(
    () =>
      readBrowserSequenceOptions({
        journey: 'financial-action-sequences',
        environment: {
          UI_CHAOS_SEED: '1422001',
          UI_SEQUENCE_REPLAY: 'invented@desktop~8~0:1',
        },
      }),
    /Unknown sequence case.*payment-observation.*invoice-record/u,
  );
});

test('validates each Document replay only against its own journey', () => {
  const script = fileURLToPath(
    new URL('./browser-sequences.mjs', import.meta.url),
  );
  for (const selection of [
    'document-version@desktop~10~0:1',
    'document-pdf@narrow~10~0:1',
    'payment-evidence@desktop~10~0:1',
    'payment-evidence@narrow~10~0:1',
  ]) {
    const command = (journey) =>
      spawnSync(process.execPath, [script, 'validate-replay', journey], {
        env: {
          ...process.env,
          UI_CHAOS_SEED: '1427001',
          UI_SEQUENCE_REPLAY: selection,
        },
        encoding: 'utf8',
      });
    const own = command('document-action-sequences');
    assert.equal(own.status, 0, own.stderr);
    assert.equal(own.stdout, '');
    const access = command('access-action-sequences');
    assert.equal(access.status, 2);
    assert.match(access.stderr, /Unknown sequence case/u);
  }
});

test('replays the retained case, width, sequence bound and reduction path with its original seed', () => {
  const options = readBrowserSequenceOptions({
    journey: 'financial-action-sequences',
    environment: {
      UI_CHAOS_SEED: '1422001',
      UI_SEQUENCE_REPLAY: 'payment-observation@narrow~8~2:1:0',
    },
  });
  assert.equal(options.seed, 1422001);
  assert.equal(options.steps, 8);
  assert.equal(options.runs, 1);
  assert.deepEqual(options.replay, {
    caseId: 'payment-observation',
    width: 'narrow',
    path: '2:1:0',
  });
});

test('refuses an extra viewport selector rather than silently replaying a different case', () => {
  assert.throws(
    () =>
      readBrowserSequenceOptions({
        journey: 'financial-action-sequences',
        environment: {
          UI_CHAOS_SEED: '1422001',
          UI_SEQUENCE_REPLAY: 'payment-observation@desktop@surprise~8~2:1:0',
        },
      }),
    /UI_SEQUENCE_REPLAY must/u,
  );
});

test('prints the exact command that selects the failing adapter and viewport', () => {
  assert.equal(
    browserSequenceReplayCommand({
      caseId: 'payment-observation',
      width: 'narrow',
      seed: 1422001,
      steps: 8,
      path: '2:1:0',
    }),
    "UI_SEQUENCE_REPLAY='payment-observation@narrow~8~2:1:0' pnpm verify:journey financial-action-sequences --chaos 1422001",
  );
});

test('keeps bounded generated coverage and rebuilds exact replay without publishing raw trials', async () => {
  const { parseBrowserSequenceEvidence } =
    await import('./browser-sequences.mjs');
  const evidence = parseBrowserSequenceEvidence({
    schema: 'prisma-prim-browser-sequences/v1',
    caseId: 'payment-observation',
    journey: 'financial-action-sequences',
    width: 'narrow',
    seed: 1422001,
    steps: 10,
    status: 'failed',
    runs: 1,
    shrinks: 3,
    durationMilliseconds: 4500,
    path: '0:2:1',
    coverage: { 'locale:fr': 2 },
    replay: 'untrusted command',
    trials: [{ private: 'raw trace' }],
  });
  assert.deepEqual(evidence, {
    caseId: 'payment-observation',
    width: 'narrow',
    seed: 1422001,
    steps: 10,
    status: 'failed',
    runs: 1,
    shrinks: 3,
    durationMilliseconds: 4500,
    path: '0:2:1',
    coverage: { 'locale:fr': 2 },
    replay:
      "UI_SEQUENCE_REPLAY='payment-observation@narrow~10~0:2:1' pnpm verify:journey financial-action-sequences --chaos 1422001",
  });
});

test('refuses empty successful generated proof and malformed coverage or replay metadata', async () => {
  const { parseBrowserSequenceEvidence } =
    await import('./browser-sequences.mjs');
  const valid = {
    schema: 'prisma-prim-browser-sequences/v1',
    caseId: 'invoice-record',
    journey: 'financial-action-sequences',
    width: 'desktop',
    seed: 1422001,
    steps: 10,
    status: 'passed',
    runs: 2,
    shrinks: 0,
    durationMilliseconds: 100,
    path: null,
    coverage: { 'start-literal-invoice': 1 },
  };
  assert.equal(parseBrowserSequenceEvidence({ ...valid, coverage: {} }), null);
  assert.equal(parseBrowserSequenceEvidence({ ...valid, runs: 0 }), null);
  assert.equal(
    parseBrowserSequenceEvidence({ ...valid, path: '0;echo injected' }),
    null,
  );
  assert.equal(
    parseBrowserSequenceEvidence({ ...valid, caseId: 'unimplemented' }),
    null,
  );
  assert.equal(
    parseBrowserSequenceEvidence({ ...valid, coverage: { write: -1 } }),
    null,
  );
  assert.equal(
    parseBrowserSequenceEvidence({ ...valid, coverage: { '@owner': 1 } }),
    null,
  );
  assert.equal(
    parseBrowserSequenceEvidence({ ...valid, durationMilliseconds: -1 }),
    null,
  );
  assert.equal(
    parseBrowserSequenceEvidence({
      ...valid,
      status: 'interrupted',
      coverage: {},
      runs: 0,
    }).status,
    'interrupted',
  );
});

test('validates each native Contract replay against its own journey', () => {
  for (const width of ['desktop', 'narrow']) {
    const selection = `contract-signing@${width}~6~0:2`;
    const environment = { UI_CHAOS_SEED: '57', UI_SEQUENCE_REPLAY: selection };
    assert.deepEqual(
      readBrowserSequenceOptions({
        journey: 'contract-action-sequences',
        environment,
      }).replay,
      { caseId: 'contract-signing', width, path: '0:2' },
    );
    for (const journey of [
      'financial-action-sequences',
      'access-action-sequences',
      'document-action-sequences',
    ])
      assert.throws(
        () => readBrowserSequenceOptions({ journey, environment }),
        /Unknown sequence case/u,
      );
    assert.equal(
      browserSequenceReplayCommand({
        caseId: 'contract-signing',
        width,
        seed: 57,
        steps: 6,
        path: '0:2',
      }),
      `UI_SEQUENCE_REPLAY='${selection}' pnpm verify:journey contract-action-sequences --chaos 57`,
    );
  }
});

test('selects the native mission result replay only in its registered journey', () => {
  const command = browserSequenceReplayCommand({
    caseId: 'mission-task-result',
    width: 'narrow',
    seed: 1461001,
    steps: 10,
    path: '0:1',
  });
  assert.equal(
    command,
    "UI_SEQUENCE_REPLAY='mission-task-result@narrow~10~0:1' pnpm verify:journey mission-result-action-sequences --chaos 1461001",
  );
  const environment = {
    UI_CHAOS_SEED: '1461001',
    UI_SEQUENCE_REPLAY: 'mission-task-result@narrow~10~0:1',
  };
  assert.equal(
    readBrowserSequenceOptions({
      journey: 'mission-result-action-sequences',
      environment,
    }).replay.caseId,
    'mission-task-result',
  );
  assert.throws(
    () =>
      readBrowserSequenceOptions({
        journey: 'financial-action-sequences',
        environment,
      }),
    /Unknown sequence case/u,
  );
});

test('selects the native Offer version replay only in its registered journey', () => {
  const command = browserSequenceReplayCommand({
    caseId: 'offer-version-owner',
    width: 'narrow',
    seed: 1462001,
    steps: 10,
    path: '0:1',
  });
  assert.equal(
    command,
    "UI_SEQUENCE_REPLAY='offer-version-owner@narrow~10~0:1' pnpm verify:journey offer-owner-action-sequences --chaos 1462001",
  );
  const environment = {
    UI_CHAOS_SEED: '1462001',
    UI_SEQUENCE_REPLAY: 'offer-version-owner@narrow~10~0:1',
  };
  assert.equal(
    readBrowserSequenceOptions({
      journey: 'offer-owner-action-sequences',
      environment,
    }).replay.caseId,
    'offer-version-owner',
  );
  assert.throws(
    () =>
      readBrowserSequenceOptions({
        journey: 'financial-action-sequences',
        environment,
      }),
    /Unknown sequence case/u,
  );
});

test('selects the native pricing replay only in its registered journey', () => {
  const command = browserSequenceReplayCommand({
    caseId: 'pricing-snapshot-owner',
    width: 'narrow',
    seed: 1463001,
    steps: 10,
    path: '0:1',
  });
  assert.equal(
    command,
    "UI_SEQUENCE_REPLAY='pricing-snapshot-owner@narrow~10~0:1' pnpm verify:journey pricing-owner-action-sequences --chaos 1463001",
  );
  const environment = {
    UI_CHAOS_SEED: '1463001',
    UI_SEQUENCE_REPLAY: 'pricing-snapshot-owner@narrow~10~0:1',
  };
  assert.equal(
    readBrowserSequenceOptions({
      journey: 'pricing-owner-action-sequences',
      environment,
    }).replay.caseId,
    'pricing-snapshot-owner',
  );
  assert.throws(
    () =>
      readBrowserSequenceOptions({
        journey: 'financial-action-sequences',
        environment,
      }),
    /Unknown sequence case/u,
  );
});

test('selects the native profitability replay only in its registered journey', () => {
  const command = browserSequenceReplayCommand({
    caseId: 'profitability-version-owner',
    width: 'narrow',
    seed: 1464001,
    steps: 10,
    path: '0:1',
  });
  assert.equal(
    command,
    "UI_SEQUENCE_REPLAY='profitability-version-owner@narrow~10~0:1' pnpm verify:journey profitability-owner-action-sequences --chaos 1464001",
  );
  const environment = {
    UI_CHAOS_SEED: '1464001',
    UI_SEQUENCE_REPLAY: 'profitability-version-owner@narrow~10~0:1',
  };
  assert.equal(
    readBrowserSequenceOptions({
      journey: 'profitability-owner-action-sequences',
      environment,
    }).replay.caseId,
    'profitability-version-owner',
  );
  assert.throws(
    () =>
      readBrowserSequenceOptions({
        journey: 'financial-action-sequences',
        environment,
      }),
    /Unknown sequence case/u,
  );
});
