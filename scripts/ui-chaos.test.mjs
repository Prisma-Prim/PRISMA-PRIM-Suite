import assert from 'node:assert/strict';
import test from 'node:test';
import {
  MAXIMUM_CHAOS_SEED,
  chaosReplayCommand,
  chaosRunSeed,
  createChaosPlan,
  parseChaosSeed,
  randomChaosSeed,
  requestKeyPath,
} from './ui-chaos.mjs';

const origin = 'http://127.0.0.1:4173';
const companyA = '0f6d6c4e-1b2a-4c3d-8e9f-0a1b2c3d4e5f';
const companyB = '9e8d7c6b-5a49-4382-9716-a5b4c3d2e1f0';

/** One journey's requests and clicks, in the order the browser makes them. */
function drive(plan, ids) {
  return {
    delays: [
      plan.responseDelay({
        method: 'GET',
        url: `${origin}/api/companies`,
        companyContextId: undefined,
      }),
      plan.responseDelay({
        method: 'GET',
        url: `${origin}/api/projects?search=${ids.suffix}`,
        companyContextId: ids.a,
      }),
      plan.responseDelay({
        method: 'GET',
        url: `${origin}/api/projects/${ids.project}/tasks`,
        companyContextId: ids.a,
      }),
      plan.responseDelay({
        method: 'GET',
        url: `${origin}/api/projects?search=${ids.suffix}`,
        companyContextId: ids.b,
      }),
      plan.responseDelay({
        method: 'POST',
        url: `${origin}/api/projects/${ids.project}/tasks`,
        companyContextId: ids.a,
      }),
    ],
    doubles: [1, 2, 3, 4, 5, 6].map((index) =>
      plan.doubleSubmit(`Record ${index}`),
    ),
    backs: [1, 2, 3, 4, 5, 6].map((index) => plan.backAndForward(`#s${index}`)),
  };
}

const firstRun = {
  a: companyA,
  b: companyB,
  project: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
  suffix: 'one',
};
// Another run of the same journey creates other records.
const secondRun = {
  a: '11111111-2222-4333-8444-555555555555',
  b: '66666666-7777-4888-8999-aaaaaaaaaaaa',
  project: 'bbbbbbbb-cccc-4ddd-8eee-ffffffffffff',
  suffix: 'two',
};

test('the same seed and scope give the same plan, whatever the record identifiers', () => {
  const scope = 'operational-acceptance-narrow';
  const first = createChaosPlan({ seed: 1234, scope });
  const second = createChaosPlan({ seed: 1234, scope });
  assert.deepEqual(
    [first.cpuThrottleRate, first.laggedContext, first.lagMilliseconds],
    [second.cpuThrottleRate, second.laggedContext, second.lagMilliseconds],
  );
  assert.deepEqual(drive(first, firstRun), drive(second, secondRun));
  assert.deepEqual(
    first.log.map(({ kind }) => kind),
    second.log.map(({ kind }) => kind),
  );
});

test('another seed or another width draws another plan', () => {
  const plans = [
    createChaosPlan({ seed: 1234, scope: 'operational-acceptance-desktop' }),
    createChaosPlan({ seed: 1235, scope: 'operational-acceptance-desktop' }),
    createChaosPlan({ seed: 1234, scope: 'operational-acceptance-narrow' }),
  ].map((plan) => JSON.stringify(drive(plan, firstRun)));
  assert.equal(new Set(plans).size, 3);
});

test('delays stay within the plan bounds, with a fast majority and a slow tail', () => {
  // One Company context is never lagged, whatever the seed.
  const delays = [];
  for (let seed = 1; seed <= 200; seed += 1) {
    const plan = createChaosPlan({ seed, scope: 'desktop' });
    for (let index = 0; index < 20; index += 1)
      delays.push(
        plan.responseDelay({
          method: 'GET',
          url: `${origin}/api/clients`,
          companyContextId: companyA,
        }),
      );
  }
  assert.ok(delays.every((delay) => delay >= 0 && delay <= 2500));
  const fast = delays.filter((delay) => delay <= 120).length / delays.length;
  const slow = delays.filter((delay) => delay > 700).length / delays.length;
  assert.ok(fast > 0.45 && fast < 0.65, `fast share ${fast}`);
  assert.ok(slow > 0.05 && slow < 0.15, `slow share ${slow}`);
});

test('a lagged Company context answers late once a second one has appeared', () => {
  let lagged;
  for (let seed = 1; !lagged; seed += 1) {
    const plan = createChaosPlan({ seed, scope: 'desktop' });
    if (plan.laggedContext === 'c1') lagged = plan;
  }
  assert.ok(lagged.lagMilliseconds >= 400 && lagged.lagMilliseconds <= 1500);
  const read = (companyContextId) =>
    lagged.responseDelay({
      method: 'GET',
      url: `${origin}/api/clients`,
      companyContextId,
    });
  // Alone, Company A is not slowed; once B appeared, A always answers late.
  const alone = Array.from({ length: 30 }, () => read(companyA));
  assert.ok(alone.some((delay) => delay < lagged.lagMilliseconds));
  read(companyB);
  for (let index = 0; index < 10; index += 1)
    assert.ok(read(companyA) >= lagged.lagMilliseconds);
  assert.match(lagged.describe(), /Company context c1 lagged by \d+ ms/u);
});

test('every decision is recorded in the plan log', () => {
  const plan = createChaosPlan({ seed: 99, scope: 'desktop' });
  drive(plan, firstRun);
  assert.equal(plan.log.length, 5 + 6 + 6);
  assert.deepEqual(plan.log[1], {
    kind: 'delay',
    key: 'GET /api/projects @c1 #1',
    milliseconds: plan.log[1].milliseconds,
  });
  assert.equal(plan.log[3].key, 'GET /api/projects @c2 #1');
  assert.equal(plan.log[4].key, 'POST /api/projects/:id/tasks @c1 #1');
  assert.deepEqual(Object.keys(plan.log[5]), [
    'kind',
    'count',
    'name',
    'chosen',
  ]);
  assert.match(plan.describe(), /^CPU slowed [124]x, /u);
});

test('request keys drop identifiers, numbers and the query string', () => {
  assert.equal(
    requestKeyPath(
      `${origin}/api/certification-cases/${companyA}/stages/2?language=en`,
    ),
    '/api/certification-cases/:id/stages/:n',
  );
});

test('seeds parse strictly and every repetition has its own replayable seed', () => {
  assert.equal(parseChaosSeed('1234'), 1234);
  assert.equal(parseChaosSeed(String(MAXIMUM_CHAOS_SEED)), MAXIMUM_CHAOS_SEED);
  for (const text of [
    undefined,
    '',
    '0',
    '-1',
    '01',
    '1.5',
    '12a',
    String(MAXIMUM_CHAOS_SEED + 1),
    'random',
  ])
    assert.equal(parseChaosSeed(text), null, String(text));
  const seed = randomChaosSeed();
  assert.ok(Number.isInteger(seed) && seed >= 1 && seed <= MAXIMUM_CHAOS_SEED);

  assert.equal(chaosRunSeed(1234, 1), 1234);
  const seeds = [1, 2, 3, 4].map((run) => chaosRunSeed(1234, run));
  assert.equal(new Set(seeds).size, 4);
  assert.deepEqual(
    seeds,
    [1, 2, 3, 4].map((run) => chaosRunSeed(1234, run)),
  );
  for (const runSeed of seeds)
    assert.equal(parseChaosSeed(String(runSeed)), runSeed);
  assert.equal(
    chaosReplayCommand('multi-company-home', 77),
    'pnpm verify:journey multi-company-home --chaos 77',
  );
});
