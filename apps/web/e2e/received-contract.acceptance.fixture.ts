import { expect, type Page, type Locator } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import {
  modelContractIdentities,
  object,
  prepareModelContractCase,
  text,
} from './model-contract.acceptance.fixture';
import { selectOption } from './select-option';

export { modelContractIdentities, object, text };
export async function prepareReceivedContractCase(page: Page, suffix: string) {
  const ready = await prepareModelContractCase(page, 'received-' + suffix);
  for (const bundle of [
    'company-contract-preparer',
    'company-document-registrar',
    'company-document-content-reader',
    'company-document-content-uploader',
    'company-document-approver',
  ])
    await ready.command('/' + bundle + '-assignments', {
      companyId: ready.companyId,
      workspaceMembershipId: ready.preparerId,
    });
  await ready.command('/company-context-assignments', {
    companyId: ready.otherCompanyId,
    workspaceMembershipId: ready.preparerId,
  });
  const model = object(
    (await ready.read('/contract-models/consulting-ro', ready.companyId)).model,
  );
  const intent = {
    sourceOfferVersionId: ready.offerVersionId,
    modelVersionId: ready.modelVersionId,
    modelVersionNumber: 1,
    modelApprovalDecisionId: text(object(object(model.head).decision).id),
    documentDate: '2026-10-25',
    clientDetails: 'Synthetic case requisites only',
    termStartsOn: null,
    termEndsOn: null,
    specialConditions: null,
    sourceConcordanceDeclaration: true,
    sourceConcordanceBasis:
      'Synthetic eighteen Offer rows and thirteen Contract activities deliberately compared',
  };
  const contract = await ready.command(
    `/contracts/opportunities/${ready.opportunityId}/from-approved-model`,
    intent,
    modelContractIdentities.preparer,
    ready.companyId,
  );
  const contractId = text(contract.id),
    contractVersionId = text(object(contract.version).id);
  const pdfA = await readFile(
    new URL(
      '../../api/test-support/fixtures/questionnaire-demo.pdf',
      import.meta.url,
    ),
  );
  const pdfB = Buffer.from(pdfA);
  pdfB.write('NEXT', pdfB.indexOf('DEMO'), 'ascii');
  return { ...ready, intent, contractId, contractVersionId, pdfA, pdfB };
}
export async function navigateReceived(
  page: Page,
  name: string,
  narrow: boolean,
) {
  if (narrow)
    await page.getByRole('button', { name: 'Open navigation' }).click();
  await page
    .getByRole('navigation', { name: 'Primary navigation' })
    .getByRole('link', { name, exact: true })
    .click();
}
export async function selectReceivedCompany(
  page: Page,
  name: string,
  narrow: boolean,
) {
  if (narrow)
    await page.getByRole('button', { name: 'Open navigation' }).click();
  await selectOption(page.getByLabel('Active Company', { exact: true }), {
    label: name,
  });
  if (narrow)
    await page.getByRole('button', { name: 'Close navigation' }).click();
}
export async function openReceivedDocuments(
  page: Page,
  name: string,
  narrow: boolean,
) {
  await page.goto('/');
  await selectReceivedCompany(page, name, narrow);
  await navigateReceived(page, 'Working Documents', narrow);
  return page.locator('.working-documents');
}
export async function exactReceivedDownload(
  page: Page,
  button: Locator,
  bytes: Buffer,
) {
  const pending = page.waitForEvent('download');
  await button.click();
  const download = await pending,
    path = await download.path();
  if (!path) throw new Error('Missing received PDF download');
  expect(await readFile(path)).toEqual(bytes);
}
