import { nightsInComment } from './nightly-ui-chaos-report.mjs';

const SOURCES = [
  {
    name: 'Nightly fuzz',
    workflow: 'nightly-fuzz.yml',
    job: /^fuzz \((?<target>[^)]+)\)$/u,
  },
  {
    name: 'Nightly UI chaos',
    workflow: 'nightly-ui-chaos.yml',
    job: /^chaos \((?<target>[^)]+)\)$/u,
  },
];

const PAGE_SIZE = 100;
const TRIAGE =
  /<!-- fuzz-triage: (nightly-fuzz|nightly-ui-chaos) (\d+) ([a-z0-9-]+) (product-defect|false-alert)(?: #(\d+))? -->/gu;
const UI_TRIAGE =
  /^<!-- triage-ui-chaos-(\d+)-([a-z0-9-]+) -->[\s\S]*\bis a test false alarm\b/iu;
const API_REPORT = '<!-- nightly-fuzz: failed -->';
const trusted = ({ author_association: role }) =>
  ['OWNER', 'MEMBER', 'COLLABORATOR'].includes(role);
const hasFailure = ({ conclusion }) =>
  ['failure', 'timed_out', 'startup_failure', 'action_required'].includes(
    conclusion,
  );
const alertKey = (workflow, runId, target) =>
  [workflow, runId, target].join(':');

async function readPages(get, path, key) {
  const result = [];
  for (let page = 1; ; page += 1) {
    const separator = path.includes('?') ? '&' : '?';
    const response = await get(
      path + separator + 'per_page=' + PAGE_SIZE + '&page=' + page,
    );
    const batch = key === undefined ? response : response[key];
    if (!Array.isArray(batch)) throw new Error('Unexpected GitHub page.');
    result.push(...batch);
    if (batch.length < PAGE_SIZE) return result;
  }
}

async function readTriage(get, since) {
  const labels = [
    'weekly-inspection&state=open',
    'fuzz-found&state=all&since=' + encodeURIComponent(since),
  ];
  const [inspections, fuzzIssues] = await Promise.all(
    labels.map((label) => readPages(get, 'issues?labels=' + label)),
  );
  const inspection = inspections
    .filter((issue) => !issue.pull_request)
    .sort((a, b) => a.number - b.number)[0];
  const issues = [inspection, ...fuzzIssues].filter(
    (issue) => issue && !issue.pull_request,
  );
  const dispositions = new Map();
  const repetitions = new Map();
  const repeat = (key, signature) => {
    if (!repetitions.has(key)) repetitions.set(key, new Set());
    repetitions.get(key).add(signature);
  };
  const record = (workflow, run, target, result, reference) => {
    const key = alertKey(workflow + '.yml', run, target);
    const prior = dispositions.get(key);
    if (prior && prior.result !== result) {
      dispositions.set(key, { result: 'untriaged', reference: key });
      return;
    }
    dispositions.set(key, { result, reference: reference ?? key });
  };
  for (const issue of issues) {
    const comments = await readPages(
      get,
      'issues/' + issue.number + '/comments?since=' + encodeURIComponent(since),
    );
    const discussion = [issue, ...comments];
    for (const entry of discussion.filter(trusted)) {
      for (const [, workflow, run, target, result, reference] of (
        entry.body ?? ''
      ).matchAll(TRIAGE)) {
        record(workflow, run, target, result, reference);
      }
      if (issue === inspection) {
        const falseAlarm = UI_TRIAGE.exec(entry.body ?? '');
        if (falseAlarm) {
          const [, run, target] = falseAlarm;
          record('nightly-ui-chaos', run, target, 'false-alert');
        }
      }
    }

    if (issue === inspection) {
      for (const { user, body } of comments) {
        if (user?.login !== 'github-actions[bot]') continue;
        const week =
          /^<!-- nightly-ui-chaos week=(\d{4}-\d{2}-\d{2}) -->/u.exec(
            body ?? '',
          )?.[1];
        if (!week) continue;
        for (const night of nightsInComment(body, week) ?? []) {
          for (const { journey, failures } of night.journeys) {
            for (const { project, title, seed, error } of failures) {
              repeat(
                alertKey('nightly-ui-chaos.yml', night.runId, journey),
                JSON.stringify([journey, project, title, seed, error]),
              );
            }
          }
        }
      }
      continue;
    }

    // Older API tracking issues kept the explicit triage in an owner reply.
    // Apply it to the reports only when all name the same file and invariant.
    const reports = discussion.filter(
      ({ user, body }) =>
        user?.login === 'github-actions[bot]' && body?.includes(API_REPORT),
    );
    const apiFalseAlarm = discussion
      .filter(trusted)
      .some(({ body }) =>
        /^Triage:[\s\S]*\bAPI correctly returns\b[\s\S]*\bfuzz command incorrectly requires\b/iu.test(
          body ?? '',
        ),
      );
    if (reports.length === 0) continue;
    const cases = reports.map(({ body }) => {
      const modules = [
        ...body.matchAll(/\*\*Fuzzed file:\*\* \x60src\/([^/]+)\//gu),
      ];
      const invariants = [
        ...body.matchAll(/\*\*Broken invariant:\*\* \x60([^\x60]+)\x60/gu),
      ];
      const run = /\/actions\/runs\/(\d+)/u.exec(body)?.[1];
      const seed = /\*\*Seed:\*\* \x60(\d+)\x60/u.exec(body)?.[1];
      const path = /FUZZ_PATH='([^']+)'/u.exec(body)?.[1];
      return modules.length === 1 && invariants.length === 1 && run
        ? {
            target: modules[0][1],
            invariant: invariants[0][1],
            run,
            seed,
            path,
          }
        : null;
    });
    for (const entry of cases) {
      if (!entry?.seed || !entry.path) continue;
      const { run, target, invariant, seed, path } = entry;
      repeat(
        alertKey('nightly-fuzz.yml', run, target),
        JSON.stringify([target, invariant, seed, path]),
      );
    }
    const first = cases[0];
    if (
      apiFalseAlarm &&
      first &&
      cases.every(
        (entry) =>
          entry?.target === first.target && entry.invariant === first.invariant,
      )
    ) {
      for (const { run, target } of cases)
        record('nightly-fuzz', run, target, 'false-alert', issue.number);
    }
  }
  return { dispositions, repetitions };
}

async function jobEvidence(get, source, range) {
  const runs = await readPages(
    get,
    'actions/workflows/' +
      source.workflow +
      '/runs?branch=main&created=' +
      encodeURIComponent(range),
    'workflow_runs',
  );
  const jobs = new Map();
  for (const { id: runId } of runs) {
    const attempts = await readPages(
      get,
      'actions/runs/' + runId + '/jobs?filter=all',
      'jobs',
    );
    for (const job of attempts) {
      const target = source.job.exec(job.name)?.groups.target;
      if (target) jobs.set(job.id, { ...job, runId, target });
    }
  }
  const alerts = new Set(
    [...jobs.values()]
      .filter(hasFailure)
      .map(({ runId, target }) => alertKey(source.workflow, runId, target)),
  );
  let duration = 0;
  let unmeasuredJobs = 0;
  for (const job of jobs.values()) {
    const seconds =
      (Date.parse(job.completed_at) - Date.parse(job.started_at)) / 1000;
    if (Number.isFinite(seconds) && seconds >= 0) duration += seconds;
    else if (job.conclusion !== 'skipped') unmeasuredJobs += 1;
  }
  return { alerts, duration, unmeasuredJobs };
}

async function available(read) {
  try {
    return await read();
  } catch {
    return null;
  }
}

function renderOutcomes(alerts, triage) {
  if (triage === null) return ['unavailable', 'unavailable', 'unavailable'];
  const { dispositions, repetitions } = triage;
  const outcomes = {
    'product-defect': new Set(),
    'false-alert': new Set(),
    untriaged: new Set(),
  };
  // The same exact replay can be recorded in different workflow runs. Its
  // triage carries across those reports only if their explicit answers agree.
  const known = new Map();
  const signatureOf = (key) => {
    const signatures = repetitions.get(key);
    return signatures?.size === 1 ? [...signatures][0] : null;
  };
  for (const key of alerts) {
    const signature = signatureOf(key);
    const disposition = dispositions.get(key);
    if (!signature || !disposition) continue;
    const prior = known.get(signature);
    const result =
      !prior || prior.result === disposition.result
        ? disposition.result
        : 'untriaged';
    known.set(signature, {
      result,
      reference:
        result === 'untriaged' ? signature : (prior ?? disposition).reference,
    });
  }
  for (const key of alerts) {
    const signature = signatureOf(key);
    const { result, reference } = known.get(signature) ??
      dispositions.get(key) ?? {
        result: 'untriaged',
        reference: signature ?? key,
      };
    outcomes[result].add(reference);
  }
  return Object.values(outcomes).map((entries) => entries.size);
}

export async function weeklyFuzzSummary(get, range, repoUrl) {
  const [triage, ...jobs] = await Promise.all([
    available(() => readTriage(get, range.split('..')[0])),
    ...SOURCES.map((source) =>
      available(() => jobEvidence(get, source, range)),
    ),
  ]);
  return [
    '## Nightly fuzz summary',
    '',
    '| Workflow | Confirmed product defects | Confirmed false alerts | Untriaged alerts | Matrix runner minutes |',
    '| --- | ---: | ---: | ---: | ---: |',
    ...SOURCES.map(({ name, workflow }, index) => {
      const source =
        '[' + name + '](' + repoUrl + '/actions/workflows/' + workflow + ')';
      const evidence = jobs[index];
      if (!evidence)
        return (
          '| ' +
          source +
          ' | unavailable | unavailable | unavailable | unavailable |'
        );
      const { alerts, duration, unmeasuredJobs } = evidence;
      const outcomes = renderOutcomes(alerts, triage).join(' | ');
      const minutes = (duration / 60).toFixed(1);
      const measured =
        unmeasuredJobs > 0
          ? minutes + ' measured (' + unmeasuredJobs + ' unavailable)'
          : minutes;
      return '| ' + source + ' | ' + outcomes + ' | ' + measured + ' |';
    }),
    '',
    'Runner minutes sum GitHub Actions start/end timestamps for unique matrix job IDs of runs created on main in the report window, including runner time spent on real reruns. Reporting jobs outside the matrix are excluded. Outcomes group failed attempts by workflow run and matrix target, and group exact replays or triaged repeats that cite the same issue. An untriaged failure may be in the harness. Only an explicit disposition in an authorized issue or comment counts as confirmed.',
    '',
    'Triage in the current inspection or a fuzz-found issue with a line such as <code>&lt;!-- fuzz-triage: nightly-ui-chaos 1234 certification-journey false-alert #567 --&gt;</code>. Use <code>product-defect</code> for a confirmed bug. Use the same reference for reports of the same confirmed cause.',
  ];
}
