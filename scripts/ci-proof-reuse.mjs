import { execFileSync } from 'node:child_process';
import { appendFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const fullJobs = [
  'checks',
  'scope',
  'postgres_image',
  'api (1/3)',
  'api (2/3)',
  'api (3/3)',
  'api (serial)',
  'web_unit',
  'browser (1)',
  'browser (2)',
  'browser (3)',
  'acceptance (1)',
  'acceptance (2)',
  'build',
  'packaging',
  'quality',
];
const none = { all: false, api: false, source: null, testedSha: null };
const shaPattern = /^[a-f0-9]{40}$/u;

function inputEntries(root, apps, web) {
  if (
    root.truncated ||
    apps.truncated ||
    web.truncated ||
    !Array.isArray(root.tree) ||
    !Array.isArray(apps.tree) ||
    !Array.isArray(web.tree)
  )
    throw new Error('Incomplete Git tree');
  const manifest = web.tree.find(
    (entry) =>
      entry.path === 'package.json' &&
      entry.type === 'blob' &&
      entry.mode === '100644',
  );
  if (!manifest) throw new Error('Missing regular web manifest');
  return [
    { ...manifest, path: 'apps/web/package.json' },
    ...root.tree.filter((entry) => entry.path !== 'apps'),
    ...apps.tree
      .filter((entry) => entry.path !== 'web')
      .map((entry) => ({ ...entry, path: `apps/${entry.path}` })),
  ]
    .map((entry) => `${entry.mode} ${entry.type} ${entry.sha} ${entry.path}`)
    .sort();
}

async function backendInputs(api, tree) {
  const root = await api(`git/trees/${tree}`);
  const apps = root.tree?.find(
    (entry) => entry.path === 'apps' && entry.type === 'tree',
  );
  if (!apps) throw new Error('Missing apps tree');
  const applications = await api(`git/trees/${apps.sha}`);
  const web = applications.tree?.find(
    (entry) => entry.path === 'web' && entry.type === 'tree',
  );
  if (!web) throw new Error('Missing web tree');
  return inputEntries(root, applications, await api(`git/trees/${web.sha}`));
}

function eligibleRun(run, { repository, runId, now }) {
  const age = now - Date.parse(run.created_at);
  return (
    Number.isSafeInteger(run.id) &&
    run.id > 0 &&
    run.id !== Number(runId) &&
    run.repository?.full_name === repository &&
    run.head_repository?.full_name === repository &&
    run.path === '.github/workflows/ci.yml' &&
    run.status === 'completed' &&
    run.conclusion === 'success' &&
    (run.event === 'pull_request' ||
      (run.event === 'push' && run.head_branch === 'main')) &&
    Number.isFinite(age) &&
    age >= 0 &&
    age < 24 * 60 * 60 * 1000
  );
}

async function readProof(api, run, context, allowApiReuse = false) {
  if (!eligibleRun(run, context)) return undefined;
  const { jobs, total_count: count } = await api(
    `actions/runs/${run.id}/jobs?filter=latest&per_page=100`,
  );
  if (count !== fullJobs.length || jobs.length !== fullJobs.length)
    return undefined;
  const executed = (job) =>
    job?.conclusion === 'success' && job.runner_name && job.steps?.length > 0;
  const apiNames = fullJobs.filter((name) => name.startsWith('api ('));
  const apiExecuted = apiNames.every((name) =>
    executed(jobs.find((job) => job.name === name)),
  );
  const apiSkipped =
    allowApiReuse &&
    apiNames.every(
      (name) => jobs.find((job) => job.name === name)?.conclusion === 'skipped',
    );
  if (
    !fullJobs.every(
      (name) =>
        jobs.filter(
          (job) =>
            job.name === name &&
            (executed(job) ||
              (apiSkipped &&
                apiNames.includes(name) &&
                job.conclusion === 'skipped')),
        ).length === 1,
    )
  )
    return undefined;
  const scope = jobs.find((job) => job.name === 'scope');
  const logs = (await api(`actions/jobs/${scope.id}/logs`, true)).replaceAll(
    '\r\n',
    '\n',
  );
  const matches = [...logs.matchAll(/^\S+ CI_CHECKOUT=([a-f0-9]{40})$/gmu)];
  const environments = [...logs.matchAll(/^\S+ CI_ENVIRONMENT=(.+)$/gmu)];
  if (
    matches.length !== 1 ||
    environments.length !== 1 ||
    !context.current.environment ||
    environments[0][1] !== context.current.environment
  )
    return undefined;
  const testedSha = matches[0][1];
  const commit = await api(`git/commits/${testedSha}`);
  if (
    commit.sha !== testedSha ||
    !shaPattern.test(commit.tree?.sha) ||
    !shaPattern.test(run.head_sha)
  )
    return undefined;
  if (
    run.event === 'push'
      ? testedSha !== run.head_sha
      : commit.parents?.length !== 2 || commit.parents[1]?.sha !== run.head_sha
  )
    return undefined;
  let apiSource;
  if (!apiExecuted) {
    // Exactly one direct API source: no recursive skip chain can manufacture
    // a new proof. Frontend suites must have executed on this exact tree.
    const sources = [...logs.matchAll(/^\S+ proof_run=([1-9][0-9]*)$/gmu)];
    if (!apiSkipped || sources.length !== 1 || Number(sources[0][1]) === run.id)
      return undefined;
    apiSource = Number(sources[0][1]);
    const source = await api(`actions/runs/${apiSource}`);
    if (source.id !== Number(sources[0][1])) return undefined;
    const proof = await readProof(api, source, context);
    if (
      !proof ||
      JSON.stringify(await backendInputs(api, proof.tree)) !==
        JSON.stringify(await backendInputs(api, commit.tree.sha))
    )
      return undefined;
  }
  return {
    testedSha,
    tree: commit.tree.sha,
    ...(apiSource ? { apiSource } : {}),
  };
}

// Read-only GitHub adapter. Expired logs, missing permissions and API errors
// are ordinary cache misses: they must never waive a required test.
export async function chooseReuse(context) {
  const { api, event, ref, current } = context;
  context = { ...context, now: context.now ?? Date.now() };
  if (!(
    event === 'pull_request' ||
    (event === 'push' && ref === 'refs/heads/main')
  ))
    return none;
  try {
    const { workflow_runs: runs } = await api(
      'actions/workflows/ci.yml/runs?status=success&per_page=30',
    );
    for (const run of runs.slice(0, 8)) {
      try {
        const proof = await readProof(api, run, context, event === 'push');
        if (!proof) continue;
        if (event === 'push' && proof.tree === current.tree)
          return {
            all: true,
            api: true,
            source: run.id,
            testedSha: proof.testedSha,
            ...(proof.apiSource ? { apiSource: proof.apiSource } : {}),
          };
        if (
          event === 'pull_request' &&
          JSON.stringify(await backendInputs(api, proof.tree)) ===
            JSON.stringify(current.inputs)
        )
          return {
            all: false,
            api: true,
            source: run.id,
            testedSha: proof.testedSha,
            ...(proof.apiSource ? { apiSource: proof.apiSource } : {}),
          };
      } catch {
        // A candidate is not evidence when any part cannot be verified.
      }
    }
  } catch {
    // Listing failure also defaults to full verification.
  }
  return none;
}

function git(...args) {
  const value = execFileSync('git', args, { encoding: 'utf8', timeout: 10000 });
  return args.includes('-z') ? value : value.trim();
}

function localTree(ref) {
  return git('ls-tree', '-z', ref)
    .split('\0')
    .filter(Boolean)
    .map((line) => {
      const tab = line.indexOf('\t');
      const [mode, type, sha] = line.slice(0, tab).split(' ');
      return { mode, type, sha, path: line.slice(tab + 1) };
    });
}

async function main() {
  const checkout = git('rev-parse', 'HEAD');
  console.log(`CI_CHECKOUT=${checkout}`);
  const environment =
    process.env.ImageOS && process.env.ImageVersion
      ? `${process.env.ImageOS}/${process.env.ImageVersion}/${process.version}`
      : undefined;
  console.log(`CI_ENVIRONMENT=${environment}`);
  const result = await chooseReuse({
    repository: process.env.GITHUB_REPOSITORY,
    event: process.env.GITHUB_EVENT_NAME,
    ref: process.env.GITHUB_REF,
    runId: process.env.GITHUB_RUN_ID,
    current: {
      environment,
      tree: git('rev-parse', 'HEAD^{tree}'),
      inputs: inputEntries(
        { tree: localTree('HEAD') },
        { tree: localTree('HEAD:apps') },
        { tree: localTree('HEAD:apps/web') },
      ),
    },
    api: async (path, raw = false) => {
      const value = execFileSync(
        'gh',
        ['api', `repos/${process.env.GITHUB_REPOSITORY}/${path}`],
        {
          encoding: 'utf8',
          timeout: 15000,
          maxBuffer: 10 * 1024 * 1024,
          stdio: ['ignore', 'pipe', 'pipe'],
        },
      );
      return raw ? value : JSON.parse(value);
    },
  });
  const output = `reuse_all=${result.all}\nreuse_api=${result.api}\nproof_run=${result.source ?? ''}\n`;
  console.log(output);
  if (process.env.GITHUB_OUTPUT)
    appendFileSync(process.env.GITHUB_OUTPUT, output);
  if (process.env.GITHUB_STEP_SUMMARY)
    appendFileSync(
      process.env.GITHUB_STEP_SUMMARY,
      result.source
        ? `Reused ${result.all ? 'all heavy suites' : 'API suite'} from [run ${result.source}](https://github.com/${process.env.GITHUB_REPOSITORY}/actions/runs/${result.source}), tested commit \`${result.testedSha}\`.${result.apiSource ? ` API source: [run ${result.apiSource}](https://github.com/${process.env.GITHUB_REPOSITORY}/actions/runs/${result.apiSource}).` : ''}\n`
        : 'No verified reusable proof: run the complete required suites.\n',
    );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main();
