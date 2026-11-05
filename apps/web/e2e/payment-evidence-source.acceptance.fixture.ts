import { createHash, randomUUID } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { basename } from 'node:path';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import {
  expect,
  type Locator,
  type Page,
  type TestInfo,
} from '@playwright/test';
import { selectOption } from './select-option';

export const paymentApiOrigin = 'http://127.0.0.1:4174/api';
function identity(subject: string, name: string, email: string) {
  return {
    'x-test-external-provider': 'local-demo',
    'x-test-external-subject': subject,
    'x-test-display-name': name,
    'x-test-email': email,
  };
}
// The native operational-foundation global setup provisions these identities.
// This fixture invokes no commercial, Contract, Invoice or Payment setup.
export const paymentIdentities = {
  owner: identity('workspace-owner', 'Workspace Owner', 'owner@example.test'),
  reader: identity(
    'local-demonstration-user',
    'Ada Ionescu',
    'ada@example.test',
  ),
  confirmer: identity('responsible-colleague', 'Ion Popa', 'ion@example.test'),
  reverser: identity(
    'commercial-readonly-member',
    'Commercial Reader',
    'commercial-reader@example.test',
  ),
};
export type PaymentIdentity = (typeof paymentIdentities)['owner'];
export function paymentObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Expected a public API object');
  return Object.fromEntries(Object.entries(value));
}
export function paymentText(value: unknown): string {
  if (typeof value !== 'string' || !value)
    throw new Error('Expected a public API identifier');
  return value;
}
export function paymentInteger(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 1)
    throw new Error('Expected a public API revision');
  return value;
}

/** The only business setup is native Company -> Client -> optional payer entity. */
export async function preparePaymentEvidenceCase(page: Page, suffix: string) {
  async function command(
    path: string,
    body: unknown,
    companyId?: string,
    actor = paymentIdentities.owner,
  ) {
    const response = await page.request.post(paymentApiOrigin + path, {
      headers: {
        ...actor,
        ...(companyId ? { 'x-company-context-id': companyId } : {}),
        'idempotency-key': randomUUID(),
      },
      data: body,
    });
    expect(response.status(), path).toBe(201);
    return paymentObject(await response.json());
  }
  async function read(
    path: string,
    companyId?: string,
    actor = paymentIdentities.owner,
  ) {
    const response = await page.request.get(paymentApiOrigin + path, {
      headers: {
        ...actor,
        ...(companyId ? { 'x-company-context-id': companyId } : {}),
      },
    });
    expect(response.status(), path).toBe(200);
    return paymentObject(await response.json());
  }
  const companyName = `Fictional payment source ${suffix}`;
  const companyId = paymentText(
    (await command('/companies', { displayName: companyName })).id,
  );
  const ownerId = paymentText(
    (await read('/access/current-actor')).workspaceMembershipId,
  );
  async function grant(bundle: string, workspaceMembershipId = ownerId) {
    await command(`/${bundle}-assignments`, {
      companyId,
      workspaceMembershipId,
    });
  }
  async function revoke(bundle: string, workspaceMembershipId = ownerId) {
    const response = await page.request.delete(
      `${paymentApiOrigin}/${bundle}-assignments/${workspaceMembershipId}/${companyId}`,
      {
        headers: {
          ...paymentIdentities.owner,
          'idempotency-key': randomUUID(),
        },
      },
    );
    expect(response.status(), bundle).toBe(200);
  }
  for (const bundle of [
    'company-context',
    'company-director-client',
    'company-document-registrar',
    'company-document-approver',
    'company-document-content-reader',
    'company-document-content-uploader',
  ])
    await grant(bundle);
  const actor = await read('/access/current-actor', companyId);
  expect(paymentObject(actor.activeCompany).paymentGrants).toBeUndefined();
  const clientName = `Fictional original payer Ș Я é ${suffix}`;
  const primaryParty = {
    kind: 'PRIMARY',
    legalName: clientName,
    taxId: `FICT-PRIMARY-${suffix}`,
    legalAddress: 'Fictional primary address',
  };
  const client = await command(
    '/clients',
    {
      displayName: clientName,
      taxId: primaryParty.taxId,
      address: primaryParty.legalAddress,
    },
    companyId,
  );
  const clientId = paymentText(client.id);
  const dossier = await read(`/clients/${clientId}`, companyId);
  const entityResult = await command(
    `/clients/${clientId}/legal-entities`,
    {
      expectedClientVersion: paymentInteger(dossier.version),
      legalName: `Fictional additional payer Ș Я é ${suffix}`,
      taxId: `FICT-ADDITIONAL-${suffix}`,
      legalAddress: 'Fictional additional address',
    },
    companyId,
  );
  const entity = paymentObject(entityResult.legalEntity);
  const legalEntityId = paymentText(entity.id);
  const additionalParty = {
    kind: 'ADDITIONAL',
    legalEntityId,
    legalName: paymentText(entity.legalName),
    taxId: entity.taxId,
    legalAddress: entity.legalAddress,
  };
  const [pdfA, pdfB, pdfC] = await Promise.all(
    ['A', 'B', 'C'].map(paymentNoticePdf),
  );
  if (!pdfA || !pdfB || !pdfC) throw new Error('Missing fictional PDF bytes');
  return {
    companyId,
    companyName,
    ownerId,
    clientId,
    clientName,
    legalEntityId,
    primaryParty,
    additionalParty,
    pdfA,
    pdfB,
    pdfC,
    command,
    read,
    grant,
    revoke,
  };
}
export type PaymentEvidenceCase = Awaited<
  ReturnType<typeof preparePaymentEvidenceCase>
>;

async function paymentNoticePdf(revision: string) {
  const pdf = await PDFDocument.create();
  pdf.setCreationDate(new Date('2026-01-15T00:00:00Z'));
  pdf.setModificationDate(new Date('2026-01-15T00:00:00Z'));
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const page = pdf.addPage([612, 792]);
  for (const [index, line] of [
    'Fictional payment notice - not bank or fiscal proof',
    'FICT-PAY-001',
    'Declared notice amount: 1255.50 MDL',
    'Declared notice date: 2026-01-15',
    `Preserved source revision ${revision}`,
  ].entries())
    page.drawText(line, { x: 40, y: 740 - index * 26, size: 12, font });
  return Buffer.from(await pdf.save());
}

export async function administerPaymentRoles(
  page: Page,
  ready: PaymentEvidenceCase,
) {
  await page.goto('/#access');
  await page.reload();
  const administration = page.locator('.company-access');
  await selectOption(administration.getByLabel('Workspace member'), {
    value: ready.ownerId,
  });
  await selectOption(administration.getByLabel('Company', { exact: true }), {
    value: ready.companyId,
  });
  for (const bundle of [
    'payment-reader',
    'payment-recorder',
    'payment-confirmer',
    'payment-reverser',
    'payment-evidence-access',
  ]) {
    await selectOption(administration.getByLabel('Access bundle'), {
      value: bundle,
    });
    await expect(
      administration.getByText('Not granted', { exact: true }),
    ).toBeVisible();
    await administration
      .getByRole('button', { name: 'Grant access', exact: true })
      .click();
    await expect(
      administration.getByText('Granted — captured version v1', {
        exact: true,
      }),
    ).toBeVisible();
  }
  const actor = await ready.read('/access/current-actor', ready.companyId);
  const grants: unknown = paymentObject(actor.activeCompany).paymentGrants;
  expect(grants).toHaveLength(5);
}

export async function openPaymentEvidence(
  page: Page,
  ready: PaymentEvidenceCase,
  narrow: boolean,
  title?: string,
) {
  await page.goto('/');
  if (narrow)
    await page.getByRole('button', { name: 'Open navigation' }).click();
  await selectOption(page.getByLabel('Active Company', { exact: true }), {
    value: ready.companyId,
  });
  if (narrow)
    await page.getByRole('button', { name: 'Close navigation' }).click();
  if (narrow)
    await page.getByRole('button', { name: 'Open navigation' }).click();
  await page
    .getByRole('navigation', { name: 'Primary navigation' })
    .getByRole('link', { name: 'Working Documents', exact: true })
    .click();
  await page
    .locator('.working-documents')
    .getByRole('button', { name: 'Payment evidence', exact: true })
    .click();
  const source = page.locator('.payment-evidence-source');
  await expect(source).toBeVisible();
  if (title)
    await source
      .locator('.payment-evidence-inventory li')
      .filter({ has: page.getByText(title, { exact: true }) })
      .getByRole('button', { name: 'Open evidence', exact: true })
      .click();
  return source;
}

export async function exactPaymentDownload(
  page: Page,
  button: Locator,
  bytes: Buffer,
) {
  const pending = page.waitForEvent('download');
  await button.click();
  const download = await pending;
  const path = await download.path();
  if (!path) throw new Error('Missing native payment evidence PDF download');
  expect(await readFile(path)).toEqual(bytes);
}

/** Originals stay in Playwright's registered acceptance output directory. */
export function paymentEvidenceArtifacts(info: TestInfo) {
  const originals: { path: string; bytes: number; sha256: string }[] = [];
  return {
    async screenshot(
      page: Page,
      name: string,
      options: { fullPage?: boolean } = {},
    ) {
      const path = info.outputPath(name + '.png');
      const bytes = await page.screenshot({
        path,
        fullPage: options.fullPage ?? true,
      });
      originals.push({
        path: basename(path),
        bytes: bytes.length,
        sha256: createHash('sha256').update(bytes).digest('hex'),
      });
      const manifest = info.outputPath('payment-evidence-originals.json');
      await writeFile(
        manifest,
        JSON.stringify(
          {
            format: 'payment-evidence-acceptance-originals/1',
            project: info.project.name,
            viewport: info.project.use.viewport,
            title: info.title,
            originals,
          },
          null,
          2,
        ) + '\n',
      );
    },
  };
}
