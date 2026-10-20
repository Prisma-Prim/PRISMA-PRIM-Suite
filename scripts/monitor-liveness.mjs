import { setTimeout as delay } from 'node:timers/promises';
import { isIP } from 'node:net';

function writeEvent(event, output = process.stdout) {
  output.write(
    `${JSON.stringify({ version: 1, timestamp: new Date().toISOString(), guide: 'docs/agents/railway-activation.md', ...event })}\n`,
  );
}

function positiveInteger(values, name, fallback, maximum) {
  const raw = values.get(name) ?? String(fallback);
  const value = Number(raw);
  if (
    !/^[1-9]\d*$/u.test(raw) ||
    !Number.isSafeInteger(value) ||
    value > maximum
  )
    throw new Error('Invalid configuration');
  return value;
}

function apiIsHealthy(body) {
  try {
    const value = JSON.parse(body);
    return (
      value !== null &&
      typeof value === 'object' &&
      !Array.isArray(value) &&
      value.service === 'prisma-prim-api' &&
      value.status === 'ok'
    );
  } catch {
    return false;
  }
}

async function probe(target, timeout, stopSignal) {
  const deadline = new AbortController();
  const timer = setTimeout(() => deadline.abort(), timeout);
  try {
    const response = await fetch(target.url, {
      redirect: 'manual',
      signal: AbortSignal.any([stopSignal, deadline.signal]),
    });
    if (response.status >= 300 && response.status < 400)
      return { healthy: false, code: 'REDIRECT_REFUSED' };
    if (response.status !== 200) return { healthy: false, code: 'HTTP_STATUS' };
    const reader = response.body?.getReader();
    const chunks = [];
    let length = 0;
    if (reader) {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        length += value.byteLength;
        if (length > 1_024)
          return { healthy: false, code: 'RESPONSE_TOO_LARGE' };
        chunks.push(value);
      }
    }
    let body;
    try {
      // Preserve a leading BOM so literal web and JSON validation cannot turn
      // invalid health bytes into healthy or recovered observations.
      body = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(
        Buffer.concat(chunks),
      );
    } catch {
      return { healthy: false, code: 'INVALID_RESPONSE' };
    }
    const healthy =
      target.service === 'web' ? body === 'ok' : apiIsHealthy(body);
    return { healthy, code: healthy ? 'OK' : 'INVALID_RESPONSE' };
  } catch {
    return {
      healthy: false,
      code: deadline.signal.aborted ? 'TIMEOUT' : 'CONNECTION_FAILED',
    };
  } finally {
    clearTimeout(timer);
    deadline.abort();
  }
}

const stop = new AbortController();
for (const signal of ['SIGINT', 'SIGTERM'])
  process.once(signal, () => stop.abort());

try {
  const values = new Map();
  for (let index = 2; index < process.argv.length; index += 2) {
    const name = process.argv[index];
    const value = process.argv[index + 1];
    if (
      ![
        '--web-origin',
        '--api-origin',
        '--interval-ms',
        '--timeout-ms',
        '--failures',
        '--recoveries',
      ].includes(name) ||
      !value ||
      values.has(name)
    )
      throw new Error('Invalid configuration');
    values.set(name, value);
  }
  const targets = ['web', 'api'].map((service) => {
    const origin = values.get(`--${service}-origin`);
    const originMatch =
      typeof origin === 'string' &&
      origin.match(/^https?:\/\/([^/?#\\]+)\/?$/iu);
    if (
      !originMatch ||
      [...origin].some(
        (character) => character <= ' ' || character === '\u007f',
      ) ||
      originMatch[1].includes('@')
    )
      throw new Error('Invalid configuration');
    const url = new URL(origin);
    if (
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      url.pathname !== '/' ||
      !['http:', 'https:'].includes(url.protocol)
    )
      throw new Error('Invalid configuration');
    const authority = originMatch[1];
    const literalHost = authority.startsWith('[')
      ? authority.slice(1, authority.indexOf(']'))
      : authority.split(':')[0];
    const loopback =
      (isIP(literalHost) === 4 && literalHost.startsWith('127.')) ||
      (isIP(literalHost) === 6 && url.hostname === '[::1]');
    if (url.protocol === 'http:' && !loopback)
      throw new Error('Invalid configuration');
    return {
      service,
      url: new URL(service === 'web' ? '/health' : '/api/health', url),
      observed: false,
      alerted: false,
      failures: 0,
      successes: 0,
    };
  });
  const interval = positiveInteger(values, '--interval-ms', 30_000, 3_600_000);
  const timeout = positiveInteger(values, '--timeout-ms', 5_000, 300_000);
  const failures = positiveInteger(values, '--failures', 3, 1_000);
  const recoveries = positiveInteger(values, '--recoveries', 2, 1_000);
  while (!stop.signal.aborted) {
    await Promise.all(
      targets.map(async (target) => {
        const { healthy, code } = await probe(target, timeout, stop.signal);
        if (stop.signal.aborted) return;
        const emit = (transition, code, count) =>
          writeEvent({ service: target.service, transition, code, count });
        if (healthy) {
          target.failures = 0;
          target.successes = Math.min(target.successes + 1, recoveries);
          if (!target.observed && !target.alerted) {
            target.observed = true;
            emit('healthy', 'OK', 1);
          }
          if (target.alerted && target.successes >= recoveries) {
            target.alerted = false;
            target.observed = true;
            emit('recovered', 'OK', recoveries);
          }
        } else {
          target.successes = 0;
          target.failures = Math.min(target.failures + 1, failures);
          if (!target.alerted && target.failures >= failures) {
            target.alerted = true;
            emit('alert', code, failures);
          }
        }
      }),
    );
    await delay(interval, undefined, { signal: stop.signal }).catch(() => {});
  }
  writeEvent({
    service: 'monitor',
    transition: 'stopped',
    code: 'STOPPED',
    count: 0,
  });
} catch {
  writeEvent(
    {
      service: 'monitor',
      transition: 'configuration_refused',
      code: 'INVALID_CONFIGURATION',
      count: 0,
    },
    process.stderr,
  );
  process.exitCode = 2;
}
