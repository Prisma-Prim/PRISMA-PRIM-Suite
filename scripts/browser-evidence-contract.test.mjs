import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const mockedConfigUrl = new URL(
  '../apps/web/playwright.config.ts',
  import.meta.url,
);
const acceptanceConfigUrl = new URL(
  '../apps/web/playwright.acceptance.config.ts',
  import.meta.url,
);
const workflowUrl = new URL('../.github/workflows/ci.yml', import.meta.url);
const uploadedEvidenceRoot = 'test-results';
const evidenceProbeConfigUrl = new URL(
  '../apps/web/playwright.evidence.config.ts',
  import.meta.url,
);

async function readOutputDirectory(configUrl, suite) {
  const config = (await readFile(configUrl, 'utf8')).replaceAll('\r\n', '\n');
  const declaration = /^ {2}outputDir: '([^']+)',$/mu.exec(config);
  assert.ok(
    declaration,
    `the ${suite} suite must declare its own top-level outputDir`,
  );
  return declaration[1].replace(/^\.\//u, '').replace(/\/$/u, '');
}

function contains(directory, other) {
  return other === directory || other.startsWith(`${directory}/`);
}

test('the two browser suites write evidence into disjoint output directories', async () => {
  const mocked = await readOutputDirectory(mockedConfigUrl, 'mocked browser');
  const acceptance = await readOutputDirectory(
    acceptanceConfigUrl,
    'real acceptance',
  );

  assert.notEqual(
    mocked,
    acceptance,
    'a shared output directory lets the later suite clean the earlier evidence',
  );
  assert.ok(
    !contains(mocked, acceptance) && !contains(acceptance, mocked),
    `neither output directory may contain the other: ${mocked} and ${acceptance}`,
  );
  const probe = await readOutputDirectory(
    evidenceProbeConfigUrl,
    'failure evidence probe',
  );
  for (const directory of [mocked, acceptance])
    assert.ok(
      !contains(directory, probe) && !contains(probe, directory),
      'the induced failure probe must not erase either real suite evidence directory',
    );
});

test('both suite directories stay under the uploaded evidence root', async () => {
  for (const [configUrl, suite] of [
    [mockedConfigUrl, 'mocked browser'],
    [acceptanceConfigUrl, 'real acceptance'],
    [evidenceProbeConfigUrl, 'failure evidence probe'],
  ]) {
    const outputDirectory = await readOutputDirectory(configUrl, suite);
    assert.ok(
      contains(uploadedEvidenceRoot, outputDirectory) &&
        outputDirectory !== uploadedEvidenceRoot,
      `the ${suite} suite must write below ${uploadedEvidenceRoot}, not ${outputDirectory}`,
    );
  }
});

test('CI uploads every evidence directory independently, including after failures', async () => {
  const workflow = (await readFile(workflowUrl, 'utf8')).replaceAll(
    '\r\n',
    '\n',
  );
  for (const [step, family] of [
    ['Upload browser evidence', 'browser'],
    ['Upload acceptance evidence', 'acceptance'],
  ]) {
    const start = workflow.indexOf(`- name: ${step}\n`);
    const end = start + workflow.slice(start).search(/\n {2}[a-z_]+:\n/u);
    const upload = workflow.slice(start, end);
    assert.match(
      upload,
      /if: \$\{\{ always\(\) && github\.event_name == 'pull_request' \}\}/u,
    );
    assert.ok(
      upload.includes(
        `name: browser-evidence-part-${family}-\${{ github.run_id }}`,
      ),
    );
    assert.match(upload, /overwrite: true/u);
    assert.doesNotMatch(upload, /github\.run_attempt/u);
    assert.ok(
      upload.includes(`path: apps/web/${uploadedEvidenceRoot}/\n`),
      'upload the whole evidence root, preserving browser, acceptance and probe directory names',
    );
    assert.match(upload, /retention-days: 14/u);
  }
});

test('CI merges disjoint evidence under the established PR artifact name', async () => {
  const workflow = (await readFile(workflowUrl, 'utf8')).replaceAll(
    '\r\n',
    '\n',
  );
  const quality = workflow.slice(workflow.indexOf('\n  quality:\n'));
  assert.match(
    quality,
    /name: Download complete browser evidence\n {8}if: \$\{\{ always\(\) && github\.event_name == 'pull_request' \}\}/u,
  );
  assert.match(quality, /uses: actions\/download-artifact@v4/u);
  assert.match(
    quality,
    /pattern: browser-evidence-part-\*-\$\{\{ github\.run_id \}\}/u,
  );
  assert.match(quality, /path: browser-evidence\/\n {10}merge-multiple: true/u);
  assert.match(
    quality,
    /name: Upload complete browser evidence\n {8}if: \$\{\{ always\(\) && github\.event_name == 'pull_request' \}\}/u,
  );
  assert.match(
    quality,
    /name: browser-evidence-pr-\$\{\{ github\.event\.pull_request\.number \}\}/u,
  );
  assert.match(quality, /overwrite: true/u);
  assert.match(
    quality,
    /path: browser-evidence\/\n {10}if-no-files-found: warn\n {10}retention-days: 14/u,
  );
});

test('acceptance failures retain first-attempt evidence without a retry', async () => {
  const config = await readFile(acceptanceConfigUrl, 'utf8');
  assert.match(config, /trace: 'retain-on-failure'/u);
  assert.match(config, /screenshot: 'only-on-failure'/u);
  assert.doesNotMatch(config, /retries:\s*[1-9]/u);

  const workflow = (await readFile(workflowUrl, 'utf8')).replaceAll(
    '\r\n',
    '\n',
  );
  assert.match(workflow, /node scripts\/verify-acceptance-evidence\.mjs/u);
  assert.match(workflow, /id: repository_tests/u);
  const probeStep = workflow.slice(
    workflow.indexOf('- name: Verify acceptance failure evidence'),
    workflow.indexOf('- name: Upload acceptance evidence'),
  );
  assert.match(
    probeStep,
    /if: \$\{\{ !cancelled\(\) && \(steps\.repository_tests\.outcome == 'success' \|\| steps\.repository_tests\.outcome == 'failure'\) \}\}/u,
    'the isolated evidence probe must run after a failed product test, but not after cancellation or skipped tests',
  );
});
