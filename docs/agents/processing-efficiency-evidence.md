# Processing efficiency: evidence and replay recipes

**Status:** Non-canonical experimental evidence and local reproduction guide  
**Owner:** Dan Popescu and the agent owning the current qualification issue  
**Baseline date:** 2026-10-22  
**Requirement owner:** [Processing Efficiency PRD](../product/processing-efficiency-prd.md)  
**Tracker:** [#788](https://github.com/Prisma-Prim/PRISMA-PRIM-Suite/issues/788)

## 1. What this evidence establishes

The original assessment inspected commit `72482d3c642a6cc7fd0403db064348226bb34718`.
At PRD preparation, `9884598063bc16ea533472a258b275c5c58e5766` added only worktree
dependency documentation; application code and dependency inputs were unchanged.
Historical experiments were synthetic, local, self-reported and uncommitted.
They delivered no production optimization, new upload limit or language migration.

The recipes below are reviewable executable examples extracted into a private
scratch directory. They qualify mechanisms and current interfaces; they are not
a production worker framework or a replacement for the repository integration gate.
They deliberately avoid the original prototype's fragile compiled-code rewriting.
A future agent must implement an approved candidate normally, then measure its
public behavior again. An old performance figure is neither a test assertion nor
permission to restore an obsolete workaround.

## 2. Historical controls, results and limits

Original runtime: Node 24.19.0, PostgreSQL 17.11 on Linux x86-64, pnpm 11.20.0,
4-vCPU cgroup quota and 16 GiB environment limit. API clients ran in a separate
process from the instrumented Nest application. Twelve pre-admitted synthetic
identities exercised one Company in one Workspace. These are not 100,000 customer
Workspaces or a capacity certification for dozens of real enterprises.

The retained direct API sweep made 2,325 successful requests at 100, 10,000 and
100,000 Client Accounts. At 100,000, `/clients` returned approximately 12.3 MB.
A separate controlled A/B alternated current behavior and an experimental SQL
count in the same API and dataset, with identical responses across 288 successful
requests. The latter used PostgreSQL with a 2 GiB container cap and 512 MiB shared
memory. Its stored quantiles selected sorted index `floor(n * p)`; the new recipe
uses nearest-rank quantiles. Use one recipe/method consistently for new reference
and candidate comparisons. The historical per-pass summaries were:

| Candidate                       | Concurrency | Requests | Requests/s |   p50 ms |   p95 ms |
| ------------------------------- | ----------: | -------: | ---------: | -------: | -------: |
| Current list-and-length, pass 1 |           1 |       12 |     2.6215 |  331.709 |  784.121 |
| Current list-and-length, pass 1 |          10 |       60 |     6.0694 | 1584.068 | 2034.410 |
| SQL count prototype, pass 1     |           1 |       12 |    12.7920 |   81.868 |   96.800 |
| SQL count prototype, pass 1     |          10 |       60 |    18.0142 |  535.249 |  873.832 |
| Current list-and-length, pass 2 |           1 |       12 |     2.3330 |  423.545 |  554.591 |
| Current list-and-length, pass 2 |          10 |       60 |     3.5596 | 2779.340 | 3264.135 |
| SQL count prototype, pass 2     |           1 |       12 |    13.0977 |   71.397 |  134.069 |
| SQL count prototype, pass 2     |          10 |       60 |    22.1279 |  432.599 |  627.581 |

The count prototype retained the existing permission helper, Company/Workspace
predicate and outer transaction. It changed only the client-summary count.
It was not run through the complete product regression gate and is not a shipped
patch. Current product correctness must be proved through its public contracts.
The current replay recipe below measures the current API and diagnostic list/count
SQL; it does not inject that historical prototype into application code.

Other retained measurements:

| Experiment                                      | Retained observation                                   | Scope and limitation                                                                        |
| ----------------------------------------------- | ------------------------------------------------------ | ------------------------------------------------------------------------------------------- |
| Synthetic 512 MiB export, buffered gzip         | Median 1.964 s, 549.5 MiB peak RSS                     | Three fresh processes; highly repetitive UTF-8 blocks, not production PDF generation        |
| Same export, first streaming version            | Median 4.935 s, 37.6 MiB peak RSS                      | Smaller blocks increased scheduling/compression overhead                                    |
| Same export, grouped streaming blocks           | Median 1.315 s, 35.1 MiB peak RSS                      | Three fresh processes; compressed output hashes matched buffered output                     |
| Production PDF structure validator, 1,000 pages | Median 0.535 s, 107.0 MiB peak RSS                     | Generated text PDF around 0.95 MB; no OCR or real malware scan                              |
| Same validator, 5,000 pages                     | Median 1.117 s, 273.2 MiB peak RSS                     | Generated PDF around 4.77 MB, within the current byte limit                                 |
| 5,000-page validation, cold Node worker         | Median 1.770 s, 294.0 MiB process peak                 | Includes worker startup; event-loop lag median around 5.45 ms versus 56.66 ms in main       |
| Python/PDFium text extraction, 1,000 pages      | Median 1.654 s, 46.6 MiB peak RSS                      | pypdfium2 4.30.0; 2,504,150 characters, not Node structure validation                       |
| Python/PDFium extraction, 5,000 pages           | Median 7.603 s, 110.9 MiB peak RSS                     | 12,676,150 characters; three runs produced equal extracted-text hashes                      |
| Eight 1,000-page extractions, 1/2/4 processes   | Median 10.645 / 5.173 / 4.367 s                        | Two passes each; sum of worker peaks about 47 / 94 / 189 MiB, not simultaneous RSS          |
| Default node-postgres `bytea`, 5 MiB            | Five reads 53.6–85.2 ms; process peak about 149 MiB    | Random incompressible bytes; not the complete Document download journey                     |
| Same process, later 64 MiB reads                | Five reads 720.1–1463.5 ms; process peak about 703 MiB | Cumulative process high-water mark over the size sequence; hex text payload around 128 MiB  |
| Frontend section-lazy prototype                 | Initial static JS graph about 1.74 MB to 485 kB        | Build-only experiment; includes recognized static dependencies, no browser acceptance proof |

92 targeted API/scanner/representation tests passed in a clean 47.12-second Vitest
run: Document content, malware-scanner protocol, Client REST, operational-home REST,
Offer representation and Contract representation. They are a bounded functional
control, not all repository tests or independent GitHub CI evidence.

Discarded or limited observations must remain visible:

- An initial API load run overlapped legacy tests using the same base database;
  truncation and lock interference invalidated it. Its failures are not product findings.
  Subsequent functional tests and performance fixtures used separate databases.
- A first SQL-count prototype run used Docker's small default shared-memory mount
  and returned PostgreSQL shared-memory errors under concurrent queries. Failed
  requests were excluded from any speed claim; the controlled A/B was rerun with
  adequate, identical resources for both variants.
- Compilation initially lacked a locked dependency; the successful frozen install
  and builds preceded retained measurements. Sandbox-denied loopback/socket attempts
  do not establish application failures.
- No controlled Rust implementation, coding-agent language study, real OCR corpus,
  model inference/training, production invoice or multi-Workspace noisy-neighbor
  benchmark was executed.

The deterministic fixture timestamps in the new recipes improve replay provenance;
original PDF bytes were generated with run-time metadata. Do not expect historical
fixture hashes or timings to match byte-for-byte. The new binary-transfer recipe
also uses a fresh process per size, making its memory scope different from the old
cumulative sequence. Record those protocol differences when comparing results.

## 3. Prerequisites and safe extraction

Use a clean isolated checkout at the intended source commit. Read `AGENTS.md`,
the owning PRD and [environment contract](environment.md). Install the exact locked
Node/pnpm graph normally; do not mutate another worktree's shared installation.
Record the source/base and manifests before comparison. Build the API for its current
public test helpers, and the web for bundle measurements:

```bash
node scripts/agent-doctor.mjs
pnpm --filter @prisma-prim/api build
pnpm --filter @prisma-prim/web build
export AUDIT_REPO_ROOT="$(git rev-parse --show-toplevel)"
export AUDIT_WORK_DIR="$(mktemp -d /tmp/prisma-processing-evidence-XXXXXX)"
```

Extract the reviewed examples below, rather than maintaining another source copy.
Outputs stay outside tracked source. This extractor accepts only the declared
simple filenames and refuses a partial/changed recipe inventory:

````bash
node --input-type=module <<'NODE'
import { readFileSync, writeFileSync, realpathSync } from 'node:fs';
import { join } from 'node:path';
const repo = realpathSync(process.env.AUDIT_REPO_ROOT);
const work = realpathSync(process.env.AUDIT_WORK_DIR);
if (work === repo || work.startsWith(repo + '/')) throw Error('Use an external scratch directory.');
const guide = readFileSync(join(repo, 'docs/agents/processing-efficiency-evidence.md'), 'utf8');
const blocks = [...guide.matchAll(/<!-- probe-file: ([a-z0-9.-]+) -->\s*```(?:javascript|python)\n([\s\S]*?)\n```/g)];
const expected = ['probe-common.cjs', 'export-probe.cjs', 'pdf-probe.cjs', 'api-probe.cjs', 'bytea-probe.cjs', 'bundle-probe.cjs', 'pdf-extract.py'];
if (blocks.length !== expected.length || new Set(blocks.map(x => x[1])).size !== expected.length || blocks.some(x => !expected.includes(x[1]))) throw Error('Recipe inventory changed.');
for (const [, name, source] of blocks) writeFileSync(join(work, name), source + '\n', { flag: 'wx' });
console.log('Extracted seven reviewed probe files.');
NODE
````

The Node recipes report the current source commit, tracked-dirty state, runtime,
architecture, manifest/recipe hashes and available cgroup limits. A dirty development run is useful while
iterating but cannot qualify an unidentified final source. Record dependency hashes,
CPU/storage configuration, background load and any process/thread overrides alongside
results. Never dump the environment or database URL into artifacts.

## 4. Run the mechanism and current-code probes

Run heavy families sequentially on a quiescent machine. Use fresh processes for
memory high-water measurements. Start small, then run the same full size on both
candidates; at least three measured passes after a declared warm-up are recommended.
The examples are research defaults, not a product SLA or customer quota.

### 4.1 Equivalent streaming export

```bash
for pass in 1 2 3; do
  for mode in buffered stream stream-tuned; do
    node "$AUDIT_WORK_DIR/export-probe.cjs" "$mode" 512
  done
done > "$AUDIT_WORK_DIR/export.jsonl"
node - "$AUDIT_WORK_DIR/export.jsonl" <<'NODE'
const fs = require('node:fs');
const rows = fs.readFileSync(process.argv[2], 'utf8').trim().split('\n').map(JSON.parse);
if (rows.length !== 9 || new Set(rows.map(x => x.inputBytes + ':' + x.outputBytes + ':' + x.outputSha256)).size !== 1) throw Error('Equivalent output was not proved.');
console.log('Nine successful runs produced identical compressed bytes.');
NODE
```

Repeat at 64 and 512 MiB when assessing memory growth. This uses prebuilt repeated
blocks and an in-memory hashing sink. It excludes disk/network speed and production
row formatting. Do not generalize it to arbitrary compression ratios, PDF rendering
or full export behavior. A future production slice must additionally verify its
actual content, completeness, formatting, history and authorization.

### 4.2 Current PDF validator and isolated native extraction

```bash
node "$AUDIT_WORK_DIR/pdf-probe.cjs" generate 1000
node "$AUDIT_WORK_DIR/pdf-probe.cjs" generate 5000
for pass in 1 2 3; do
  for pages in 1000 5000; do
    node "$AUDIT_WORK_DIR/pdf-probe.cjs" main "$pages"
    node "$AUDIT_WORK_DIR/pdf-probe.cjs" worker-cold "$pages"
  done
done > "$AUDIT_WORK_DIR/pdf-validation.jsonl"
```

This directly exercises the current structural validator as a diagnostic seam.
It deliberately bypasses no product upload limit or scanner in production; it is
not an upload acceptance test. A failed/renamed validator is a stale recipe to
inspect, not a reason to silently substitute a generic parser. Preserve the
existing public Document content/scanner tests for a real implementation change.
The cold worker pays initialization/copy costs. A persistent pool needs separate
warm throughput, memory and cleanup measurements before adoption.

Python is optional research with no application dependency change. In a disposable
local virtual environment, the historical extraction library can be installed when
network/package access is permitted:

```bash
python3 -m venv "$AUDIT_WORK_DIR/python"
"$AUDIT_WORK_DIR/python/bin/python" -m pip install pypdfium2==4.30.0
for pass in 1 2 3; do
  for workers in 1 2 4; do
    "$AUDIT_WORK_DIR/python/bin/python" "$AUDIT_WORK_DIR/pdf-extract.py" 1000 "$workers" 8
  done
done > "$AUDIT_WORK_DIR/pdf-extraction.jsonl"
```

The old package version is a reproduction input, not a production dependency
recommendation. Qualify current supported versions/licenses separately. PDFium uses
separate spawned processes here; do not assume concurrent thread safety of a native
library. Equal text hashes and page/character counts must precede throughput claims.
A sum of worker peaks is explicitly not a simultaneous memory measurement.

### 4.3 Current public API and PostgreSQL bytes

Use the [managed PostgreSQL lifecycle](environment.md#managed-harness-postgresql-fallback)
or a separately owned native local PostgreSQL 17 instance with explicit safe development
and `_test` URLs. The probe invokes the repository's safety validator and creates its
own randomly named child database; it never truncates the caller's base database.
Do not run other tests against its owned database or lower the validator's checks.
A container's shared memory, CPU and RAM must accommodate the workload, identically
for reference and candidate. Record any resource refusal as a failed qualification.

```bash
AUDIT_CLIENTS=10000 node scripts/managed-postgres.mjs -- node "$AUDIT_WORK_DIR/api-probe.cjs"
node scripts/managed-postgres.mjs -- node "$AUDIT_WORK_DIR/bytea-probe.cjs" 5
node scripts/managed-postgres.mjs -- node "$AUDIT_WORK_DIR/bytea-probe.cjs" 64
```

For an existing independently owned local instance, run the same probe commands
directly with its privately configured `TEST_DATABASE_URL` after the matching doctor.
Never print or commit that URL. Inspect child-database cleanup and remove only the
resources created for the run. A harness that cannot support the lifecycle must
record the blocker rather than report a skip as a pass. Measurement rows are
provisional until the probe exits successfully after fixture teardown. The API
parent awaits the fixture process and fails on a nonzero exit or termination signal;
successful HTTP samples alone do not qualify a replay with failed cleanup.

The API recipe uses a separate HTTP client process, existing Nest public test
harness and current migrations. It provisions the owner through existing commands,
then creates synthetic workload records and twelve already-admitted identities.
It fails on a changed fixture contract, non-200 response, wrong current count or
unequal response body. It reports all HTTP samples and diagnostic SQL plans. One dashboard response and
one execution of each diagnostic statement provide the declared warm-up; application
startup, migrations and fixture seeding are outside retained HTTP timings.
The raw SQL list/count comparison is an allocation/transfer diagnostic over the
known synthetic set; it does not prove permissions or replace a product change.

Re-run at 100, 10,000 and 100,000 records as resources permit. To prove an actual
optimization, run the same public workload on identified reference and candidate
commits in alternating order, with identical declared resources and warm-up.
Do not rewrite compiled files or weaken response/access assertions to force a result.
For a proposed count change, retain the existing public foreign-Workspace,
Company, revoked-permission and snapshot/date tests; add only missing meaningful
cases at that seam. Keep profile/admission changes in a separately scoped slice.

To replay the original bounded functional control, use a separate disposable
PostgreSQL lifecycle and serial files:

```bash
node scripts/managed-postgres.mjs -- pnpm --filter @prisma-prim/api exec vitest run src/documents/document-content.rest.test.ts src/documents/document-malware-scanner.test.ts src/client/client.rest.test.ts src/operational-home/operational-home.rest.test.ts src/offer/offer-representation.test.ts src/contract/contract-representation.test.ts --no-file-parallelism
```

Some legacy tests use/truncate their supplied test database directly. Do not run
this control against a benchmark fixture, another session's database or a shared
base. Its own disposable lifecycle is part of correctness. An optional native run
needs the same exclusive, disposable target guarantee.

The binary recipe isolates default `pg` transfer with incompressible bytes and
checks SHA-256 after every read. It does not prove Document authorization, malware
controls, network egress or an object-store adapter. `bytea_output=hex` accounts for
the measured text payload; report a different current mode rather than assuming it.

### 4.4 Frontend load graph

After a normal production web build:

```bash
node "$AUDIT_WORK_DIR/bundle-probe.cjs" > "$AUDIT_WORK_DIR/bundle.jsonl"
```

The recognizer includes current HTML entry/preload modules and recognized static
imports. It is qualified for the current Vite output syntax, not a general module
parser. Inspect the generated HTML and use browser network evidence to detect
unrecognized syntax or extra early dynamic loading. Verify the actual default route,
a signed-in route and first navigation to deferred sections, including failures,
locales, keyboard use and desktop/narrow layouts. Compare the transitive initial
set, not merely the entry chunk. Report gzip as a local encoding calculation until
actual deployment response headers prove that encoding is served.

## 5. Interpretation and future-agent decision record

For every candidate retain: purpose, exact source/base/candidate commits and recipe
revision; fixture generator/hash; tool/dependency versions; hardware, limits and
background load; warm-up and every measured sample; correctness/quality result;
failures; CPU, memory, elapsed, throughput and relevant transfer/query/AI quantities;
threshold chosen before final runs; disposition and remaining limits.

Stop or repair the research protocol when its public fixture/schema/module syntax
has changed. Determine whether the current product already removes the historical
cost. A missing hotspot, wrong equivalent-work comparison, failed correctness check
or noisy result supports `not applicable`, `rejected` or `needs more evidence`, not
an automatic rewrite. Update the guide's owner rather than copying a contradictory
handbook. An adopted product change needs its own ready issue and existing delivery gate.

Do not add fixed millisecond assertions to ordinary CI from these measurements.
No production budget, SLA or language ranking follows from synthetic fixtures.
Use representative scanned/textual multilingual Documents, required extraction
quality and target hardware before estimating capacity or AI cost. A future cost
model must separate resource quantities, unit prices, assumptions and uncertain demand.

## 6. Reviewed executable examples

These blocks are the single source for the extracted local examples. They do not
alter application source, schema migrations, manifests or deployment configuration.
The API and binary examples create and clean only their own synthetic child database.

### probe-common.cjs

<!-- probe-file: probe-common.cjs -->

```javascript
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const os = require('node:os');
const { createRequire } = require('node:module');
const { createHash } = require('node:crypto');

const repo = fs.realpathSync(process.env.AUDIT_REPO_ROOT || process.cwd());
const work = __dirname;
const requireApi = createRequire(path.join(repo, 'apps/api/package.json'));
const git = (...args) =>
  execFileSync('git', ['-C', repo, ...args], { encoding: 'utf8' }).trim();
const provenance = {
  recipeVersion: 1,
  sourceCommit: git('rev-parse', 'HEAD'),
  trackedChanges: git('status', '--porcelain', '--untracked-files=no') !== '',
  node: process.version,
  platform: process.platform,
  architecture: process.arch,
  availableParallelism: os.availableParallelism(),
};
for (const [name, file] of [
  ['cpuQuota', '/sys/fs/cgroup/cpu.max'],
  ['memoryLimit', '/sys/fs/cgroup/memory.max'],
]) {
  try {
    provenance[name] = fs.readFileSync(file, 'utf8').trim();
  } catch {
    /* optional on non-Linux hosts */
  }
}
const inputHashes = Object.fromEntries(
  [
    'package.json',
    'pnpm-lock.yaml',
    'pnpm-workspace.yaml',
    '.node-version',
    'apps/api/package.json',
    'apps/web/package.json',
  ].map((file) => [
    file,
    createHash('sha256')
      .update(fs.readFileSync(path.join(repo, file)))
      .digest('hex'),
  ]),
);
const recipeHashes = Object.fromEntries(
  [
    'probe-common.cjs',
    'export-probe.cjs',
    'pdf-probe.cjs',
    'api-probe.cjs',
    'bytea-probe.cjs',
    'bundle-probe.cjs',
    'pdf-extract.py',
  ].map((file) => [
    file,
    createHash('sha256')
      .update(fs.readFileSync(path.join(work, file)))
      .digest('hex'),
  ]),
);
function emit(value) {
  console.log(
    JSON.stringify({
      ...provenance,
      inputHashes,
      recipeHashes,
      recordedAt: new Date().toISOString(),
      ...value,
    }),
  );
}
function integer(value, maximum) {
  if (!/^[1-9]\d*$/.test(value || '') || Number(value) > maximum)
    throw Error('Expected bounded positive integer.');
  return Number(value);
}
module.exports = { repo, work, requireApi, emit, integer };
```

### export-probe.cjs

<!-- probe-file: export-probe.cjs -->

```javascript
const { Writable, Readable } = require('node:stream');
const { pipeline } = require('node:stream/promises');
const { gzipSync, createGzip } = require('node:zlib');
const { createHash } = require('node:crypto');
const { performance } = require('node:perf_hooks');
const { emit, integer } = require('./probe-common.cjs');

async function main() {
  const mode = process.argv[2];
  if (!['buffered', 'stream', 'stream-tuned'].includes(mode))
    throw Error('Unknown export mode.');
  const mib = integer(process.argv[3] || '64', 512);
  const row =
    '"DEMO 00000000","Société d’étude & audit — document long","2026-10-22","texte de référence",1234.56\n';
  const chunk = Buffer.from(row.repeat(512));
  const count = Math.ceil((mib * 1048576) / chunk.length);
  const hash = createHash('sha256');
  let outputBytes = 0;
  const sink = new Writable({
    write(bytes, _encoding, done) {
      hash.update(bytes);
      outputBytes += bytes.length;
      done();
    },
  });
  let previous = performance.now();
  let maximumLag = 0;
  const timer = setInterval(() => {
    const now = performance.now();
    maximumLag = Math.max(maximumLag, now - previous - 5);
    previous = now;
  }, 5);
  const cpu = process.cpuUsage();
  const start = performance.now();
  try {
    if (mode === 'buffered') {
      const bytes = Buffer.concat(Array(count).fill(chunk));
      const output = gzipSync(bytes, { level: 6 });
      hash.update(output);
      outputBytes = output.length;
    } else {
      async function* chunks() {
        const group = mode === 'stream-tuned' ? 20 : 1;
        const block = Buffer.concat(Array(group).fill(chunk));
        for (let index = 0; index < count; index += group)
          yield block.subarray(
            0,
            Math.min(group, count - index) * chunk.length,
          );
      }
      const options =
        mode === 'stream-tuned'
          ? { level: 6, chunkSize: 262144, highWaterMark: 1048576 }
          : { level: 6 };
      await pipeline(Readable.from(chunks()), createGzip(options), sink);
    }
    const elapsedMs = performance.now() - start;
    const usage = process.cpuUsage(cpu);
    await new Promise((resolve) => setTimeout(resolve, 15));
    emit({
      experiment: 'synthetic-export',
      mode,
      inputBytes: count * chunk.length,
      outputBytes,
      outputSha256: hash.digest('hex'),
      elapsedMs,
      cpuMs: (usage.user + usage.system) / 1000,
      peakRssMiB: process.resourceUsage().maxRSS / 1024,
      maximumEventLoopLagMs: maximumLag,
      memoryScope: 'whole process high-water mark, including module startup',
    });
  } finally {
    clearInterval(timer);
  }
}
main().catch(() => {
  console.error('Export probe failed; no successful measurement.');
  process.exitCode = 1;
});
```

### pdf-probe.cjs

<!-- probe-file: pdf-probe.cjs -->

```javascript
const {
  Worker,
  isMainThread,
  parentPort,
  workerData,
} = require('node:worker_threads');
const { readFileSync, writeFileSync } = require('node:fs');
const { join } = require('node:path');
const { createHash } = require('node:crypto');
const { performance } = require('node:perf_hooks');
const { requireApi, work, emit, integer } = require('./probe-common.cjs');

const { requireQuestionnairePdfStructure } = requireApi(
  './dist/documents/document-pdf-validation.js',
);
async function validate(bytes) {
  if (typeof requireQuestionnairePdfStructure !== 'function')
    throw Error('Current validation seam changed.');
  await requireQuestionnairePdfStructure(Buffer.from(bytes));
}
async function main() {
  if (!isMainThread) {
    await validate(workerData.bytes);
    parentPort.postMessage({ valid: true });
    return;
  }
  const mode = process.argv[2];
  const pages = integer(process.argv[3] || '1000', 5000);
  const file = join(work, `fixture-${pages}.pdf`);
  if (mode === 'generate') {
    const { PDFDocument, StandardFonts } = requireApi('pdf-lib');
    const document = await PDFDocument.create();
    const date = new Date('2026-10-22T00:00:00Z');
    document.setCreationDate(date);
    document.setModificationDate(date);
    const font = await document.embedFont(StandardFonts.Helvetica);
    for (let index = 0; index < pages; index++) {
      const page = document.addPage();
      for (let line = 0; line < 35; line++)
        page.drawText(
          `DEMO page ${index} line ${line} - long questionnaire audit evidence and content.`,
          { font, size: 10, x: 20, y: 800 - line * 20 },
        );
    }
    const bytes = await document.save();
    writeFileSync(file, bytes);
    emit({
      experiment: 'synthetic-pdf-fixture',
      pages,
      inputBytes: bytes.length,
      inputSha256: createHash('sha256').update(bytes).digest('hex'),
    });
    return;
  }
  if (!['main', 'worker-cold'].includes(mode)) throw Error('Unknown PDF mode.');
  const bytes = readFileSync(file);
  let previous = performance.now();
  let maximumLag = 0;
  const timer = setInterval(() => {
    const now = performance.now();
    maximumLag = Math.max(maximumLag, now - previous - 5);
    previous = now;
  }, 5);
  const cpu = process.cpuUsage();
  const start = performance.now();
  try {
    if (mode === 'main') await validate(bytes);
    else
      await new Promise((resolve, reject) => {
        const worker = new Worker(__filename, { workerData: { bytes } });
        let valid = false;
        worker.on('message', (message) => {
          valid = message?.valid === true;
        });
        worker.once('error', reject);
        worker.once('exit', (code) =>
          code === 0 && valid
            ? resolve()
            : reject(Error('Worker validation failed.')),
        );
      });
    const elapsedMs = performance.now() - start;
    const usage = process.cpuUsage(cpu);
    await new Promise((resolve) => setTimeout(resolve, 15));
    emit({
      experiment: 'current-pdf-structure-validation',
      mode,
      pages,
      inputBytes: bytes.length,
      inputSha256: createHash('sha256').update(bytes).digest('hex'),
      valid: true,
      elapsedMs,
      cpuMs: (usage.user + usage.system) / 1000,
      peakRssMiB: process.resourceUsage().maxRSS / 1024,
      maximumEventLoopLagMs: maximumLag,
      memoryScope: 'whole process including any worker thread',
    });
  } finally {
    clearInterval(timer);
  }
}
main().catch(() => {
  console.error(
    'PDF probe failed; inspect the current validation seam and fixture.',
  );
  process.exitCode = 1;
});
```

### api-probe.cjs

<!-- probe-file: api-probe.cjs -->

```javascript
const { fork } = require('node:child_process');
const { performance } = require('node:perf_hooks');
const { randomUUID } = require('node:crypto');
const { join } = require('node:path');
const { repo, requireApi, emit, integer } = require('./probe-common.cjs');
const workspaceId = '00000000-0000-4000-8000-000000099999';
const headers = {
  'x-test-external-provider': 'deterministic-test',
  'x-test-external-subject': 'probe-owner',
  'x-test-display-name': 'Processing Probe DEMO',
  'x-test-email': 'probe@example.test',
};
const quantile = (samples, fraction) =>
  [...samples].sort((a, b) => a - b)[
    Math.min(samples.length - 1, Math.ceil(samples.length * fraction) - 1)
  ];

async function serve() {
  const { createIsolatedPostgresTestDatabase } = requireApi(
    './dist/database/isolated-postgres-test-database.js',
  );
  const { createPostgresRestTestHarness } = requireApi(
    './dist/database/postgres-rest-test-harness.js',
  );
  // The repository helper validates loopback/_test safety before any connection.
  const database = await createIsolatedPostgresTestDatabase({
    baseDatabaseUrl: process.env.TEST_DATABASE_URL,
    namePrefix: 'processing_probe',
  });
  let harness;
  let closing;
  const close = () =>
    (closing ||= (async () => {
      try {
        await harness?.close();
      } finally {
        await database.close();
      }
    })());
  process.once('SIGTERM', () => {
    void close().finally(() => process.exit(1));
  });
  process.once('SIGINT', () => {
    void close().finally(() => process.exit(1));
  });
  try {
    harness = await createPostgresRestTestHarness({
      databaseUrl: database.targetUrl,
      migrationsFolder: join(repo, 'apps/api/drizzle'),
      environment: {
        NODE_ENV: 'test',
        ACCESS_IDENTITY_MODE: 'test',
        ACCESS_BOOTSTRAP_EXTERNAL_PROVIDER: 'deterministic-test',
        ACCESS_BOOTSTRAP_EXTERNAL_SUBJECT: 'probe-owner',
        ACCESS_BOOTSTRAP_WORKSPACE_ID: workspaceId,
        ACCESS_BOOTSTRAP_WORKSPACE_NAME: 'Processing Probe DEMO',
      },
    });
    const pool = harness.pool;
    async function call(path, body, companyId, subject) {
      const response = await fetch(harness.origin + '/api' + path, {
        method: body ? 'POST' : 'GET',
        headers: {
          ...headers,
          ...(subject ? { 'x-test-external-subject': subject } : {}),
          ...(companyId ? { 'x-company-context-id': companyId } : {}),
          'content-type': 'application/json',
          'idempotency-key': randomUUID(),
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
      if (!response.ok) throw Error('Current public fixture contract failed.');
      return response.json();
    }
    const company = await call('/companies', {
      displayName: 'Processing Probe DEMO',
    });
    const owner = await call('/access/current-actor');
    await call('/company-director-client-assignments', {
      companyId: company.id,
      workspaceMembershipId: owner.workspaceMembershipId,
    });
    const size = integer(process.env.AUDIT_CLIENTS || '10000', 100000);
    await pool.query(
      "INSERT INTO client_accounts(workspace_id,display_name,created_by_internal_user_id,created_by_workspace_membership_id) SELECT $1,'Synthetic Client DEMO '||lpad(n::text,8,'0'),$2,$3 FROM generate_series(1,$4::integer) n",
      [workspaceId, owner.internalUserId, owner.workspaceMembershipId, size],
    );
    await pool.query(
      'INSERT INTO client_company_relationships(workspace_id,client_account_id,company_id,created_by_internal_user_id,created_by_workspace_membership_id) SELECT workspace_id,id,$2,$3,$4 FROM client_accounts WHERE workspace_id=$1',
      [
        workspaceId,
        company.id,
        owner.internalUserId,
        owner.workspaceMembershipId,
      ],
    );
    const subjects = [];
    for (let index = 0; index < 12; index++) {
      const subject = `probe-user-${index}`;
      const user = (
        await pool.query(
          'INSERT INTO internal_users(external_provider,external_subject,display_name,email) VALUES ($1,$2,$3,$4) RETURNING id',
          [
            'deterministic-test',
            subject,
            'Probe User DEMO',
            'probe@example.test',
          ],
        )
      ).rows[0];
      const member = (
        await pool.query(
          'INSERT INTO workspace_memberships(workspace_id,internal_user_id) VALUES ($1,$2) RETURNING id',
          [workspaceId, user.id],
        )
      ).rows[0];
      await pool.query(
        'INSERT INTO company_role_assignments(workspace_id,company_id,workspace_membership_id,bundle,permission_set_version) SELECT workspace_id,company_id,$1,bundle,permission_set_version FROM company_role_assignments WHERE workspace_membership_id=$2',
        [member.id, owner.workspaceMembershipId],
      );
      subjects.push(subject);
    }
    await pool.query('ANALYZE client_accounts');
    await pool.query('ANALYZE client_company_relationships');
    const sample = await harness.measureApplicationQueries(() =>
      call('/operational-home', undefined, company.id, subjects[0]),
    );
    if (
      sample.value.summaries.find((item) => item.kind === 'active_clients')
        ?.count !== size
    )
      throw Error('Current readable count differs from the fixture.');
    const sql = {};
    const predicate =
      " FROM client_company_relationships r JOIN client_accounts a ON r.workspace_id=a.workspace_id AND r.client_account_id=a.id WHERE r.workspace_id=$1 AND r.company_id=$2 AND r.status='active' AND a.status='active'";
    for (const [kind, statement] of Object.entries({
      list:
        'SELECT a.id,a.display_name' +
        predicate +
        ' ORDER BY a.display_name,a.id',
      count: 'SELECT count(*)::int AS total' + predicate,
    })) {
      const samples = [];
      for (let pass = 0; pass < 5; pass++) {
        const start = performance.now();
        const result = await pool.query(statement, [workspaceId, company.id]);
        if (
          (kind === 'list' ? result.rows.length : result.rows[0].total) !== size
        )
          throw Error('Diagnostic SQL equivalence failed.');
        if (pass > 0) samples.push(performance.now() - start);
      }
      sql[kind] = {
        elapsedSamplesMs: samples,
        medianMs: quantile(samples, 0.5),
        returnedRows: kind === 'list' ? size : 1,
        explain: (
          await pool.query(
            'EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ' + statement,
            [workspaceId, company.id],
          )
        ).rows[0]['QUERY PLAN'],
      };
    }
    process.send({
      ready: true,
      origin: harness.origin,
      companyId: company.id,
      subjects,
      size,
      postgres: (await pool.query('SHOW server_version')).rows[0]
        .server_version,
      queryCountIncludingTransactions: sample.queryCount,
      sql,
      expectedResponse: sample.value,
    });
    process.on('message', (message) => {
      if (message === 'stop')
        void close().then(
          () => process.disconnect(),
          () => process.exit(1),
        );
    });
  } catch (error) {
    await close();
    throw error;
  }
}
async function run() {
  const child = fork(__filename, ['serve'], {
    stdio: ['ignore', 'ignore', 'inherit', 'ipc'],
  });
  const stopped = new Promise((resolve) => {
    child.once('exit', (code, signal) => resolve({ code, signal }));
    child.once('error', () => resolve({ code: null, signal: null }));
  });
  let ready = false;
  const timeout = setTimeout(() => {
    child.kill('SIGTERM');
    process.exitCode = 1;
  }, 300000);
  try {
    const server = await new Promise((resolve, reject) => {
      child.once('error', reject);
      child.on('message', (message) => {
        if (message.ready) {
          ready = true;
          resolve(message);
        }
      });
      child.once('exit', () => {
        if (!ready) reject(Error('Fixture server failed.'));
      });
    });
    emit({
      experiment: 'public-dashboard-fixture',
      size: server.size,
      users: server.subjects.length,
      postgres: server.postgres,
      queryCountIncludingTransactions: server.queryCountIncludingTransactions,
      diagnosticSql: server.sql,
    });
    for (const concurrency of [1, 10]) {
      const count = concurrency === 1 ? 12 : 60;
      const samples = [];
      let next = 0;
      let responseBytes = 0;
      const start = performance.now();
      await Promise.all(
        Array.from({ length: concurrency }, async () => {
          while (true) {
            const index = next++;
            if (index >= count) return;
            const begin = performance.now();
            const response = await fetch(
              server.origin + '/api/operational-home',
              {
                headers: {
                  ...headers,
                  'x-test-external-subject':
                    server.subjects[index % server.subjects.length],
                  'x-company-context-id': server.companyId,
                },
              },
            );
            const text = await response.text();
            if (
              response.status !== 200 ||
              text !== JSON.stringify(server.expectedResponse)
            )
              throw Error('Public response equivalence failed.');
            responseBytes += Buffer.byteLength(text);
            samples.push(performance.now() - begin);
          }
        }),
      );
      emit({
        experiment: 'current-public-dashboard',
        size: server.size,
        concurrency,
        count,
        successes: samples.length,
        failures: 0,
        requestsPerSecond: count / ((performance.now() - start) / 1000),
        p50Ms: quantile(samples, 0.5),
        p95Ms: quantile(samples, 0.95),
        elapsedSamplesMs: samples,
        responseBytesPerRequest: responseBytes / count,
        memoryScope:
          'no production RSS claim from the instrumented test harness',
      });
    }
  } finally {
    try {
      if (child.connected && ready) child.send('stop');
      else child.kill('SIGTERM');
      const { code, signal } = await stopped;
      if (code !== 0 || signal !== null)
        throw Error('Fixture server teardown failed.');
    } finally {
      clearTimeout(timeout);
    }
  }
}
(process.argv[2] === 'serve' ? serve() : run()).catch(() => {
  console.error(
    'API probe failed: check the current public contract, safe database and owned fixture lifecycle.',
  );
  process.exitCode = 1;
});
```

### bytea-probe.cjs

<!-- probe-file: bytea-probe.cjs -->

```javascript
const { randomBytes, createHash } = require('node:crypto');
const { performance } = require('node:perf_hooks');
const { requireApi, emit, integer } = require('./probe-common.cjs');
async function main() {
  const mib = integer(process.argv[2] || '5', 64);
  const { createIsolatedPostgresTestDatabase } = requireApi(
    './dist/database/isolated-postgres-test-database.js',
  );
  const database = await createIsolatedPostgresTestDatabase({
    baseDatabaseUrl: process.env.TEST_DATABASE_URL,
    namePrefix: 'processing_blob',
  });
  try {
    const pool = database.targetPool;
    await pool.query(
      'CREATE TABLE probe_blob(id integer PRIMARY KEY, content bytea NOT NULL)',
    );
    const bytes = randomBytes(mib * 1048576);
    const sha = createHash('sha256').update(bytes).digest('hex');
    await pool.query('INSERT INTO probe_blob VALUES (1,$1)', [bytes]);
    const samples = [];
    for (let pass = 0; pass < 5; pass++) {
      const start = performance.now();
      const result = await pool.query(
        'SELECT content FROM probe_blob WHERE id=$1',
        [1],
      );
      samples.push(performance.now() - start);
      if (
        createHash('sha256').update(result.rows[0].content).digest('hex') !==
        sha
      )
        throw Error('Preserved bytes differ.');
    }
    const encoding = (await pool.query('SHOW bytea_output')).rows[0]
      .bytea_output;
    emit({
      experiment: 'current-pg-bytea-transfer',
      inputBytes: bytes.length,
      inputSha256: sha,
      outputVerified: true,
      elapsedSamplesMs: samples,
      byteaOutput: encoding,
      textPayloadBytes: encoding === 'hex' ? 2 * bytes.length + 2 : null,
      peakRssMiB: process.resourceUsage().maxRSS / 1024,
      memoryScope:
        'whole process peak over five reads, not incremental per-request memory',
      fixture: 'random incompressible bytes; hashes vary by run',
    });
  } finally {
    await database.close();
  }
}
main().catch(() => {
  console.error('Byte-storage probe failed; no successful transfer claim.');
  process.exitCode = 1;
});
```

### bundle-probe.cjs

<!-- probe-file: bundle-probe.cjs -->

```javascript
const fs = require('node:fs');
const path = require('node:path');
const { gzipSync } = require('node:zlib');
const { repo, emit } = require('./probe-common.cjs');
const root = path.join(repo, 'apps/web/dist');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const seen = new Set();
function walk(file) {
  const absolute = path.resolve(root, file);
  if (!absolute.startsWith(root + path.sep))
    throw Error('Unexpected asset path.');
  if (seen.has(absolute)) return;
  seen.add(absolute);
  const source = fs.readFileSync(absolute, 'utf8');
  // This syntax recognizer is qualified for the current Vite output, not a general JS parser.
  for (const match of source.matchAll(
    /(?:^|;)import(?!\s*\()[^;]*?["'](\.\/[^"']+\.js)["']/g,
  ))
    walk(path.join(path.dirname(file), match[1]));
}
for (const match of html.matchAll(/(?:src|href)="\/(assets\/[^\"]+\.js)"/g))
  walk(match[1]);
if (!seen.size) throw Error('Current HTML/bundler asset syntax changed.');
emit({
  experiment: 'initial-static-js-graph',
  files: [...seen].map((file) => path.relative(root, file)),
  bytes: [...seen].reduce((sum, file) => sum + fs.statSync(file).size, 0),
  gzipBytes: [...seen].reduce(
    (sum, file) => sum + gzipSync(fs.readFileSync(file)).length,
    0,
  ),
  boundary:
    'HTML modules/preloads and recognized static imports; verify actual requests in the browser',
});
```

### pdf-extract.py

<!-- probe-file: pdf-extract.py -->

```python
import concurrent.futures
import hashlib
import json
import multiprocessing
import os
import pathlib
import resource
import subprocess
import sys
import time


def extract(file):
    import pypdfium2 as pdfium
    document = pdfium.PdfDocument(file)
    digest = hashlib.sha256()
    characters = 0
    try:
        for page in document:
            textpage = page.get_textpage()
            try:
                text = textpage.get_text_bounded()
                characters += len(text)
                digest.update(text.encode('utf-8'))
            finally:
                textpage.close()
                page.close()
        return dict(pid=os.getpid(), pages=len(document), characters=characters,
                    textSha256=digest.hexdigest(), peakRssMiB=resource.getrusage(resource.RUSAGE_SELF).ru_maxrss / 1024)
    finally:
        document.close()


if __name__ == '__main__':
    # Linux resource units match the original experiment; record/adjust before porting.
    if not sys.platform.startswith('linux'):
        raise SystemExit('This RSS recipe is qualified for Linux only.')
    pages = int(sys.argv[1]) if len(sys.argv) > 1 else 1000
    workers = int(sys.argv[2]) if len(sys.argv) > 2 else 1
    jobs = int(sys.argv[3]) if len(sys.argv) > 3 else 8
    if pages not in (1000, 5000) or workers not in (1, 2, 4) or not 1 <= jobs <= 8:
        raise SystemExit('Unqualified workload size.')
    file = str(pathlib.Path(__file__).parent / f'fixture-{pages}.pdf')
    source = subprocess.check_output(['git', '-C', os.environ['AUDIT_REPO_ROOT'], 'rev-parse', 'HEAD'], text=True).strip()
    start = time.perf_counter()
    with concurrent.futures.ProcessPoolExecutor(max_workers=workers, mp_context=multiprocessing.get_context('spawn')) as pool:
        results = list(pool.map(extract, [file] * jobs))
    elapsed = time.perf_counter() - start
    if len({(r['pages'], r['characters'], r['textSha256']) for r in results}) != 1:
        raise SystemExit('Extraction outputs differ.')
    peaks = {}
    for result in results:
        peaks[result['pid']] = max(peaks.get(result['pid'], 0), result['peakRssMiB'])
    import importlib.metadata
    print(json.dumps(dict(recipeVersion=1, experiment='native-pdf-text-extraction',
        sourceCommit=source, python=sys.version.split()[0], pdfiumPackage=importlib.metadata.version('pypdfium2'),
        inputSha256=hashlib.sha256(pathlib.Path(file).read_bytes()).hexdigest(), workers=workers,
        jobs=jobs, elapsedSeconds=elapsed, pagesPerSecond=pages * jobs / elapsed,
        sumWorkerPeaksMiB=sum(peaks.values()), memoryScope='sum of per-worker high-water marks; not simultaneous total RSS',
        results=results)))
```
