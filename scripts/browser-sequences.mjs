import { parseChaosSeed } from './ui-chaos.mjs';
import { pathToFileURL } from 'node:url';

export const BROWSER_SEQUENCE_CASES = [
  {
    id: 'payment-observation',
    journey: 'financial-action-sequences',
    title: 'explores generated native Payment action sequences',
  },
  {
    id: 'invoice-record',
    journey: 'financial-action-sequences',
    title: 'explores generated native Invoice Record action sequences',
  },
  {
    id: 'workspace-access',
    journey: 'access-action-sequences',
    title: 'explores generated native Workspace Access action sequences',
  },
  {
    id: 'company-context',
    journey: 'access-action-sequences',
    title: 'explores generated native Company context action sequences',
  },
  {
    id: 'document-version',
    journey: 'document-action-sequences',
    title: 'explores generated native Document Version action sequences',
  },
  {
    id: 'document-pdf',
    journey: 'document-action-sequences',
    title: 'explores generated native Document PDF action sequences',
  },
  {
    id: 'payment-evidence',
    journey: 'document-action-sequences',
    title: 'explores generated native PaymentEvidence source action sequences',
  },
  {
    id: 'contract-signing',
    journey: 'contract-action-sequences',
    title: 'explores generated native Contract signing action sequences',
  },
  {
    id: 'profitability-version-owner',
    journey: 'profitability-owner-action-sequences',
    title: 'explores generated native profitability owner sequences',
  },
  {
    id: 'pricing-snapshot-owner',
    journey: 'pricing-owner-action-sequences',
    title: 'explores generated native pricing owner sequences',
  },
];

export function readBrowserSequenceOptions({ journey, environment }) {
  const requestedReplay = environment.UI_SEQUENCE_REPLAY;
  const available = BROWSER_SEQUENCE_CASES.filter(
    (entry) => entry.journey === journey,
  );
  const id = requestedReplay?.split('@')[0];
  if (requestedReplay && available.length === 0)
    throw new Error(
      'This journey has no generated browser sequence case. Select the journey named by the retained replay command.',
    );
  if (requestedReplay && !available.some((entry) => entry.id === id))
    throw new Error(
      `Unknown sequence case. Available: ${available.map((entry) => entry.id).join(', ')}.`,
    );
  const seed =
    environment.UI_CHAOS_SEED === undefined
      ? 1422001
      : parseChaosSeed(environment.UI_CHAOS_SEED);
  if (seed === null)
    throw new Error(
      'UI_CHAOS_SEED must be the numeric seed printed by verify:journey.',
    );
  let steps = positive(
    'UI_SEQUENCE_STEPS',
    environment.UI_SEQUENCE_STEPS,
    10,
    24,
  );
  let replay = null;
  if (requestedReplay !== undefined) {
    if (environment.UI_CHAOS_SEED === undefined)
      throw new Error(
        `UI_SEQUENCE_REPLAY requires the original seed: pnpm verify:journey ${journey} --chaos 1422001`,
      );
    const parts = requestedReplay.split('~');
    const [selection, bound, path] = parts;
    const selected = (selection ?? '').split('@');
    const [caseId, width] = selected;
    if (
      parts.length !== 3 ||
      selected.length !== 2 ||
      !['desktop', 'narrow'].includes(width) ||
      typeof path !== 'string' ||
      path.length > 2048 ||
      !/^\d+(?::\d+)*$/u.test(path)
    )
      throw new Error(
        'UI_SEQUENCE_REPLAY must be <case>@desktop|narrow~<steps>~<path>, copied from a failure.',
      );
    const retainedSteps = positive('replay steps', bound, 0, 24);
    if (environment.UI_SEQUENCE_STEPS !== undefined && steps !== retainedSteps)
      throw new Error('UI_SEQUENCE_REPLAY already fixes UI_SEQUENCE_STEPS.');
    steps = retainedSteps;
    replay = { caseId, width, path };
  }
  return {
    seed,
    steps,
    replay,
    runs: replay
      ? 1
      : positive('UI_SEQUENCE_RUNS', environment.UI_SEQUENCE_RUNS, 2, 20),
    budgetMilliseconds: positive(
      'UI_SEQUENCE_BUDGET_MS',
      environment.UI_SEQUENCE_BUDGET_MS,
      replay ? 120_000 : 60_000,
      120_000,
    ),
  };
}

function positive(name, value, fallback, maximum) {
  if (value === undefined) return fallback;
  if (!/^[1-9]\d*$/u.test(value) || Number(value) > maximum)
    throw new Error(`${name} must be a whole number from 1 to ${maximum}.`);
  return Number(value);
}

export function browserSequenceReplayCommand({
  caseId,
  width,
  seed,
  steps,
  path,
}) {
  const entry = BROWSER_SEQUENCE_CASES.find(
    (candidate) => candidate.id === caseId,
  );
  if (!entry) throw new Error(`Unknown sequence case: ${caseId}.`);
  const selection = `${caseId}@${width}~${steps}~${path}`;
  readBrowserSequenceOptions({
    journey: entry.journey,
    environment: {
      UI_CHAOS_SEED: String(seed),
      UI_SEQUENCE_REPLAY: selection,
    },
  });
  return `UI_SEQUENCE_REPLAY='${selection}' pnpm verify:journey ${entry.journey} --chaos ${seed}`;
}

/** Publish only measured coverage and replay coordinates; raw traces stay in artifacts. */
export function parseBrowserSequenceEvidence(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const entry = BROWSER_SEQUENCE_CASES.find(
    (candidate) => candidate.id === value.caseId,
  );
  const count = (number) => Number.isSafeInteger(number) && number >= 0;
  if (
    !entry ||
    value.schema !== 'prisma-prim-browser-sequences/v1' ||
    value.journey !== entry.journey ||
    !['desktop', 'narrow'].includes(value.width) ||
    !Number.isInteger(value.seed) ||
    value.seed < 1 ||
    value.seed > 2147483647 ||
    !Number.isInteger(value.steps) ||
    value.steps < 1 ||
    value.steps > 24 ||
    !['passed', 'failed', 'interrupted'].includes(value.status) ||
    !count(value.runs) ||
    !count(value.shrinks) ||
    !count(value.durationMilliseconds) ||
    !(
      value.path === null ||
      (typeof value.path === 'string' &&
        value.path.length <= 2048 &&
        /^\d+(?::\d+)*$/u.test(value.path))
    ) ||
    !value.coverage ||
    typeof value.coverage !== 'object' ||
    Array.isArray(value.coverage) ||
    !Object.entries(value.coverage).every(
      ([label, total]) =>
        /^[a-z][a-z0-9:-]{0,100}$/u.test(label) && count(total),
    )
  )
    return null;
  const actions = Object.values(value.coverage).reduce(
    (total, count) => total + count,
    0,
  );
  if (
    !Number.isSafeInteger(actions) ||
    (value.status === 'passed' && (value.runs === 0 || actions === 0))
  )
    return null;
  return {
    caseId: value.caseId,
    width: value.width,
    seed: value.seed,
    steps: value.steps,
    status: value.status,
    runs: value.runs,
    shrinks: value.shrinks,
    durationMilliseconds: value.durationMilliseconds,
    path: value.path,
    coverage: { ...value.coverage },
    replay:
      value.path === null
        ? null
        : browserSequenceReplayCommand({
            caseId: value.caseId,
            width: value.width,
            seed: value.seed,
            steps: value.steps,
            path: value.path,
          }),
  };
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const [action, journey, ...extra] = process.argv.slice(2);
  const usage =
    'Usage: node scripts/browser-sequences.mjs validate-replay <journey>\nRequires UI_CHAOS_SEED and UI_SEQUENCE_REPLAY copied from a failure. Valid configuration exits 0 without output; invalid configuration exits 2 before any browser/database work.\nExample: UI_CHAOS_SEED=1422001 UI_SEQUENCE_REPLAY=workspace-access@desktop~10~0:1 node scripts/browser-sequences.mjs validate-replay access-action-sequences';
  if (action === '--help' && journey === undefined)
    process.stdout.write(usage + '\n');
  else {
    try {
      if (
        action !== 'validate-replay' ||
        !journey ||
        extra.length ||
        !process.env.UI_SEQUENCE_REPLAY
      )
        throw new Error(usage);
      readBrowserSequenceOptions({ journey, environment: process.env });
    } catch (error) {
      process.stderr.write(
        (error instanceof Error
          ? error.message
          : 'Invalid browser-sequence replay.') + '\n',
      );
      process.exitCode = 2;
    }
  }
}
