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

async function readOutputDirectory(configUrl, suite) {
  const config = await readFile(configUrl, 'utf8');
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
});

test('both suite directories stay under the uploaded evidence root', async () => {
  for (const [configUrl, suite] of [
    [mockedConfigUrl, 'mocked browser'],
    [acceptanceConfigUrl, 'real acceptance'],
  ]) {
    const outputDirectory = await readOutputDirectory(configUrl, suite);
    assert.ok(
      contains(uploadedEvidenceRoot, outputDirectory) &&
        outputDirectory !== uploadedEvidenceRoot,
      `the ${suite} suite must write below ${uploadedEvidenceRoot}, not ${outputDirectory}`,
    );
  }
});

test('CI uploads screenshots from every suite directory', async () => {
  const workflow = await readFile(workflowUrl, 'utf8');
  const uploadStep = workflow.slice(
    workflow.indexOf('- name: Upload browser evidence'),
    workflow.indexOf('- name: Build'),
  );

  assert.match(
    uploadStep,
    new RegExp(`path: apps/web/${uploadedEvidenceRoot}/\\*\\*/\\*\\.png`, 'u'),
    'the upload glob must keep matching screenshots in both suite directories',
  );
});
