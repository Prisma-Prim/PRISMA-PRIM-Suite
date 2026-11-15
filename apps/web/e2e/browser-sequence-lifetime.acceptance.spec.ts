import * as fc from 'fast-check';
import { readFile, rename } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import { runBrowserSequences } from './browser-sequences.fixture';
import { paymentSequenceAdapter } from './payment-browser-sequences.fixture';
import {
  paymentIdentities,
  paymentObject,
} from './payment-evidence-source.acceptance.fixture';

test('finishes native trial cleanup before publishing budget interruption', async ({
  page,
}, info) => {
  test.setTimeout(120_000);
  const previousBudget = process.env.UI_SEQUENCE_BUDGET_MS;
  const previousRuns = process.env.UI_SEQUENCE_RUNS;
  process.env.UI_SEQUENCE_BUDGET_MS = '200';
  process.env.UI_SEQUENCE_RUNS = '1';
  try {
    await expect(
      runBrowserSequences({
        page,
        info,
        adapter: {
          ...paymentSequenceAdapter,
          initial: fc.constant('review'),
        },
      }),
    ).rejects.toThrow(/Browser sequences/u);
  } finally {
    if (previousBudget === undefined) delete process.env.UI_SEQUENCE_BUDGET_MS;
    else process.env.UI_SEQUENCE_BUDGET_MS = previousBudget;
    if (previousRuns === undefined) delete process.env.UI_SEQUENCE_RUNS;
    else process.env.UI_SEQUENCE_RUNS = previousRuns;
  }
  const reportPath = info.outputPath('payment-observation-sequences.json');
  const report = paymentObject(JSON.parse(await readFile(reportPath, 'utf8')));
  if (!Array.isArray(report.trials))
    throw new Error('Missing native trial evidence.');
  expect(report.trials).toHaveLength(1);
  expect(report.status).toBe('interrupted');
  await expect(
    page.getByText(paymentIdentities.confirmer['x-test-display-name'], {
      exact: true,
    }),
  ).toHaveCount(1);
  await page.reload();
  await expect(
    page.getByText(paymentIdentities.reader['x-test-display-name'], {
      exact: true,
    }),
  ).toHaveCount(1);
  // This expected interruption is evidence about cleanup, not financial coverage.
  await rename(reportPath, info.outputPath('budget-interruption.json'));
});
