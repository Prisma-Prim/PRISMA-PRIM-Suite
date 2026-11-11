#!/usr/bin/env node

// Verification cost ledger (#1278): one record per verification run, appended
// to docs/agents/verification-cost/ledger.jsonl, and a summary over it.
// Guide: docs/agents/verification-cost.md.
//
// `record` reads the harness's own usage data (Claude Code transcripts or
// Codex local rollouts) or the figures a session reports itself, prices the
// tokens with a versioned price table, and prints one ledger line. A figure
// the source does not give is written as "not reported", never guessed.
// `check` validates the ledger and its price tables; the script tests run it
// in CI. `summary` adds the recorded figures; it never prices again.
//
// Privacy: records hold numbers and identifiers only. The readers keep usage
// counts, model names, timestamps and session identifiers, and drop the rest.

import { appendFile, readdir, readFile, stat } from 'node:fs/promises';
import { basename, dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

export const NOT_REPORTED = 'not reported';
export const RUN_TYPES = [
  'pull-request-proof',
  'journey-audit',
  'pilot-replay',
  'verify-journey',
];
export const HARNESSES = [
  'claude-code-local',
  'codex-local',
  'codex-cloud',
  'ci',
];
/** Which harness can produce each kind of figures. */
const FIGURES_SOURCES = {
  'claude-code-transcript': ['claude-code-local'],
  'codex-rollout': ['codex-local'],
  'self-reported': HARNESSES,
};
const SEVERITIES = ['P0', 'P1', 'P2', 'P3'];
const RESULTS = ['pass', 'fail'];
const TOKEN_KEYS = ['input', 'output', 'cacheCreation', 'cacheRead'];
const PRICE_KEYS = [
  'input',
  'output',
  'cacheWrite5m',
  'cacheWrite1h',
  'cacheRead',
];
const SCHEMA_VERSION = 1;
const NOTES_LIMIT = 500;
const RUN_ID = /^[A-Za-z0-9][A-Za-z0-9._:+-]{0,199}$/u;
const MODEL_ID = /^[A-Za-z0-9][A-Za-z0-9._:/@+-]{0,99}$/u;
const DATE = /^\d{4}-\d{2}-\d{2}$/u;
/** Claude Code writes its own notices as assistant messages of this model. */
const CLAUDE_CODE_SYNTHETIC_MODEL = '<synthetic>';
const PRICE_TABLES = 'price-tables';
const DEFAULT_LEDGER = fileURLToPath(
  new URL('../docs/agents/verification-cost/ledger.jsonl', import.meta.url),
);

const USAGE = `Usage:
  node scripts/verification-cost.mjs record --run-type <type> --harness <harness> <source> [options]
  node scripts/verification-cost.mjs summary [--ledger <path>] [--json]
  node scripts/verification-cost.mjs check [--ledger <path>]

Run types: ${RUN_TYPES.join(', ')}.
Harnesses: ${HARNESSES.join(', ')}.

Sources (one):
  --claude-code <file|dir>  Claude Code transcript(s), repeatable; a directory adds every .jsonl below it
  --codex <file|dir>        Codex rollout(s) (~/.codex/sessions/**/rollout-*.jsonl), repeatable
  self-reported figures     --model, --input, --output, --cache-creation, --cache-read,
                            --cache-write-ttl 5m|1h, --start, --end, --duration-seconds, --date

Record options:
  --run-id <id>             default: the session identifier of the source
  --issue <n>  --pull-request <n>
  --from <time>  --to <time>  keep only the source entries inside this window
  --result pass|fail  --findings none|P1=2,P2=1  --notes <text, no prompts or Client names>
  --price-table <file>      default: the newest table next to the default ledger
  --append                  append the line to --ledger (default docs/agents/verification-cost/ledger.jsonl)
`;

class UsageError extends Error {}

// ---- Reading the harness sources --------------------------------------------

async function readText(path) {
  try {
    return await readFile(path, 'utf8');
  } catch (error) {
    if (error.code === 'ENOENT') throw new UsageError(`cannot read ${path}`);
    throw error;
  }
}

/** JSON lines; a transcript still being written may end with a partial line. */
async function readJsonLines(path) {
  const lines = (await readText(path)).split('\n');
  const entries = [];
  lines.forEach((line, index) => {
    if (line.trim() === '') return;
    try {
      entries.push(JSON.parse(line));
    } catch {
      if (index === lines.length - 1) return;
      throw new UsageError(`${path}:${index + 1} is not valid JSON`);
    }
  });
  return entries;
}

async function jsonLineFiles(paths) {
  const files = new Set();
  async function visit(path, explicit) {
    let info;
    try {
      info = await stat(path);
    } catch {
      throw new UsageError(`cannot read ${path}`);
    }
    if (info.isDirectory()) {
      const entries = await readdir(path, { withFileTypes: true });
      for (const entry of entries.sort((left, right) =>
        left.name < right.name ? -1 : 1,
      )) {
        if (entry.isDirectory() || entry.name.endsWith('.jsonl')) {
          await visit(join(path, entry.name), false);
        }
      }
    } else if (explicit && path.endsWith('.zst')) {
      throw new UsageError(
        `${path} is compressed; decompress it and pass the .jsonl file`,
      );
    } else {
      files.add(resolve(path));
    }
  }
  for (const path of paths) await visit(path, true);
  if (files.size === 0) {
    throw new UsageError(`no .jsonl file in ${paths.join(', ')}`);
  }
  return [...files];
}

function count(value) {
  return Number.isSafeInteger(value) && value >= 0 ? value : NOT_REPORTED;
}

function inWindow(time, window) {
  return (
    Number.isFinite(time) &&
    (window.from === undefined || time >= window.from) &&
    (window.to === undefined || time <= window.to)
  );
}

function timeSpan(times) {
  if (times.length === 0) {
    return {
      start: NOT_REPORTED,
      end: NOT_REPORTED,
      durationSeconds: NOT_REPORTED,
    };
  }
  // A long session holds too many entries to spread into Math.min.
  const start = times.reduce((earliest, time) => Math.min(earliest, time));
  const end = times.reduce((latest, time) => Math.max(latest, time));
  return {
    start: new Date(start).toISOString(),
    end: new Date(end).toISOString(),
    durationSeconds: Math.round((end - start) / 1000),
  };
}

/** Prices need the cache writes split by duration: 1 hour costs more. */
function cacheWrites(cacheCreation, fiveMinutes, oneHour) {
  if (cacheCreation === 0) return { fiveMinutes: 0, oneHour: 0 };
  if (
    typeof cacheCreation === 'number' &&
    typeof fiveMinutes === 'number' &&
    typeof oneHour === 'number' &&
    fiveMinutes + oneHour === cacheCreation
  ) {
    return { fiveMinutes, oneHour };
  }
  return undefined;
}

function claudeCodeUsage(message) {
  const usage = message.usage;
  const tokens = {
    input: count(usage.input_tokens),
    output: count(usage.output_tokens),
    cacheCreation: count(usage.cache_creation_input_tokens),
    cacheRead: count(usage.cache_read_input_tokens),
  };
  // Fast mode, US-only inference and other service tiers have their own
  // prices, which the price table does not hold.
  const standard =
    (usage.speed ?? 'standard') === 'standard' &&
    (usage.service_tier ?? 'standard') === 'standard' &&
    usage.inference_geo !== 'us';
  return {
    model: typeof message.model === 'string' ? message.model : NOT_REPORTED,
    tokens,
    writes: standard
      ? cacheWrites(
          tokens.cacheCreation,
          count(usage.cache_creation?.ephemeral_5m_input_tokens),
          count(usage.cache_creation?.ephemeral_1h_input_tokens),
        )
      : undefined,
    perRequest: true,
  };
}

/** Session identifier, or session:agent when every entry is one subagent's. */
function defaultRunId(sessions, threads) {
  if (threads.size === 1) return [...threads][0];
  if (sessions.size === 1) return [...sessions][0];
  return undefined;
}

export async function readClaudeCode(paths, window = {}) {
  const usages = new Map();
  const times = [];
  const sessions = new Set();
  const threads = new Set();
  for (const file of await jsonLineFiles(paths)) {
    for (const entry of await readJsonLines(file)) {
      const time = Date.parse(entry?.timestamp);
      if (!inWindow(time, window)) continue;
      times.push(time);
      if (typeof entry.sessionId === 'string') {
        sessions.add(entry.sessionId);
        threads.add(
          typeof entry.agentId === 'string'
            ? `${entry.sessionId}:${entry.agentId}`
            : entry.sessionId,
        );
      }
      const message = entry.type === 'assistant' ? entry.message : undefined;
      if (!message?.usage || message.model === CLAUDE_CODE_SYNTHETIC_MODEL) {
        continue;
      }
      // Streamed parts of one response repeat its usage under one message
      // id; the last part carries the final figures.
      const key = message.id ?? entry.uuid ?? `${file}#${usages.size}`;
      usages.set(key, claudeCodeUsage(message));
    }
  }
  return {
    runId: defaultRunId(sessions, threads),
    ...timeSpan(times),
    usages: [...usages.values()],
  };
}

const CODEX_FIELDS = [
  'input_tokens',
  'cached_input_tokens',
  'cache_write_input_tokens',
  'output_tokens',
];

function codexUsage(model, total, previous) {
  const delta = {};
  for (const field of CODEX_FIELDS) {
    const now = total[field];
    const before = previous[field] ?? 0;
    delta[field] =
      Number.isSafeInteger(now) && now >= before ? now - before : NOT_REPORTED;
  }
  // Codex counts cached input and cache writes inside input_tokens, and
  // reasoning inside output_tokens.
  const parts = [
    delta.input_tokens,
    delta.cached_input_tokens,
    delta.cache_write_input_tokens === NOT_REPORTED
      ? 0
      : delta.cache_write_input_tokens,
  ];
  const uncached = parts.every((part) => typeof part === 'number')
    ? parts[0] - parts[1] - parts[2]
    : NOT_REPORTED;
  const tokens = {
    input: count(uncached),
    output: delta.output_tokens,
    cacheCreation: delta.cache_write_input_tokens,
    cacheRead: delta.cached_input_tokens,
  };
  return {
    model,
    tokens,
    writes: cacheWrites(tokens.cacheCreation),
    perRequest: false,
  };
}

export async function readCodex(paths, window = {}) {
  const usages = [];
  const times = [];
  const threads = new Set();
  for (const file of await jsonLineFiles(paths)) {
    let model = NOT_REPORTED;
    let previous = {};
    for (const entry of await readJsonLines(file)) {
      const time = Date.parse(entry?.timestamp);
      const payload = entry?.payload;
      if (entry?.type === 'session_meta' && typeof payload?.id === 'string') {
        threads.add(payload.id);
      }
      if (
        entry?.type === 'turn_context' &&
        typeof payload?.model === 'string'
      ) {
        model = payload.model;
      }
      if (inWindow(time, window)) times.push(time);
      const total =
        entry?.type === 'event_msg' && payload?.type === 'token_count'
          ? payload.info?.total_token_usage
          : undefined;
      if (!total) continue;
      // Totals are cumulative per thread: each event adds its increase, so a
      // repeated event adds nothing, and the increase goes to the model of
      // the turn that produced it.
      const usage = codexUsage(model, total, previous);
      previous = total;
      if (inWindow(time, window)) usages.push(usage);
    }
  }
  return {
    runId: threads.size === 1 ? [...threads][0] : undefined,
    ...timeSpan(times),
    usages,
  };
}

// ---- Self-reported figures --------------------------------------------------

function optionalCount(value, flag) {
  if (value === undefined) return NOT_REPORTED;
  if (!/^\d+$/u.test(value) || !Number.isSafeInteger(Number(value))) {
    throw new UsageError(`--${flag} expects a whole number, got "${value}"`);
  }
  return Number(value);
}

function optionalTime(value, flag) {
  if (value === undefined) return undefined;
  const time = Date.parse(value);
  if (!Number.isFinite(time)) {
    throw new UsageError(`--${flag} expects a date and time, got "${value}"`);
  }
  return time;
}

function selfReported(values) {
  const tokens = {
    input: optionalCount(values.input, 'input'),
    output: optionalCount(values.output, 'output'),
    cacheCreation: optionalCount(values['cache-creation'], 'cache-creation'),
    cacheRead: optionalCount(values['cache-read'], 'cache-read'),
  };
  const ttl = values['cache-write-ttl'];
  if (ttl !== undefined && ttl !== '5m' && ttl !== '1h') {
    throw new UsageError(`--cache-write-ttl expects 5m or 1h, got "${ttl}"`);
  }
  const start = optionalTime(values.start, 'start');
  const end = optionalTime(values.end, 'end');
  const reportedDuration = optionalCount(
    values['duration-seconds'],
    'duration-seconds',
  );
  let time = {
    start: NOT_REPORTED,
    end: NOT_REPORTED,
    durationSeconds: reportedDuration,
  };
  if (start !== undefined && end !== undefined) {
    time = timeSpan([start, end]);
    if (end < start) throw new UsageError('--end is before --start');
    if (
      reportedDuration !== NOT_REPORTED &&
      reportedDuration !== time.durationSeconds
    ) {
      throw new UsageError('--duration-seconds contradicts --start and --end');
    }
  } else if (start !== undefined || end !== undefined) {
    throw new UsageError('--start and --end go together');
  }
  // Without --cache-write-ttl, cache writes have no known price.
  const writes = cacheWrites(
    tokens.cacheCreation,
    ttl === '5m' ? tokens.cacheCreation : 0,
    ttl === '1h' ? tokens.cacheCreation : 0,
  );
  if (values.model !== undefined && !MODEL_ID.test(values.model)) {
    throw new UsageError(
      `--model expects a model identifier, got "${values.model}"`,
    );
  }
  return {
    runId: undefined,
    ...time,
    tokens,
    usages:
      values.model === undefined
        ? []
        : [{ model: values.model, tokens, writes, perRequest: false }],
  };
}

// ---- Pricing ----------------------------------------------------------------

function roundUsd(value) {
  return Math.round(value * 1e6) / 1e6;
}

/** Price in USD per million tokens times tokens, or undefined if unknown. */
function microDollars(table, { model, tokens, writes, perRequest }) {
  const prices = Object.hasOwn(table.models, model)
    ? table.models[model]
    : undefined;
  if (!prices || prices.input === null || writes === undefined)
    return undefined;
  if (TOKEN_KEYS.some((key) => typeof tokens[key] !== 'number')) {
    return undefined;
  }
  // A tier chosen by prompt length applies request by request, which summed
  // figures cannot show.
  if (prices.longContext && !perRequest) return undefined;
  const prompt = tokens.input + tokens.cacheCreation + tokens.cacheRead;
  const rate =
    prices.longContext && prompt > prices.longContext.abovePromptTokens
      ? prices.longContext
      : prices;
  return (
    tokens.input * rate.input +
    tokens.output * rate.output +
    writes.fiveMinutes * rate.cacheWrite5m +
    writes.oneHour * rate.cacheWrite1h +
    tokens.cacheRead * rate.cacheRead
  );
}

function addTokens(left, right) {
  return Object.fromEntries(
    TOKEN_KEYS.map((key) => [
      key,
      typeof left[key] === 'number' && typeof right[key] === 'number'
        ? left[key] + right[key]
        : NOT_REPORTED,
    ]),
  );
}

const ZERO_TOKENS = { input: 0, output: 0, cacheCreation: 0, cacheRead: 0 };

function modelEntries(usages, table) {
  const byModel = new Map();
  for (const usage of usages) {
    const entry = byModel.get(usage.model) ?? { tokens: ZERO_TOKENS, micro: 0 };
    const micro = microDollars(table, usage);
    byModel.set(usage.model, {
      tokens: addTokens(entry.tokens, usage.tokens),
      micro:
        entry.micro === undefined || micro === undefined
          ? undefined
          : entry.micro + micro,
    });
  }
  return [...byModel]
    .sort(([left], [right]) => (left < right ? -1 : 1))
    .map(([model, { tokens, micro }]) => ({
      model,
      tokens,
      estimatedPriceUsd:
        micro === undefined ? NOT_REPORTED : roundUsd(micro / 1e6),
    }));
}

function sumPrices(models) {
  if (
    models.length === 0 ||
    models.some(
      ({ estimatedPriceUsd }) => typeof estimatedPriceUsd !== 'number',
    )
  ) {
    return NOT_REPORTED;
  }
  return roundUsd(
    models.reduce(
      (total, { estimatedPriceUsd }) => total + estimatedPriceUsd,
      0,
    ),
  );
}

// ---- Price tables -----------------------------------------------------------

function isPlainObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function checkKeys(object, required, optional, path, errors) {
  for (const key of required) {
    if (!Object.hasOwn(object, key)) errors.push(`${path}${key}: missing`);
  }
  for (const key of Object.keys(object)) {
    if (!required.includes(key) && !optional.includes(key)) {
      errors.push(`${path}${key}: unexpected field`);
    }
  }
}

function isPrice(value) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

export function validatePriceTable(table, name) {
  const errors = [];
  if (!isPlainObject(table)) return ['the table is not a JSON object'];
  checkKeys(
    table,
    ['version', 'currency', 'unit', 'source', 'models'],
    [],
    '',
    errors,
  );
  if (table.version !== name) {
    errors.push(
      `version: "${table.version}" must match the file name "${name}"`,
    );
  }
  if (table.currency !== 'USD') errors.push('currency: expected "USD"');
  if (table.unit !== 'per million tokens') {
    errors.push('unit: expected "per million tokens"');
  }
  if (typeof table.source !== 'string' || table.source.trim() === '') {
    errors.push('source: name where the prices come from');
  }
  if (!isPlainObject(table.models) || Object.keys(table.models).length === 0) {
    errors.push('models: expected at least one model');
    return errors;
  }
  for (const [model, prices] of Object.entries(table.models)) {
    const path = `models.${model}.`;
    if (!isPlainObject(prices)) {
      errors.push(`${path}: expected an object`);
      continue;
    }
    checkKeys(prices, PRICE_KEYS, ['note', 'longContext'], path, errors);
    const unknown = PRICE_KEYS.every((key) => prices[key] === null);
    if (unknown) {
      if (typeof prices.note !== 'string' || prices.note.trim() === '') {
        errors.push(`${path}note: say why the prices are unknown`);
      }
      if (prices.longContext !== undefined) {
        errors.push(`${path}longContext: needs known base prices`);
      }
      continue;
    }
    for (const key of PRICE_KEYS) {
      if (!isPrice(prices[key]))
        errors.push(`${path}${key}: expected a price or null for all`);
    }
    if (prices.longContext !== undefined) {
      const tier = prices.longContext;
      if (!isPlainObject(tier)) {
        errors.push(`${path}longContext: expected an object`);
        continue;
      }
      checkKeys(
        tier,
        ['abovePromptTokens', ...PRICE_KEYS],
        [],
        `${path}longContext.`,
        errors,
      );
      if (
        !Number.isSafeInteger(tier.abovePromptTokens) ||
        tier.abovePromptTokens <= 0
      ) {
        errors.push(
          `${path}longContext.abovePromptTokens: expected a positive whole number`,
        );
      }
      for (const key of PRICE_KEYS) {
        if (!isPrice(tier[key]))
          errors.push(`${path}longContext.${key}: expected a price`);
      }
    }
  }
  return errors;
}

async function loadPriceTable(path) {
  let table;
  try {
    table = JSON.parse(await readText(path));
  } catch (error) {
    if (error instanceof UsageError) throw error;
    throw new UsageError(`${path} is not valid JSON`);
  }
  const errors = validatePriceTable(table, basename(path, '.json'));
  if (errors.length > 0) {
    throw new UsageError(
      `${path} is not a valid price table: ${errors.join('; ')}`,
    );
  }
  return table;
}

async function priceTableFiles(directory) {
  try {
    return (await readdir(directory))
      .filter((name) => name.endsWith('.json'))
      .sort()
      .map((name) => join(directory, name));
  } catch (error) {
    if (error.code === 'ENOENT') {
      throw new UsageError(`no ${PRICE_TABLES} directory at ${directory}`);
    }
    throw error;
  }
}

/** The versions of the valid tables in a directory, and the invalid ones. */
async function readPriceTables(directory) {
  const versions = new Set();
  const errors = [];
  for (const file of await priceTableFiles(directory)) {
    try {
      versions.add((await loadPriceTable(file)).version);
    } catch (error) {
      if (!(error instanceof UsageError)) throw error;
      errors.push(error.message);
    }
  }
  return { versions, errors };
}

function priceTablesNextTo(ledger) {
  return join(dirname(ledger), PRICE_TABLES);
}

// ---- Records and the ledger -------------------------------------------------

function isCountOrNotReported(value) {
  return value === NOT_REPORTED || (Number.isSafeInteger(value) && value >= 0);
}

function isTimeOrNotReported(value) {
  return (
    value === NOT_REPORTED ||
    (typeof value === 'string' &&
      Number.isFinite(Date.parse(value)) &&
      new Date(value).toISOString() === value)
  );
}

function isIdentifierOrNotReported(value) {
  return value === NOT_REPORTED || (Number.isSafeInteger(value) && value > 0);
}

function checkTokens(tokens, path, errors) {
  if (!isPlainObject(tokens)) {
    errors.push(`${path}: expected an object`);
    return false;
  }
  checkKeys(tokens, TOKEN_KEYS, [], `${path}.`, errors);
  let valid = true;
  for (const key of TOKEN_KEYS) {
    if (!isCountOrNotReported(tokens[key])) {
      errors.push(
        `${path}.${key}: expected a whole number or "${NOT_REPORTED}"`,
      );
      valid = false;
    }
  }
  return valid;
}

function checkOneOf(value, allowed, path, errors) {
  if (!allowed.includes(value)) {
    errors.push(`${path}: unknown value ${JSON.stringify(value)}`);
    return false;
  }
  return true;
}

function checkTime(time, errors) {
  if (!isPlainObject(time)) {
    errors.push('time: expected an object');
    return;
  }
  checkKeys(time, ['start', 'end', 'durationSeconds'], [], 'time.', errors);
  const { start, end, durationSeconds } = time;
  if (!isTimeOrNotReported(start))
    errors.push('time.start: expected an ISO time');
  if (!isTimeOrNotReported(end)) errors.push('time.end: expected an ISO time');
  if (!isCountOrNotReported(durationSeconds)) {
    errors.push('time.durationSeconds: expected a whole number of seconds');
  }
  if ((start === NOT_REPORTED) !== (end === NOT_REPORTED)) {
    errors.push('time: start and end are reported together');
  } else if (
    start !== NOT_REPORTED &&
    isTimeOrNotReported(start) &&
    isTimeOrNotReported(end)
  ) {
    const seconds = Math.round((Date.parse(end) - Date.parse(start)) / 1000);
    if (seconds < 0) errors.push('time.end: before time.start');
    else if (durationSeconds !== seconds) {
      errors.push(
        `time.durationSeconds: expected ${seconds} from start and end`,
      );
    }
  }
}

function checkModels(record, errors) {
  if (!Array.isArray(record.models)) {
    errors.push('models: expected an array');
    return;
  }
  const seen = new Set();
  let consistent = true;
  record.models.forEach((entry, index) => {
    const path = `models[${index}]`;
    if (!isPlainObject(entry)) {
      errors.push(`${path}: expected an object`);
      consistent = false;
      return;
    }
    checkKeys(
      entry,
      ['model', 'tokens', 'estimatedPriceUsd'],
      [],
      `${path}.`,
      errors,
    );
    if (
      entry.model !== NOT_REPORTED &&
      !(typeof entry.model === 'string' && MODEL_ID.test(entry.model))
    ) {
      errors.push(`${path}.model: expected a model identifier`);
    }
    if (seen.has(entry.model)) errors.push(`${path}.model: listed twice`);
    seen.add(entry.model);
    if (!checkTokens(entry.tokens, `${path}.tokens`, errors))
      consistent = false;
    if (
      entry.estimatedPriceUsd !== NOT_REPORTED &&
      !isPrice(entry.estimatedPriceUsd)
    ) {
      errors.push(
        `${path}.estimatedPriceUsd: expected a price or "${NOT_REPORTED}"`,
      );
      consistent = false;
    }
  });
  if (!consistent || record.models.length === 0) return;
  if (isPlainObject(record.tokens)) {
    const sum = record.models.reduce(
      (total, entry) => addTokens(total, entry.tokens),
      ZERO_TOKENS,
    );
    for (const key of TOKEN_KEYS) {
      if (record.tokens[key] !== sum[key]) {
        errors.push(
          `tokens.${key}: ${JSON.stringify(record.tokens[key])} is not the sum of the models (${JSON.stringify(sum[key])})`,
        );
      }
    }
  }
}

function checkPrice(record, priceTables, errors) {
  const price = record.price;
  if (!isPlainObject(price)) {
    errors.push('price: expected an object');
    return;
  }
  checkKeys(price, ['estimatedUsd', 'priceTable'], [], 'price.', errors);
  if (price.estimatedUsd !== NOT_REPORTED && !isPrice(price.estimatedUsd)) {
    errors.push(`price.estimatedUsd: expected a price or "${NOT_REPORTED}"`);
  }
  if (
    typeof price.priceTable !== 'string' ||
    !priceTables.has(price.priceTable)
  ) {
    errors.push(
      `price.priceTable: no price table ${JSON.stringify(price.priceTable)} next to the ledger`,
    );
  }
  if (!Array.isArray(record.models) || !record.models.every(isPlainObject))
    return;
  const expected = sumPrices(record.models);
  const matches =
    typeof expected === 'number' && typeof price.estimatedUsd === 'number'
      ? Math.abs(expected - price.estimatedUsd) < 1e-6
      : expected === price.estimatedUsd;
  if (!matches) {
    errors.push(
      `price.estimatedUsd: ${JSON.stringify(price.estimatedUsd)} is not the sum of the models (${JSON.stringify(expected)})`,
    );
  }
}

function checkOutcome(outcome, errors) {
  if (!isPlainObject(outcome)) {
    errors.push('outcome: expected an object');
    return;
  }
  checkKeys(outcome, ['result', 'findings', 'notes'], [], 'outcome.', errors);
  checkOneOf(
    outcome.result,
    [...RESULTS, NOT_REPORTED],
    'outcome.result',
    errors,
  );
  if (outcome.findings !== NOT_REPORTED) {
    if (!isPlainObject(outcome.findings)) {
      errors.push(
        `outcome.findings: expected counts by severity or "${NOT_REPORTED}"`,
      );
    } else {
      checkKeys(outcome.findings, SEVERITIES, [], 'outcome.findings.', errors);
      for (const severity of SEVERITIES) {
        if (!(
          Number.isSafeInteger(outcome.findings[severity]) &&
          outcome.findings[severity] >= 0
        )) {
          errors.push(`outcome.findings.${severity}: expected a whole number`);
        }
      }
    }
  }
  if (typeof outcome.notes !== 'string' || !isPlainNote(outcome.notes)) {
    errors.push(
      `outcome.notes: expected one line of at most ${NOTES_LIMIT} characters`,
    );
  }
}

function isPlainNote(text) {
  // One short line: a place for a remark, not for pasted prompts or output.
  // eslint-disable-next-line no-control-regex
  return text.length <= NOTES_LIMIT && !/[\u0000-\u001f\u007f]/u.test(text);
}

/** Every reason the record is not a valid ledger line; empty when valid. */
export function validateRecord(record, priceTables) {
  const errors = [];
  if (!isPlainObject(record)) return ['expected a JSON object'];
  checkKeys(
    record,
    [
      'schemaVersion',
      'runId',
      'date',
      'runType',
      'issue',
      'pullRequest',
      'harness',
      'figuresSource',
      'time',
      'tokens',
      'models',
      'price',
      'outcome',
    ],
    [],
    '',
    errors,
  );
  if (record.schemaVersion !== SCHEMA_VERSION) {
    errors.push(`schemaVersion: expected ${SCHEMA_VERSION}`);
  }
  if (typeof record.runId !== 'string' || !RUN_ID.test(record.runId)) {
    errors.push('runId: expected 1 to 200 letters, digits or . _ : + -');
  }
  if (
    typeof record.date !== 'string' ||
    !DATE.test(record.date) ||
    !Number.isFinite(Date.parse(`${record.date}T00:00:00Z`)) ||
    new Date(`${record.date}T00:00:00Z`).toISOString().slice(0, 10) !==
      record.date
  ) {
    errors.push('date: expected YYYY-MM-DD');
  } else if (
    isPlainObject(record.time) &&
    typeof record.time.start === 'string' &&
    isTimeOrNotReported(record.time.start) &&
    record.time.start !== NOT_REPORTED &&
    record.time.start.slice(0, 10) !== record.date
  ) {
    errors.push('date: expected the UTC date of time.start');
  }
  checkOneOf(record.runType, RUN_TYPES, 'runType', errors);
  const knownHarness = checkOneOf(record.harness, HARNESSES, 'harness', errors);
  if (
    checkOneOf(
      record.figuresSource,
      Object.keys(FIGURES_SOURCES),
      'figuresSource',
      errors,
    ) &&
    knownHarness &&
    !FIGURES_SOURCES[record.figuresSource].includes(record.harness)
  ) {
    errors.push(
      `figuresSource: harness ${record.harness} leaves no ${record.figuresSource}`,
    );
  }
  for (const key of ['issue', 'pullRequest']) {
    if (!isIdentifierOrNotReported(record[key])) {
      errors.push(`${key}: expected a number or "${NOT_REPORTED}"`);
    }
  }
  checkTime(record.time, errors);
  checkTokens(record.tokens, 'tokens', errors);
  checkModels(record, errors);
  checkPrice(record, priceTables, errors);
  checkOutcome(record.outcome, errors);
  return errors;
}

/** Validates every line; records holds the valid ones. */
export function validateLedger(text, priceTables) {
  const errors = [];
  const records = [];
  const runIds = new Map();
  const lines = text.split('\n');
  if (lines.at(-1) === '') lines.pop();
  lines.forEach((line, index) => {
    const number = index + 1;
    let record;
    try {
      record = JSON.parse(line);
    } catch {
      errors.push(`line ${number}: not valid JSON`);
      return;
    }
    const recordErrors = validateRecord(record, priceTables);
    if (typeof record?.runId === 'string') {
      if (runIds.has(record.runId)) {
        recordErrors.push(
          `runId: duplicate of line ${runIds.get(record.runId)}`,
        );
      } else {
        runIds.set(record.runId, number);
      }
    }
    errors.push(...recordErrors.map((error) => `line ${number}: ${error}`));
    if (recordErrors.length === 0) records.push(record);
  });
  return { errors, records };
}

async function readLedger(ledger) {
  const { versions, errors: tableErrors } = await readPriceTables(
    priceTablesNextTo(ledger),
  );
  const { errors, records } = validateLedger(await readText(ledger), versions);
  return { versions, errors: [...tableErrors, ...errors], records };
}

// ---- record -----------------------------------------------------------------

function oneOf(value, allowed, flag) {
  if (value === undefined) {
    throw new UsageError(`--${flag} is required: ${allowed.join(', ')}`);
  }
  if (!allowed.includes(value)) {
    throw new UsageError(
      `unknown ${flag} "${value}"; expected one of ${allowed.join(', ')}`,
    );
  }
  return value;
}

function optionalIdentifier(value, flag) {
  if (value === undefined) return NOT_REPORTED;
  if (!/^[1-9]\d*$/u.test(value)) {
    throw new UsageError(`--${flag} expects a number, got "${value}"`);
  }
  return Number(value);
}

function parseFindings(value) {
  if (value === undefined) return NOT_REPORTED;
  const findings = Object.fromEntries(
    SEVERITIES.map((severity) => [severity, 0]),
  );
  if (value === 'none') return findings;
  for (const part of value.split(',')) {
    const match = /^(P[0-3])=(\d+)$/u.exec(part.trim());
    if (!match) {
      throw new UsageError(
        `--findings expects "none" or counts such as P1=2,P2=1, got "${part}"`,
      );
    }
    findings[match[1]] += Number(match[2]);
  }
  return findings;
}

const SELF_REPORTED_FLAGS = [
  'model',
  'input',
  'output',
  'cache-creation',
  'cache-read',
  'cache-write-ttl',
  'start',
  'end',
  'duration-seconds',
];

function figuresSourceOf(values, harness) {
  const sources = ['claude-code', 'codex'].filter((flag) => values[flag]);
  if (sources.length > 1) {
    throw new UsageError('give one source: --claude-code or --codex');
  }
  const figuresSource =
    sources.length === 0
      ? 'self-reported'
      : { 'claude-code': 'claude-code-transcript', codex: 'codex-rollout' }[
          sources[0]
        ];
  if (sources.length === 1) {
    const figureFlag = SELF_REPORTED_FLAGS.find(
      (flag) => values[flag] !== undefined,
    );
    if (figureFlag) {
      throw new UsageError(
        `--${figureFlag} is a self-reported figure; --${sources[0]} supplies the figures`,
      );
    }
  } else if (values.from !== undefined || values.to !== undefined) {
    throw new UsageError(
      '--from and --to select entries of --claude-code or --codex',
    );
  }
  if (!FIGURES_SOURCES[figuresSource].includes(harness)) {
    throw new UsageError(
      `--${sources[0]} reads data that harness ${harness} does not leave; ` +
        'give the figures the session reports itself instead',
    );
  }
  return figuresSource;
}

async function defaultPriceTable() {
  const files = await priceTableFiles(priceTablesNextTo(DEFAULT_LEDGER));
  if (files.length === 0)
    throw new UsageError('no price table; pass --price-table');
  return files.at(-1);
}

async function readSource(figuresSource, values) {
  const window = {
    from: optionalTime(values.from, 'from'),
    to: optionalTime(values.to, 'to'),
  };
  if (figuresSource === 'self-reported') return selfReported(values);
  const source =
    figuresSource === 'claude-code-transcript'
      ? await readClaudeCode(values['claude-code'], window)
      : await readCodex(values.codex, window);
  if (source.usages.length === 0) {
    throw new UsageError(
      'the source holds no token usage in the selected window',
    );
  }
  return source;
}

function buildRecord({
  values,
  runType,
  harness,
  figuresSource,
  source,
  table,
  now,
}) {
  const runId = values['run-id'] ?? source.runId;
  if (runId === undefined) {
    throw new UsageError(
      '--run-id is required: the source names no single session',
    );
  }
  if (values.date !== undefined && !DATE.test(values.date)) {
    throw new UsageError(`--date expects YYYY-MM-DD, got "${values.date}"`);
  }
  if (values.result !== undefined && !RESULTS.includes(values.result)) {
    throw new UsageError(
      `--result expects pass or fail, got "${values.result}"`,
    );
  }
  const notes = values.notes ?? '';
  if (!isPlainNote(notes)) {
    throw new UsageError(
      `--notes takes one line of at most ${NOTES_LIMIT} characters`,
    );
  }
  const models = modelEntries(source.usages, table);
  return {
    schemaVersion: SCHEMA_VERSION,
    runId,
    date:
      source.start !== NOT_REPORTED
        ? source.start.slice(0, 10)
        : (values.date ?? now().toISOString().slice(0, 10)),
    runType,
    issue: optionalIdentifier(values.issue, 'issue'),
    pullRequest: optionalIdentifier(values['pull-request'], 'pull-request'),
    harness,
    figuresSource,
    time: {
      start: source.start,
      end: source.end,
      durationSeconds: source.durationSeconds,
    },
    tokens:
      models.length > 0
        ? models.reduce(
            (total, entry) => addTokens(total, entry.tokens),
            ZERO_TOKENS,
          )
        : source.tokens,
    models,
    price: { estimatedUsd: sumPrices(models), priceTable: table.version },
    outcome: {
      result: values.result ?? NOT_REPORTED,
      findings: parseFindings(values.findings),
      notes,
    },
  };
}

async function appendRecord(ledger, record) {
  const { versions, errors, records } = await readLedger(ledger);
  if (errors.length > 0) {
    throw new UsageError(`the ledger is invalid; run check: ${errors[0]}`);
  }
  if (!versions.has(record.price.priceTable)) {
    throw new UsageError(
      `price table "${record.price.priceTable}" is not in ${priceTablesNextTo(ledger)}; ` +
        'add it there first so the ledger keeps every table it was priced with',
    );
  }
  if (records.some(({ runId }) => runId === record.runId)) {
    throw new UsageError(
      `run "${record.runId}" is already in the ledger; pass another --run-id`,
    );
  }
  const text = await readText(ledger);
  const separator = text === '' || text.endsWith('\n') ? '' : '\n';
  await appendFile(ledger, `${separator}${JSON.stringify(record)}\n`);
}

async function recordCommand(values, io) {
  const runType = oneOf(values['run-type'], RUN_TYPES, 'run-type');
  const harness = oneOf(values.harness, HARNESSES, 'harness');
  const figuresSource = figuresSourceOf(values, harness);
  const table = await loadPriceTable(
    values['price-table'] ?? (await defaultPriceTable()),
  );
  const source = await readSource(figuresSource, values);
  const record = buildRecord({
    values,
    runType,
    harness,
    figuresSource,
    source,
    table,
    now: io.now,
  });
  const errors = validateRecord(record, new Set([table.version]));
  if (errors.length > 0) {
    throw new UsageError(`the record is invalid: ${errors.join('; ')}`);
  }
  if (values.append)
    await appendRecord(values.ledger ?? DEFAULT_LEDGER, record);
  io.stdout(`${JSON.stringify(record)}\n`);
  return 0;
}

// ---- summary ----------------------------------------------------------------

function newMetric() {
  return { total: 0, reported: 0 };
}

function addMetric(metric, value) {
  if (typeof value !== 'number') return;
  metric.total += value;
  metric.reported += 1;
}

function finishMetric({ total, reported }) {
  return reported === 0
    ? { total: null, average: null, reported: 0 }
    : { total: roundUsd(total), average: roundUsd(total / reported), reported };
}

function findingsTotal(findings) {
  return findings === NOT_REPORTED
    ? NOT_REPORTED
    : SEVERITIES.reduce((total, severity) => total + findings[severity], 0);
}

/** One group per key; contributions(record) yields [key, tokens, price]. */
function aggregate(records, contributions) {
  const groups = new Map();
  for (const record of records) {
    const findings = findingsTotal(record.outcome.findings);
    for (const [key, tokens, price] of contributions(record)) {
      if (!groups.has(key)) {
        groups.set(key, {
          key,
          runs: 0,
          durationSeconds: newMetric(),
          tokens: Object.fromEntries(
            TOKEN_KEYS.map((name) => [name, newMetric()]),
          ),
          estimatedPriceUsd: newMetric(),
          findings: newMetric(),
          valued: { price: 0, findings: 0 },
        });
      }
      const group = groups.get(key);
      group.runs += 1;
      addMetric(group.durationSeconds, record.time.durationSeconds);
      for (const name of TOKEN_KEYS)
        addMetric(group.tokens[name], tokens[name]);
      addMetric(group.estimatedPriceUsd, price);
      addMetric(group.findings, findings);
      // Cost per finding compares only runs that reported both.
      if (typeof price === 'number' && typeof findings === 'number') {
        group.valued.price += price;
        group.valued.findings += findings;
      }
    }
  }
  return [...groups.values()]
    .sort((left, right) => (left.key < right.key ? -1 : 1))
    .map((group) => ({
      key: group.key,
      runs: group.runs,
      durationSeconds: finishMetric(group.durationSeconds),
      tokens: Object.fromEntries(
        TOKEN_KEYS.map((name) => [name, finishMetric(group.tokens[name])]),
      ),
      estimatedPriceUsd: finishMetric(group.estimatedPriceUsd),
      findings: finishMetric(group.findings),
      costPerFindingUsd:
        group.valued.findings > 0
          ? roundUsd(group.valued.price / group.valued.findings)
          : null,
    }));
}

export function summarize(records) {
  const whole = (key) => (record) => [
    [key(record), record.tokens, record.price.estimatedUsd],
  ];
  return {
    runs: records.length,
    byRunType: aggregate(
      records,
      whole((record) => record.runType),
    ),
    byHarness: aggregate(
      records,
      whole((record) => record.harness),
    ),
    // A run that used several models counts once under each of them.
    byModel: aggregate(records, (record) =>
      record.models.map((entry) => [
        entry.model,
        entry.tokens,
        entry.estimatedPriceUsd,
      ]),
    ),
    byMonth: aggregate(
      records,
      whole((record) => record.date.slice(0, 7)),
    ),
  };
}

function formatNumber(value) {
  return value.toLocaleString('en-US', { maximumFractionDigits: 1 });
}

function formatUsd(value) {
  return value >= 1
    ? `$${value.toFixed(2)}`
    : `$${value.toFixed(4).replace(/0{1,2}$/u, '')}`;
}

function cell(metric, runs, format) {
  if (metric.reported === 0) return NOT_REPORTED;
  const text = `${format(metric.total)} / ${format(metric.average)}`;
  return metric.reported < runs
    ? `${text} (${metric.reported} of ${runs})`
    : text;
}

function formatTable(title, column, groups) {
  const minutes = (seconds) => (seconds / 60).toFixed(1);
  const rows = groups.map((group) =>
    [
      group.key,
      String(group.runs),
      cell(group.durationSeconds, group.runs, minutes),
      ...TOKEN_KEYS.map((name) =>
        cell(group.tokens[name], group.runs, formatNumber),
      ),
      cell(group.estimatedPriceUsd, group.runs, formatUsd),
      cell(group.findings, group.runs, formatNumber),
      group.costPerFindingUsd === null
        ? '-'
        : formatUsd(group.costPerFindingUsd),
    ].join(' | '),
  );
  return [
    `## By ${title}`,
    '',
    `| ${column} | Runs | Duration (min) | Input | Output | Cache creation | Cache read | Price (USD) | Findings | USD per finding |`,
    '| --- | --: | --: | --: | --: | --: | --: | --: | --: | --: |',
    ...rows.map((row) => `| ${row} |`),
    '',
  ].join('\n');
}

export function formatSummary(summary, ledger) {
  return [
    `# Verification cost: ${summary.runs} run${summary.runs === 1 ? '' : 's'} in ${ledger}`,
    '',
    'Each cell is total / average. "(n of m)" counts the runs that reported the figure when some did not.',
    'Prices are estimates from the price table each run recorded. USD per finding uses the runs that reported both.',
    '',
    formatTable('run type', 'Run type', summary.byRunType),
    formatTable('harness', 'Harness', summary.byHarness),
    'A run that used several models counts under each one, with its whole duration and findings.',
    '',
    formatTable('model', 'Model', summary.byModel),
    formatTable('month', 'Month', summary.byMonth),
  ].join('\n');
}

// ---- main -------------------------------------------------------------------

const OPTIONS = {
  'run-type': { type: 'string' },
  harness: { type: 'string' },
  'run-id': { type: 'string' },
  issue: { type: 'string' },
  'pull-request': { type: 'string' },
  'claude-code': { type: 'string', multiple: true },
  codex: { type: 'string', multiple: true },
  from: { type: 'string' },
  to: { type: 'string' },
  model: { type: 'string' },
  input: { type: 'string' },
  output: { type: 'string' },
  'cache-creation': { type: 'string' },
  'cache-read': { type: 'string' },
  'cache-write-ttl': { type: 'string' },
  start: { type: 'string' },
  end: { type: 'string' },
  'duration-seconds': { type: 'string' },
  date: { type: 'string' },
  result: { type: 'string' },
  findings: { type: 'string' },
  notes: { type: 'string' },
  'price-table': { type: 'string' },
  ledger: { type: 'string' },
  append: { type: 'boolean' },
  json: { type: 'boolean' },
  help: { type: 'boolean' },
};

const defaultIo = {
  stdout: (text) => process.stdout.write(text),
  stderr: (text) => process.stderr.write(text),
  now: () => new Date(),
};

export async function main(argv = process.argv.slice(2), io = defaultIo) {
  try {
    let parsed;
    try {
      parsed = parseArgs({
        args: argv,
        options: OPTIONS,
        allowPositionals: true,
      });
    } catch (error) {
      throw new UsageError(error.message);
    }
    const { values, positionals } = parsed;
    const [command, ...rest] = positionals;
    if (values.help) {
      io.stdout(USAGE);
      return 0;
    }
    if (rest.length > 0)
      throw new UsageError(`unexpected argument "${rest[0]}"`);
    const ledger = values.ledger ?? DEFAULT_LEDGER;
    // A relative path keeps the local user folder out of pasted output.
    const shown = relative(process.cwd(), ledger) || ledger;
    if (command === 'record') return await recordCommand(values, io);
    if (command === 'check' || command === 'summary') {
      const { versions, errors, records } = await readLedger(ledger);
      if (errors.length > 0) {
        io.stderr(
          `${shown} is invalid:\n${errors.map((error) => `- ${error}\n`).join('')}`,
        );
        return 1;
      }
      if (command === 'check') {
        io.stdout(
          `Ledger valid: ${records.length} record${records.length === 1 ? '' : 's'}, ` +
            `${versions.size} price table${versions.size === 1 ? '' : 's'} (${shown}).\n`,
        );
        return 0;
      }
      const summary = summarize(records);
      io.stdout(
        values.json
          ? `${JSON.stringify(summary, null, 2)}\n`
          : formatSummary(summary, shown),
      );
      return 0;
    }
    throw new UsageError(
      command === undefined
        ? 'a command is required'
        : `unknown command "${command}"`,
    );
  } catch (error) {
    if (!(error instanceof UsageError)) throw error;
    io.stderr(`verification-cost: ${error.message}\n\n${USAGE}`);
    return 1;
  }
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  process.exitCode = await main();
}
