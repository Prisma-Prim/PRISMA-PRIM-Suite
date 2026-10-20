import { setTimeout as delay } from 'node:timers/promises';
import { isIP } from 'node:net';
import * as http from 'node:http';
import * as https from 'node:https';

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

function probe(target, timeout, stopSignal) {
  if (stopSignal.aborted)
    return Promise.resolve({ healthy: false, code: 'CONNECTION_FAILED' });
  return new Promise((resolve) => {
    const transport = target.url.protocol === 'https:' ? https : http;
    const agent = new transport.Agent({ keepAlive: false });
    let request;
    let response;
    let socket;
    let socketClosed = Promise.resolve();
    let requestClosed = Promise.resolve();
    let settled = false;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      stopSignal.removeEventListener('abort', cancelled);
      response?.destroy();
      request?.destroy();
      socket?.destroy();
      agent.destroy();
      // A request can be cancelled before its socket is assigned. Wait for the
      // request close first, then for any socket it acquired, before reporting.
      void requestClosed.then(() => socketClosed).then(() => resolve(result));
    };
    const failed = () => finish({ healthy: false, code: 'CONNECTION_FAILED' });
    const cancelled = () => failed();
    const timer = setTimeout(
      () => finish({ healthy: false, code: 'TIMEOUT' }),
      timeout,
    );
    stopSignal.addEventListener('abort', cancelled, { once: true });
    try {
      request = transport.request(target.url, { agent }, (incoming) => {
        response = incoming;
        incoming.on('error', failed);
        incoming.on('aborted', failed);
        incoming.on('close', () => {
          if (!incoming.complete) failed();
        });
        if (settled) {
          incoming.destroy();
          return;
        }
        if (incoming.statusCode >= 300 && incoming.statusCode < 400) {
          finish({ healthy: false, code: 'REDIRECT_REFUSED' });
          return;
        }
        if (incoming.statusCode !== 200) {
          finish({ healthy: false, code: 'HTTP_STATUS' });
          return;
        }
        const chunks = [];
        let length = 0;
        incoming.on('data', (chunk) => {
          length += chunk.length;
          if (length > 1_024) {
            finish({ healthy: false, code: 'RESPONSE_TOO_LARGE' });
            return;
          }
          chunks.push(chunk);
        });
        incoming.on('end', () => {
          if (settled) return;
          let body;
          try {
            // Preserve a leading BOM so literal web and JSON validation cannot
            // turn invalid health bytes into healthy or recovered observations.
            body = new TextDecoder('utf-8', {
              fatal: true,
              ignoreBOM: true,
            }).decode(Buffer.concat(chunks));
          } catch {
            finish({ healthy: false, code: 'INVALID_RESPONSE' });
            return;
          }
          const healthy =
            target.service === 'web' ? body === 'ok' : apiIsHealthy(body);
          finish({ healthy, code: healthy ? 'OK' : 'INVALID_RESPONSE' });
        });
      });
      requestClosed = new Promise((closed) => request.once('close', closed));
      request.on('error', failed);
      request.on('socket', (assigned) => {
        socket = assigned;
        socketClosed = new Promise((closed) => assigned.once('close', closed));
        if (settled) assigned.destroy();
      });
      request.end();
    } catch {
      failed();
    }
  });
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
