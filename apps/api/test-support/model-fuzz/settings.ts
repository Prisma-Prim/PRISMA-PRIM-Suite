import { randomInt } from 'node:crypto';

const SMOKE_RUNS = 2;
const SMOKE_STEPS = 12;
/** A sized run ends cleanly before the nightly job's 30-minute timeout. */
const SIZED_TIME_LIMIT_MS = 20 * 60_000;
const SMOKE_TIME_LIMIT_MS = 2 * 60_000;

export interface FuzzSettings {
  seed: number;
  /** A failure to replay instead of new runs. */
  replay: { path: string; commands: string } | undefined;
  runs: number;
  steps: number;
  timeLimitMs: number;
  /** Where a failure's JSON report goes (the nightly workflow sets it). */
  reportFile: string | undefined;
}

const SEED_ERROR = 'FUZZ_SEED must be a 32-bit integer or "random".';
const PATH_ERROR = 'FUZZ_PATH must be the value a failure printed.';

function positive(name: string, value: string | undefined, fallback: number) {
  if (value === undefined || value === '') return fallback;
  if (!/^[1-9][0-9]{0,5}$/u.test(value))
    throw new Error(`${name} must be a positive integer below 1000000.`);
  return Number(value);
}

/**
 * Reads FUZZ_SEED (an integer, or `random`; the module's fixed smoke seed by
 * default), FUZZ_PATH, FUZZ_RUNS, FUZZ_STEPS and FUZZ_REPORT. Invalid values
 * fail closed. FUZZ_PATH is `<steps>~<path>~<commands>`: the sequence bound,
 * fast-check's counterexample path and its commands replay hint, so that
 * FUZZ_SEED and FUZZ_PATH alone regenerate the failing sequence.
 */
export function readFuzzSettings(
  environment: Record<string, string | undefined>,
  smoke: { seed: number },
): FuzzSettings {
  const seedValue = environment.FUZZ_SEED ?? '';
  let seed: number;
  if (seedValue === '') seed = smoke.seed;
  else if (seedValue === 'random') seed = randomInt(1, 2 ** 31);
  else if (/^-?[0-9]{1,10}$/u.test(seedValue)) {
    seed = Number(seedValue);
    if (seed < -(2 ** 31) || seed >= 2 ** 31) throw new Error(SEED_ERROR);
  } else throw new Error(SEED_ERROR);

  let steps = positive('FUZZ_STEPS', environment.FUZZ_STEPS, SMOKE_STEPS);
  let replay: FuzzSettings['replay'];
  const pathValue = environment.FUZZ_PATH ?? '';
  if (pathValue !== '') {
    const parts = pathValue.split('~');
    const [bound, path, commands] = parts;
    if (
      parts.length !== 3 ||
      bound === undefined ||
      path === undefined ||
      commands === undefined ||
      !/^[1-9][0-9]{0,5}$/u.test(bound) ||
      !/^[0-9]+(?::[0-9]+)*$/u.test(path) ||
      !/^(?:[A-Za-z0-9+/]*:[A-Za-z0-9+/]*)?$/u.test(commands)
    )
      throw new Error(PATH_ERROR);
    if (seedValue === '' || seedValue === 'random')
      throw new Error(
        'FUZZ_PATH replays only with the FUZZ_SEED that found it.',
      );
    if ((environment.FUZZ_STEPS ?? '') !== '' && steps !== Number(bound))
      throw new Error('FUZZ_PATH already fixes FUZZ_STEPS.');
    steps = Number(bound);
    replay = { path, commands };
  }

  const sized =
    (environment.FUZZ_RUNS ?? '') !== '' ||
    (environment.FUZZ_STEPS ?? '') !== '';
  const reportFile = environment.FUZZ_REPORT;
  return {
    seed,
    replay,
    runs: positive('FUZZ_RUNS', environment.FUZZ_RUNS, SMOKE_RUNS),
    steps,
    timeLimitMs: sized ? SIZED_TIME_LIMIT_MS : SMOKE_TIME_LIMIT_MS,
    reportFile: reportFile === '' ? undefined : reportFile,
  };
}
