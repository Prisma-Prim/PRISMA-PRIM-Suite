import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import test from 'node:test';

const script = fileURLToPath(
  new URL('./monitor-liveness.mjs', import.meta.url),
);

async function fixture(service, sequence = []) {
  let healthy = true;
  let reply;
  const paths = [];
  const server = createServer((request, response) => {
    paths.push(request.url);
    if (reply) {
      reply(request, response);
      return;
    }
    const observedHealthy = sequence.length
      ? sequence[Math.min(paths.length - 1, sequence.length - 1)]
      : healthy;
    response.statusCode = observedHealthy ? 200 : 503;
    response.end(
      observedHealthy
        ? service === 'web'
          ? 'ok'
          : JSON.stringify({ service: 'prisma-prim-api', status: 'ok' })
        : 'synthetic unavailable',
    );
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  assert.ok(address && typeof address === 'object');
  return {
    origin: `http://127.0.0.1:${address.port}`,
    paths,
    fail: () => (healthy = false),
    recover: () => (healthy = true),
    reply: (handler) => (reply = handler),
    close: async () => {
      server.closeAllConnections();
      await new Promise((resolve) => server.close(resolve));
    },
  };
}

function monitor(origins, options = {}, extraArgs = []) {
  const child = spawn(
    process.execPath,
    [
      script,
      ...Object.entries({
        '--web-origin': origins.web,
        '--api-origin': origins.api,
        '--interval-ms': '10',
        '--timeout-ms': '500',
        '--failures': '2',
        '--recoveries': '2',
        ...options,
      })
        .filter(([, value]) => value !== null)
        .flat(),
      ...extraArgs,
    ],
    { stdio: ['ignore', 'pipe', 'pipe'] },
  );
  let stdout = '';
  let stderr = '';
  child.stdout.setEncoding('utf8').on('data', (chunk) => (stdout += chunk));
  child.stderr.setEncoding('utf8').on('data', (chunk) => (stderr += chunk));
  const closed = once(child, 'close');
  const events = () => {
    const lastCompleteLine = stdout.lastIndexOf('\n');
    return lastCompleteLine < 0
      ? []
      : stdout
          .slice(0, lastCompleteLine)
          .split('\n')
          .filter(Boolean)
          .map((line) => JSON.parse(line));
  };
  return {
    result: closed,
    stdout: () => stdout,
    events,
    stderr: () => stderr,
    waitFor: async (predicate, label) => {
      const deadline = Date.now() + 3_000;
      while (Date.now() < deadline) {
        if (predicate()) return;
        if (child.exitCode !== null) break;
        await delay(10);
      }
      assert.ok(predicate(), `${label}; observed ${stdout}; stderr ${stderr}`);
    },
    stop: async (signal = 'SIGTERM') => {
      if (child.exitCode === null && child.signalCode === null) {
        child.kill(signal);
        const watchdog = setTimeout(() => child.kill('SIGKILL'), 1_000);
        try {
          const [code, signal] = await closed;
          assert.equal(signal, null);
          assert.equal(code, 0);
          assert.ok(
            !stdout || stdout.endsWith('\n'),
            'all emitted records must be complete JSON lines',
          );
          events();
        } finally {
          clearTimeout(watchdog);
        }
      }
    },
  };
}

test(
  'the public CLI alerts and reports observed recovery for both real health services',
  { timeout: 8_000 },
  async (t) => {
    const web = await fixture('web');
    const api = await fixture('api');
    t.after(async () => {
      await Promise.all([web.close(), api.close()]);
    });
    const process = monitor({ web: web.origin, api: api.origin });
    t.after(() => process.stop());
    const has = (service, transition) =>
      process
        .events()
        .some(
          (event) =>
            event.service === service && event.transition === transition,
        );

    await process.waitFor(
      () => has('web', 'healthy') && has('api', 'healthy'),
      'both admitted services were observed healthy',
    );
    assert.ok(web.paths.every((path) => path === '/health'));
    assert.ok(api.paths.every((path) => path === '/api/health'));
    web.fail();
    api.fail();
    await process.waitFor(
      () => has('web', 'alert') && has('api', 'alert'),
      'both real failures must alert',
    );
    web.recover();
    api.recover();
    await process.waitFor(
      () => has('web', 'recovered') && has('api', 'recovered'),
      'observed success must recover',
    );
    for (const service of ['web', 'api']) {
      assert.deepEqual(
        process
          .events()
          .filter((event) => event.service === service)
          .map((event) => event.transition),
        ['healthy', 'alert', 'recovered'],
      );
    }
    assert.equal(process.stderr(), '');
  },
);

test(
  'real transport ordering keeps streaks independent, resets interruptions and emits no repeated alert',
  { timeout: 6_000 },
  async (t) => {
    const web = await fixture('web');
    const api = await fixture('api');
    const observations = [
      false,
      true,
      false,
      false,
      false,
      false,
      true,
      false,
      true,
      true,
    ];
    web.reply((_request, response) => {
      const ordinal = web.paths.length;
      if (ordinal === 6) return response.end('changed failure category');
      const healthy =
        observations[Math.min(ordinal - 1, observations.length - 1)];
      response.writeHead(healthy ? 200 : 503);
      response.end(healthy ? 'ok' : 'not available');
    });
    t.after(async () => {
      await Promise.all([web.close(), api.close()]);
    });
    const process = monitor(
      { web: web.origin, api: api.origin },
      { '--failures': null, '--recoveries': null },
    );
    t.after(() => process.stop());
    await process.waitFor(
      () =>
        web.paths.length >= 13 &&
        process
          .events()
          .some(
            (event) =>
              event.service === 'web' && event.transition === 'recovered',
          ),
      'fixed transport sequence must complete and remain quiet after recovery',
    );
    assert.deepEqual(
      process
        .events()
        .filter((event) => event.service === 'web')
        .map(({ transition, count }) => ({ transition, count })),
      [
        { transition: 'healthy', count: 1 },
        { transition: 'alert', count: 3 },
        { transition: 'recovered', count: 2 },
      ],
    );
    assert.deepEqual(
      process
        .events()
        .filter((event) => event.service === 'api')
        .map((event) => event.transition),
      ['healthy'],
    );
  },
);

test(
  'SIGINT and SIGTERM stop actual outstanding body reads within the bounded grace',
  { timeout: 6_000 },
  async (t) => {
    for (const signal of ['SIGINT', 'SIGTERM']) {
      await t.test(signal, async (t) => {
        const web = await fixture('web');
        const api = await fixture('api');
        web.reply((_request, response) => {
          response.writeHead(200);
          response.write('partial');
        });
        t.after(async () => {
          await Promise.all([web.close(), api.close()]);
        });
        const process = monitor(
          { web: web.origin, api: api.origin },
          { '--timeout-ms': '30000' },
        );
        t.after(() => process.stop());
        await process.waitFor(
          () => web.paths.length > 0 && api.paths.length > 0,
          'both actual requests must have started',
        );
        await process.stop(signal);
        assert.ok(
          !process
            .events()
            .some(
              (event) =>
                event.service === 'web' && event.transition === 'healthy',
            ),
        );
        assert.deepEqual(
          process
            .events()
            .filter((event) => event.service === 'monitor')
            .map(({ transition, code, count }) => ({
              transition,
              code,
              count,
            })),
          [{ transition: 'stopped', code: 'STOPPED', count: 0 }],
        );
        assert.equal(process.stderr(), '');
      });
    }
  },
);

test(
  'valid API health JSON is decoded by meaning rather than serialization order',
  { timeout: 5_000 },
  async (t) => {
    const web = await fixture('web');
    const api = await fixture('api');
    api.reply((_request, response) =>
      response.end('{ "status": "ok", "service": "prisma-prim-api" }'),
    );
    t.after(async () => {
      await Promise.all([web.close(), api.close()]);
    });
    const process = monitor({ web: web.origin, api: api.origin });
    t.after(() => process.stop());
    await process.waitFor(
      () =>
        process
          .events()
          .some(
            (event) =>
              event.service === 'api' && event.transition === 'healthy',
          ),
      'valid reordered health JSON must establish actual API health',
    );
    assert.ok(
      !process
        .events()
        .some(
          (event) => event.service === 'api' && event.transition === 'alert',
        ),
    );
  },
);

test(
  'the public CLI rejects unsafe health responses with bounded sanitized diagnostics',
  { timeout: 12_000 },
  async (t) => {
    const secret = 'CONFIDENTIAL_MONITOR_FIXTURE_738';
    for (const scenario of [
      {
        name: 'redirect',
        code: 'REDIRECT_REFUSED',
        reply: (response, web) => {
          response.writeHead(302, {
            location: `${web.origin}/must-not-follow`,
          });
          response.end(secret);
        },
      },
      {
        name: 'oversized JSON',
        code: 'RESPONSE_TOO_LARGE',
        reply: (response) =>
          response.end(
            `{"service":"prisma-prim-api","status":"ok","data":"${secret}${'x'.repeat(2_048)}"}`,
          ),
      },
      {
        name: 'malformed JSON',
        code: 'INVALID_RESPONSE',
        reply: (response) => response.end(`{"service":${secret}`),
      },
      {
        name: 'HTML login fallback',
        code: 'INVALID_RESPONSE',
        reply: (response) => response.end(`<html>${secret}</html>`),
      },
      {
        name: 'stalled body',
        code: 'TIMEOUT',
        reply: (response) => {
          response.writeHead(200);
          response.write('{');
        },
      },
      {
        name: 'connection failure',
        code: 'CONNECTION_FAILED',
        reply: (response) => response.destroy(),
      },
      {
        name: 'non-success status',
        code: 'HTTP_STATUS',
        reply: (response) => {
          response.writeHead(503);
          response.end(secret);
        },
      },
    ]) {
      await t.test(scenario.name, { timeout: 4_000 }, async (t) => {
        const web = await fixture('web');
        const api = await fixture('api');
        api.reply((_request, response) => scenario.reply(response, web));
        t.after(async () => {
          await Promise.all([web.close(), api.close()]);
        });
        const process = monitor(
          { web: web.origin, api: api.origin },
          {
            '--failures': '1',
            '--timeout-ms': scenario.name === 'stalled body' ? '80' : '500',
          },
        );
        t.after(() => process.stop());
        await process.waitFor(
          () =>
            process
              .events()
              .some(
                (event) =>
                  event.service === 'api' && event.transition === 'alert',
              ),
          'unsafe API response must alert',
        );
        assert.ok(
          web.paths.every((path) => path === '/health'),
          'redirect never reaches another path',
        );
        const alert = process
          .events()
          .find(
            (event) => event.service === 'api' && event.transition === 'alert',
          );
        assert.equal(alert.code, scenario.code);
        assert.equal(alert.count, 1);
        assert.equal(alert.version, 1);
        assert.equal(new Date(alert.timestamp).toISOString(), alert.timestamp);
        assert.equal(alert.guide, 'docs/agents/railway-activation.md');
        assert.ok(!process.stdout().includes(secret));
        assert.ok(!process.stderr().includes(secret));
        assert.ok(!process.stdout().includes(web.origin));
        assert.ok(!process.stdout().includes(api.origin));
        assert.ok(
          !process
            .events()
            .some(
              (event) =>
                event.service === 'api' && event.transition === 'healthy',
            ),
        );
      });
    }
  },
);

test(
  'the public CLI refuses a nonliteral loopback HTTP origin before any request without echoing it',
  { timeout: 5_000 },
  async (t) => {
    const web = await fixture('web');
    const api = await fixture('api');
    t.after(async () => {
      await Promise.all([web.close(), api.close()]);
    });
    const process = monitor({
      web: web.origin.replace('127.0.0.1', 'localhost'),
      api: api.origin,
    });
    t.after(() => process.stop());
    const result = await Promise.race([
      process.result,
      delay(1_000).then(() => null),
    ]);
    assert.deepEqual(
      result,
      [2, null],
      'invalid origin must terminate with the configuration refusal code',
    );
    assert.deepEqual(web.paths, []);
    assert.deepEqual(api.paths, []);
    assert.equal(process.stdout(), '');
    assert.ok(!process.stderr().includes('localhost'));
    assert.equal(JSON.parse(process.stderr()).code, 'INVALID_CONFIGURATION');
  },
);

test(
  'out-of-bounds timing is refused before either service is contacted',
  { timeout: 5_000 },
  async (t) => {
    const web = await fixture('web');
    const api = await fixture('api');
    t.after(async () => {
      await Promise.all([web.close(), api.close()]);
    });
    const process = monitor(
      { web: web.origin, api: api.origin },
      { '--interval-ms': '2147483648' },
    );
    t.after(() => process.stop());
    const result = await Promise.race([
      process.result,
      delay(1_000).then(() => null),
    ]);
    assert.deepEqual(result, [2, null]);
    assert.deepEqual(web.paths, []);
    assert.deepEqual(api.paths, []);
    const refusal = JSON.parse(process.stderr());
    assert.equal(refusal.code, 'INVALID_CONFIGURATION');
    assert.equal(refusal.count, 0);
    assert.equal(new Date(refusal.timestamp).toISOString(), refusal.timestamp);
    assert.equal(refusal.guide, 'docs/agents/railway-activation.md');
  },
);

test(
  'configuration failures sanitize every refused origin and option before any service I/O',
  { timeout: 15_000 },
  async (t) => {
    const secret = 'CONFIDENTIAL_ARGUMENT_738';
    const web = await fixture('web');
    const api = await fixture('api');
    t.after(async () => {
      await Promise.all([web.close(), api.close()]);
    });
    for (const scenario of [
      {
        name: 'credentials',
        options: {
          '--api-origin': api.origin.replace('http://', `http://${secret}@`),
        },
      },
      { name: 'query', options: { '--api-origin': `${api.origin}?${secret}` } },
      { name: 'empty query', options: { '--api-origin': `${api.origin}?` } },
      {
        name: 'fragment',
        options: { '--api-origin': `${api.origin}#${secret}` },
      },
      { name: 'path', options: { '--api-origin': `${api.origin}/${secret}` } },
      { name: 'missing origin', options: { '--api-origin': '' } },
      { name: 'unknown option', options: { '--unexpected': secret } },
      { name: 'duplicate option', extraArgs: ['--web-origin', web.origin] },
      { name: 'zero interval', options: { '--interval-ms': '0' } },
      { name: 'fractional timeout', options: { '--timeout-ms': '0.5' } },
      { name: 'unbounded timeout', options: { '--timeout-ms': '300001' } },
      { name: 'nonfinite threshold', options: { '--failures': 'Infinity' } },
      { name: 'excessive threshold', options: { '--recoveries': '1001' } },
    ]) {
      await t.test(scenario.name, { timeout: 2_000 }, async (t) => {
        const process = monitor(
          { web: web.origin, api: api.origin },
          scenario.options,
          scenario.extraArgs,
        );
        t.after(() => process.stop());
        assert.deepEqual(await process.result, [2, null]);
        assert.equal(process.stdout(), '');
        assert.ok(!process.stderr().includes(secret));
        assert.ok(!process.stderr().includes(web.origin));
        assert.ok(!process.stderr().includes(api.origin));
        const refusal = JSON.parse(process.stderr());
        assert.equal(refusal.service, 'monitor');
        assert.equal(refusal.transition, 'configuration_refused');
        assert.equal(refusal.code, 'INVALID_CONFIGURATION');
        assert.equal(refusal.count, 0);
        assert.equal(refusal.version, 1);
        assert.equal(
          new Date(refusal.timestamp).toISOString(),
          refusal.timestamp,
        );
      });
    }
    assert.deepEqual(web.paths, []);
    assert.deepEqual(api.paths, []);
  },
);

test(
  'the web health body is literal and an HTML or whitespace fallback never counts as healthy',
  { timeout: 6_000 },
  async (t) => {
    for (const body of ['ok\n', '<html>ok</html>']) {
      await t.test(JSON.stringify(body), async (t) => {
        const web = await fixture('web');
        const api = await fixture('api');
        web.reply((_request, response) => response.end(body));
        t.after(async () => {
          await Promise.all([web.close(), api.close()]);
        });
        const process = monitor(
          { web: web.origin, api: api.origin },
          { '--failures': '1' },
        );
        t.after(() => process.stop());
        await process.waitFor(
          () =>
            process
              .events()
              .some(
                (event) =>
                  event.service === 'web' && event.transition === 'alert',
              ),
          'wrong literal web response must alert',
        );
        assert.equal(
          process
            .events()
            .find(
              (event) =>
                event.service === 'web' && event.transition === 'alert',
            ).code,
          'INVALID_RESPONSE',
        );
        assert.ok(
          !process
            .events()
            .some(
              (event) =>
                event.service === 'web' && event.transition === 'healthy',
            ),
        );
      });
    }
  },
);

test(
  'a service first observed failing recovers only after consecutive successes without a false initial healthy event',
  { timeout: 8_000 },
  async (t) => {
    const web = await fixture('web', [false, false, true, false, true, true]);
    const api = await fixture('api');
    t.after(async () => {
      await Promise.all([web.close(), api.close()]);
    });
    const process = monitor({ web: web.origin, api: api.origin });
    t.after(() => process.stop());
    await process.waitFor(
      () =>
        process
          .events()
          .some(
            (event) =>
              event.service === 'web' && event.transition === 'recovered',
          ),
      'the initially failing service must recover after its interrupted success streak',
    );
    assert.deepEqual(
      process
        .events()
        .filter((event) => event.service === 'web')
        .map(({ transition, count }) => ({ transition, count })),
      [
        { transition: 'alert', count: 2 },
        { transition: 'recovered', count: 2 },
      ],
    );
    assert.deepEqual(
      process
        .events()
        .filter((event) => event.service === 'api')
        .map((event) => event.transition),
      ['healthy'],
    );
    assert.ok(web.paths.length >= 6);
  },
);

test(
  'the public CLI rejects leading UTF-8 BOM and malformed UTF-8 health bytes for either service',
  { timeout: 10_000 },
  async (t) => {
    const bom = Buffer.from([0xef, 0xbb, 0xbf]);
    for (const scenario of [
      {
        name: 'web BOM',
        service: 'web',
        body: Buffer.concat([bom, Buffer.from('ok')]),
      },
      {
        name: 'API BOM',
        service: 'api',
        body: Buffer.concat([
          bom,
          Buffer.from('{"status":"ok","service":"prisma-prim-api"}'),
        ]),
      },
      {
        name: 'web malformed UTF-8',
        service: 'web',
        body: Buffer.from([0xc3, 0x28, 0x6f, 0x6b]),
      },
      {
        name: 'API malformed UTF-8',
        service: 'api',
        body: Buffer.concat([
          Buffer.from('{"service":"prisma-prim-api","status":"ok","detail":"'),
          Buffer.from([0xc3, 0x28]),
          Buffer.from('"}'),
        ]),
      },
    ]) {
      await t.test(scenario.name, { timeout: 4_000 }, async (t) => {
        const web = await fixture('web');
        const api = await fixture('api');
        const target = scenario.service === 'web' ? web : api;
        target.reply((_request, response) => response.end(scenario.body));
        t.after(async () => {
          await Promise.all([web.close(), api.close()]);
        });
        const process = monitor({ web: web.origin, api: api.origin });
        t.after(() => process.stop());
        await process.waitFor(
          () =>
            process
              .events()
              .some(
                (event) =>
                  event.service === scenario.service &&
                  event.transition === 'alert',
              ),
          'invalid byte-level health response must alert rather than establish health',
        );
        assert.ok(target.paths.length >= 2);
        assert.deepEqual(
          process
            .events()
            .filter((event) => event.service === scenario.service)
            .map(({ transition, code }) => ({ transition, code })),
          [{ transition: 'alert', code: 'INVALID_RESPONSE' }],
        );
        assert.equal(process.stderr(), '');
      });
    }
  },
);

test(
  'an alerted web service remains unrecovered on BOM-prefixed bytes until literal valid observations return',
  { timeout: 8_000 },
  async (t) => {
    const web = await fixture('web');
    const api = await fixture('api');
    t.after(async () => {
      await Promise.all([web.close(), api.close()]);
    });
    const process = monitor({ web: web.origin, api: api.origin });
    t.after(() => process.stop());
    const has = (service, transition) =>
      process
        .events()
        .some(
          (event) =>
            event.service === service && event.transition === transition,
        );
    await process.waitFor(
      () => has('web', 'healthy') && has('api', 'healthy'),
      'both services must first be observed healthy',
    );
    assert.ok(web.paths.length > 0 && api.paths.length > 0);
    web.fail();
    await process.waitFor(
      () => has('web', 'alert'),
      'real web failure must alert',
    );
    let bomResponses = 0;
    web.reply((_request, response) => {
      bomResponses += 1;
      response.end(Buffer.from([0xef, 0xbb, 0xbf, 0x6f, 0x6b]));
    });
    await process.waitFor(
      () => bomResponses >= 4,
      'multiple BOM responses must pass through the actual transport',
    );
    api.fail();
    await process.waitFor(
      () => has('api', 'alert'),
      'a subsequent API alert provides an ordered stdout barrier after the BOM observations',
    );
    assert.deepEqual(
      process
        .events()
        .filter((event) => event.service === 'web')
        .map((event) => event.transition),
      ['healthy', 'alert'],
    );
    web.reply((_request, response) => response.end('ok'));
    api.recover();
    await process.waitFor(
      () => has('web', 'recovered') && has('api', 'recovered'),
      'only later actual valid health observations recover the services',
    );
    for (const service of ['web', 'api']) {
      assert.deepEqual(
        process
          .events()
          .filter((event) => event.service === service)
          .map((event) => event.transition),
        ['healthy', 'alert', 'recovered'],
      );
    }
    assert.equal(process.stderr(), '');
  },
);

async function silentTcpFixture() {
  const { createServer: createTcpServer } = await import('node:net');
  const sockets = new Set();
  let accepted = 0;
  let peakSockets = 0;
  let receivedBytes = 0;
  let closedHandshakes = 0;
  const server = createTcpServer((socket) => {
    accepted += 1;
    sockets.add(socket);
    peakSockets = Math.max(peakSockets, sockets.size);
    let received = false;
    socket.on('close', () => {
      sockets.delete(socket);
      if (received) closedHandshakes += 1;
    });
    socket.on('error', () => {});
    socket.on('data', (chunk) => {
      received = true;
      receivedBytes += chunk.length;
    });
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  assert.ok(address && typeof address === 'object');
  return {
    origin: `https://127.0.0.1:${address.port}`,
    accepted: () => accepted,
    peakSockets: () => peakSockets,
    receivedBytes: () => receivedBytes,
    closedHandshakes: () => closedHandshakes,
    openSockets: () => sockets.size,
    close: async () => {
      for (const socket of sockets) socket.destroy();
      await new Promise((resolve) => server.close(resolve));
    },
  };
}

async function assertOwnedCleanup(predicate, label) {
  const deadline = Date.now() + 1_000;
  while (!predicate() && Date.now() < deadline) await delay(10);
  assert.ok(predicate(), label);
}

async function assertSocketsClosed(server) {
  await assertOwnedCleanup(
    () => server.openSockets() === 0,
    'all owned TCP sockets must close',
  );
}

test(
  'the public CLI destroys a stalled TLS connection at the probe deadline',
  { timeout: 6_000 },
  async (t) => {
    const tls = await silentTcpFixture();
    const api = await fixture('api');
    const process = monitor(
      { web: tls.origin, api: api.origin },
      {
        '--timeout-ms': '100',
        '--interval-ms': '10',
        '--failures': '1',
      },
    );
    t.after(async () => {
      try {
        await process.stop();
      } finally {
        await Promise.all([tls.close(), api.close()]);
      }
    });
    await process.waitFor(
      () => tls.accepted() > 0 && tls.receivedBytes() > 0,
      'the real TCP peer received a TLS ClientHello without replying',
    );
    await process.waitFor(
      () =>
        process
          .events()
          .some(
            (event) =>
              event.service === 'web' &&
              event.transition === 'alert' &&
              event.code === 'TIMEOUT',
          ),
      'the stalled handshake must reach the probe deadline',
    );
    await assertOwnedCleanup(
      () => tls.closedHandshakes() > 0,
      'a real unanswered TLS handshake must close at its deadline',
    );
    assert.equal(
      tls.peakSockets(),
      1,
      'deadline cleanup precedes the next probe',
    );
    await process.stop();
    await assertSocketsClosed(tls);
    assert.equal(process.stderr(), '');
    assert.equal(
      process.events().filter((event) => event.code === 'STOPPED').length,
      1,
    );
  },
);

for (const signal of ['SIGINT', 'SIGTERM']) {
  test(
    `the public CLI exits and closes a pending TLS handshake on ${signal}`,
    { timeout: 6_000 },
    async (t) => {
      const tls = await silentTcpFixture();
      const api = await fixture('api');
      const process = monitor(
        { web: tls.origin, api: api.origin },
        { '--timeout-ms': '30000', '--interval-ms': '30000' },
      );
      t.after(async () => {
        try {
          await process.stop();
        } finally {
          await Promise.all([tls.close(), api.close()]);
        }
      });
      await process.waitFor(
        () => tls.accepted() > 0 && tls.receivedBytes() > 0,
        'the real TCP peer received a TLS ClientHello without replying',
      );
      await process.stop(signal);
      await assertSocketsClosed(tls);
      assert.equal(process.stderr(), '');
      assert.deepEqual(
        process.events().filter((event) => event.service === 'web'),
        [],
      );
      assert.equal(
        process.events().filter((event) => event.code === 'STOPPED').length,
        1,
      );
    },
  );
}

test(
  'repeated public TLS deadlines do not accumulate pending connections',
  { timeout: 6_000 },
  async (t) => {
    const tls = await silentTcpFixture();
    const api = await fixture('api');
    const process = monitor(
      { web: tls.origin, api: api.origin },
      { '--timeout-ms': '80', '--failures': '1' },
    );
    t.after(async () => {
      try {
        await process.stop();
      } finally {
        await Promise.all([tls.close(), api.close()]);
      }
    });
    await process.waitFor(
      () => tls.accepted() >= 3,
      'three real TLS attempts must reach the silent TCP peer',
    );
    await process.stop();
    await assertSocketsClosed(tls);
    assert.equal(
      tls.peakSockets(),
      1,
      'rounds must release the previous socket',
    );
    assert.deepEqual(
      process
        .events()
        .filter((event) => event.service === 'web')
        .map((event) => [event.transition, event.code]),
      [['alert', 'TIMEOUT']],
    );
    assert.equal(process.stderr(), '');
  },
);

test(
  'the public CLI deadline closes HTTP connections that never send headers',
  { timeout: 6_000 },
  async (t) => {
    const peer = await silentTcpFixture();
    const api = await fixture('api');
    const process = monitor(
      { web: peer.origin.replace('https:', 'http:'), api: api.origin },
      {
        '--timeout-ms': '100',
        '--interval-ms': '30000',
        '--failures': '1',
      },
    );
    t.after(async () => {
      try {
        await process.stop();
      } finally {
        await Promise.all([peer.close(), api.close()]);
      }
    });
    await process.waitFor(
      () => peer.accepted() > 0 && peer.receivedBytes() > 0,
      'the real TCP peer must receive the HTTP request without replying',
    );
    await process.waitFor(
      () =>
        process
          .events()
          .some((event) => event.service === 'web' && event.code === 'TIMEOUT'),
      'missing HTTP headers must reach the same probe deadline',
    );
    await assertSocketsClosed(peer);
    await process.stop();
    assert.equal(process.stderr(), '');
  },
);
