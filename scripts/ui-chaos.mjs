// Seeded UI chaos (#1376, stage 2 of #1155): the seed handling of
// `pnpm verify:journey --chaos` and the deterministic perturbation plan that
// the acceptance fixture `apps/web/e2e/ui-chaos.fixture.ts` applies. One seed
// gives one plan: every decision is a hash of the seed, the scope (the
// Playwright project and test) and a stable key, never of the clock, so a
// replay perturbs the same requests and clicks in the same way. Real timing
// still varies between runs, so a replay reproduces the perturbations, not
// every interleaving.

import { randomInt } from 'node:crypto';

/** A seed is a whole number from 1 to 2^31 - 1, printed and replayed as is. */
export const MAXIMUM_CHAOS_SEED = 2 ** 31 - 1;
/** The environment variable through which the runner hands a run its seed. */
export const CHAOS_SEED_VARIABLE = 'UI_CHAOS_SEED';
/** The import a journey adds to opt into chaos; the runner refuses others. */
export const CHAOS_FIXTURE_IMPORT = "from './ui-chaos.fixture'";

/** The seed a command-line or environment value names, or null. */
export function parseChaosSeed(text) {
  if (typeof text !== 'string' || !/^[1-9]\d{0,9}$/u.test(text)) return null;
  const seed = Number(text);
  return seed <= MAXIMUM_CHAOS_SEED ? seed : null;
}

export function randomChaosSeed() {
  return randomInt(1, MAXIMUM_CHAOS_SEED + 1);
}

// FNV-1a over UTF-16 code units, then a murmur3 finalizer to spread the bits.
function hash32(text) {
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  hash ^= hash >>> 16;
  hash = Math.imul(hash, 0x85ebca6b);
  hash ^= hash >>> 13;
  hash = Math.imul(hash, 0xc2b2ae35);
  hash ^= hash >>> 16;
  return hash >>> 0;
}

/**
 * The seed of repetition `run` (from 1) of a chaos verification. The first
 * repetition uses the base seed itself, so any repetition replays alone with
 * `--chaos <its seed>`.
 */
export function chaosRunSeed(baseSeed, run) {
  if (run === 1) return baseSeed;
  return 1 + (hash32(`${baseSeed}/run/${run}`) % MAXIMUM_CHAOS_SEED);
}

/** The one command that replays a chaos run locally on a fresh database. */
export function chaosReplayCommand(journey, seed) {
  return `pnpm verify:journey ${journey} --chaos ${seed}`;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;

/**
 * The request's path with record identifiers and numbers replaced, so the
 * same endpoint gets the same key in every run although each run creates
 * new records. The query string is left out for the same reason.
 */
export function requestKeyPath(url) {
  return new URL(url).pathname
    .split('/')
    .map((segment) =>
      UUID.test(segment) ? ':id' : /^\d+$/u.test(segment) ? ':n' : segment,
    )
    .join('/');
}

function weighted(unit, choices) {
  let threshold = 0;
  for (const [weight, value] of choices) {
    threshold += weight;
    if (unit < threshold) return value;
  }
  return choices.at(-1)[1];
}

/** Share of submit-button clicks followed by a second click. */
const DOUBLE_SUBMIT_RATE = 0.5;
/** Share of section changes followed by back, then forward navigation. */
const BACK_AND_FORWARD_RATE = 0.35;

/**
 * The perturbation plan of one test under one seed. `scope` separates the
 * desktop and narrow runs of the same seed. Each decision method draws the
 * next value of its own sequence and records it in `log`.
 */
export function createChaosPlan({ seed, scope }) {
  const unit = (label) => hash32(`${seed}|${scope}|${label}`) / 2 ** 32;
  const counters = new Map();
  const next = (key) => {
    const count = (counters.get(key) ?? 0) + 1;
    counters.set(key, count);
    return count;
  };
  // Company contexts are named by order of appearance: their identifiers
  // differ in every run.
  const contexts = new Map();
  const contextOf = (companyContextId) => {
    if (!companyContextId) return '-';
    if (!contexts.has(companyContextId))
      contexts.set(companyContextId, `c${contexts.size + 1}`);
    return contexts.get(companyContextId);
  };
  // Chromium slows the page's main thread by this factor.
  const cpuThrottleRate = weighted(unit('cpu'), [
    [0.35, 1],
    [0.4, 2],
    [0.25, 4],
  ]);
  // One Company context may answer late on every request once a second one
  // has appeared, so its answers can land after a switch to the other. A
  // journey in one Company is not slowed by it.
  const laggedContext = weighted(unit('lagged-context'), [
    [0.4, null],
    [0.3, 'c1'],
    [0.3, 'c2'],
  ]);
  const lagMilliseconds =
    laggedContext === null ? 0 : 400 + Math.round(unit('lag') * 1100);
  const log = [];

  return {
    seed,
    scope,
    cpuThrottleRate,
    laggedContext,
    lagMilliseconds,
    log,
    describe() {
      const lag =
        laggedContext === null
          ? 'no Company context lagged'
          : `Company context ${laggedContext} lagged by ${lagMilliseconds} ms`;
      return `CPU slowed ${cpuThrottleRate}x, ${lag}`;
    },
    /**
     * How long the answer to this request is held after the API answered.
     * Each answer gets its own delay, so concurrent answers arrive out of
     * order; one in ten falls in a slow tail.
     */
    responseDelay({ method, url, companyContextId }) {
      const context = contextOf(companyContextId);
      const endpoint = `${method} ${requestKeyPath(url)} @${context}`;
      const key = `${endpoint} #${next(`delay ${endpoint}`)}`;
      const draw = unit(`delay ${key}`);
      const base =
        draw < 0.55
          ? Math.round((draw / 0.55) * 120)
          : draw < 0.9
            ? 120 + Math.round(((draw - 0.55) / 0.35) * 580)
            : 700 + Math.round(((draw - 0.9) / 0.1) * 1800);
      const milliseconds =
        base +
        (context === laggedContext && contexts.size > 1 ? lagMilliseconds : 0);
      log.push({ kind: 'delay', key, milliseconds });
      return milliseconds;
    },
    /** Whether this click on a submit button is followed by a second one. */
    doubleSubmit(name) {
      const count = next('double-submit');
      const chosen = unit(`double-submit #${count}`) < DOUBLE_SUBMIT_RATE;
      log.push({ kind: 'double-submit', count, name, chosen });
      return chosen;
    },
    /** Whether this section change is followed by back, then forward. */
    backAndForward(destination) {
      const count = next('back-and-forward');
      const chosen = unit(`back-and-forward #${count}`) < BACK_AND_FORWARD_RATE;
      log.push({ kind: 'back-and-forward', count, destination, chosen });
      return chosen;
    },
  };
}
