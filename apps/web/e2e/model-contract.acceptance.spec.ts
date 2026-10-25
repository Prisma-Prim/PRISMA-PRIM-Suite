import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';
import {
  prepareModelContractCase,
  modelContractIdentities,
  object,
  text,
} from './model-contract.acceptance.fixture';
import { selectOption, expectValue } from './select-option';
import { enterClassicCompatibility } from './classic-compatibility';

test('preserves a full corresponding Contract/annex from pending Offer through exact retries, review, successor, historical bytes and actual scope/access retirement', async ({
  page,
}, info) => {
  test.setTimeout(300_000);
  const releases: (() => void)[] = [];
  try {
    const narrow = info.project.name.endsWith('narrow'),
      suffix = narrow ? 'Narrow' : 'Desktop';
    const ready = await prepareModelContractCase(page, suffix);
    let currentIdentity = modelContractIdentities.owner;
    await page.route('**/api/**', (route) =>
      route.fallback({
        headers: { ...route.request().headers(), ...currentIdentity },
      }),
    );
    await page.goto('/#access');
    const admin = page.locator('.company-access');
    await expect(
      admin.getByRole('heading', { name: 'Company access', exact: true }),
    ).toBeVisible();
    await selectOption(admin.getByLabel('Workspace member'), {
      value: ready.preparerId,
    });
    await selectOption(admin.getByLabel('Company', { exact: true }), {
      label: ready.companyName,
    });
    for (const role of [
      'Company Contract Preparer',
      'Company Contract Approver',
    ]) {
      await selectOption(admin.getByLabel('Access bundle'), { label: role });
      await admin
        .getByRole('button', { name: 'Grant access', exact: true })
        .click();
      await expect(
        admin.getByText('Granted — captured version v2', { exact: true }),
      ).toBeVisible();
    }
    currentIdentity = modelContractIdentities.preparer;
    const base = `/contracts/opportunities/${ready.opportunityId}`;
    const attempts: { body: string | null; key: string | undefined }[] = [];
    let firstHtml = '',
      firstSha = '';
    await page.route(
      '**/api' + base + '/from-approved-model',
      async (route) => {
        attempts.push({
          body: route.request().postData(),
          key: route.request().headers()['idempotency-key'],
        });
        const actual = await route.fetch({
          headers: { ...route.request().headers(), ...currentIdentity },
        });
        expect(actual.status()).toBe(201);
        const recorded = object(await actual.json()),
          version = object(recorded.version),
          representation = object(version.representation);
        firstHtml = text(representation.html);
        firstSha = text(representation.sha256);
        if (attempts.length === 1)
          await route.fulfill({
            status: 503,
            contentType: 'application/json',
            body: '{}',
          });
        else if (attempts.length === 2)
          await route.fulfill({
            status: 201,
            contentType: 'application/json',
            body: JSON.stringify({
              ...recorded,
              version: { ...version, modelGeneration: null },
            }),
          });
        else await route.fulfill({ response: actual });
      },
    );
    async function openCase() {
      await page.goto('/');
      await selectCompany(page, ready.companyName, narrow);
      await navigate(page, 'Client Requests', narrow);
      const workspace = page.locator('.commercial-intake-workspace');
      await workspace
        .getByRole('button')
        .filter({ has: page.getByText(ready.subject, { exact: true }) })
        .click();
      await expect(
        workspace.getByRole('article', { name: ready.subject, exact: true }),
      ).toBeVisible();
      return workspace.locator('.model-contract-panel');
    }
    let panel = await openCase(),
      form = panel.getByRole('form', {
        name: 'Prepare full non-official Contract',
        exact: true,
      });
    await expect(
      form.getByRole('button', {
        name: 'Prepare full non-official Contract',
        exact: true,
      }),
    ).toBeEnabled();
    await expect(
      form.getByLabel('Declared document date', { exact: true }),
    ).toHaveValue('');
    await expect(
      form.getByLabel('Case Client requisites and representative wording', {
        exact: true,
      }),
    ).toHaveValue('');
    await expect(form.getByRole('checkbox')).not.toBeChecked();
    const requisites =
        ' Rechizite sintetice de caz\n<script>literalRequisites()</script> ☀️ ',
      basis =
        ' Reviewed literal eighteen Offer rows against thirteen intended Contract activities ';
    await selectOption(
      form.getByLabel('Select the exact source Offer Version', { exact: true }),
      { value: ready.offerVersionId },
    );
    await selectOption(
      form.getByLabel('Select the approved Contract model Version', {
        exact: true,
      }),
      { value: ready.modelVersionId },
    );
    await form
      .getByLabel('Declared document date', { exact: true })
      .fill('2026-10-24');
    await form
      .getByLabel('Case Client requisites and representative wording', {
        exact: true,
      })
      .fill(requisites);
    await form
      .getByLabel('Source concordance basis', { exact: true })
      .fill(basis);
    await form.getByRole('checkbox').check();
    const contractTraffic: string[] = [];
    page.on('request', (request) => {
      const path = new URL(request.url()).pathname;
      if (path.startsWith('/api' + base))
        contractTraffic.push(request.method() + ' ' + path);
    });
    const beforeLocale = contractTraffic.length;
    await selectOption(page.getByLabel('Interface language', { exact: true }), {
      value: 'fr',
    });
    await expect(
      panel
        .getByRole('form', {
          name: 'Préparer le contrat non officiel complet',
          exact: true,
        })
        .getByLabel('Coordonnées et représentation du client pour ce dossier', {
          exact: true,
        }),
    ).toHaveValue(requisites);
    await selectOption(
      page.getByLabel('Langue de l’interface', { exact: true }),
      { value: 'en' },
    );
    await expect(
      form.getByLabel('Case Client requisites and representative wording', {
        exact: true,
      }),
    ).toHaveValue(requisites);
    expect(contractTraffic).toHaveLength(beforeLocale);
    await panel.screenshot({
      path: info.outputPath(`corresponding-contract-preparation-${suffix}.png`),
    });
    await form
      .getByRole('button', {
        name: 'Prepare full non-official Contract',
        exact: true,
      })
      .click();
    for (let retry = 0; retry < 2; retry++) {
      const button = panel.getByRole('button', {
        name: 'Retry the same Contract command',
        exact: true,
      });
      await expect(button).toBeEnabled();
      await expect(
        form.getByLabel('Case Client requisites and representative wording', {
          exact: true,
        }),
      ).toBeDisabled();
      await expect(
        form.getByRole('button', {
          name: 'Reload Contract · Source Offer',
          exact: true,
        }),
      ).toBeDisabled();
      await button.click();
    }
    await expect(
      panel.getByText('Contract Version preserved.', { exact: true }),
    ).toBeVisible();
    expect(attempts).toHaveLength(3);
    expect(attempts[0]).toEqual(attempts[1]);
    expect(attempts[1]).toEqual(attempts[2]);
    expect(firstSha).toBe(createHash('sha256').update(firstHtml).digest('hex'));
    expect(firstHtml).toContain(
      '&lt;script&gt;literalRequisites()&lt;/script&gt;',
    );
    expect(firstHtml).not.toContain(basis);
    expect(firstHtml).not.toContain('Synthetic private tax declaration basis');
    await panel
      .getByRole('button', {
        name: 'Open exact Contract document',
        exact: true,
      })
      .click();
    const frame = panel.frameLocator('iframe');
    await expect(frame.locator('html')).toHaveAttribute('lang', 'ro');
    await expect(frame.locator('tbody tr')).toHaveCount(13);
    await expect(frame.locator('article>section')).toHaveCount(11);
    await panel.locator('.contract-representation').screenshot({
      path: info.outputPath(`corresponding-contract-document-${suffix}.png`),
    });
    async function exactDownload() {
      const download = page.waitForEvent('download');
      await panel
        .getByRole('button', {
          name: 'Download exact non-official Contract HTML',
          exact: true,
        })
        .click();
      const path = await (await download).path();
      if (!path) throw new Error('Missing exact HTML download');
      return readFile(path, 'utf8');
    }
    expect(await exactDownload()).toBe(firstHtml);
    await panel
      .getByRole('button', { name: 'Run Contract Quality Checks', exact: true })
      .click();
    await expect(
      panel.getByText('Contract checks recorded.', { exact: true }),
    ).toBeVisible();
    const checkPanel = panel.getByRole('region', {
      name: 'Contract Quality Checks',
      exact: true,
    });
    await expect(checkPanel.locator('li')).toHaveCount(17);
    const warnings = checkPanel.getByRole('checkbox', {
      name: 'I acknowledge this warning',
      exact: true,
    });
    await expect(warnings).toHaveCount(2);
    for (const checkbox of await warnings.all()) {
      await expect(checkbox).not.toBeChecked();
      await checkbox.check();
    }
    await checkPanel
      .getByLabel('Exact Contract and annex review basis', { exact: true })
      .fill(' Synthetic exact Contract and thirteen-row annex review ');
    await checkPanel
      .getByRole('button', {
        name: 'Approve exact Contract Version',
        exact: true,
      })
      .click();
    await expect(
      panel.getByText('Internal Contract decision recorded.', { exact: true }),
    ).toBeVisible();
    const pendingOffer = object(
      object(
        await ready.read(
          `/offers/opportunities/${ready.opportunityId}`,
          ready.companyId,
        ),
      ).offer,
    );
    expect(object(pendingOffer.version)).toMatchObject({
      clientResponseState: 'PENDING',
      clientResponse: null,
    });
    await panel.screenshot({
      path: info.outputPath(`corresponding-contract-approved-${suffix}.png`),
    });

    let releaseEarlier: (() => void) | undefined,
      heldEarlier = false;
    await page.route('**/api' + base + '/model-selection', async (route) => {
      if (!heldEarlier) return route.fallback();
      heldEarlier = false;
      const actual = await route.fetch({
        headers: { ...route.request().headers(), ...currentIdentity },
      });
      await new Promise<void>((resolve) => {
        releaseEarlier = resolve;
        releases.push(resolve);
      });
      await route.fulfill({ response: actual }).catch(() => undefined);
    });
    await panel
      .getByRole('button', {
        name: 'Copy this Version into a successor draft',
        exact: true,
      })
      .click();
    form = panel.getByRole('form', {
      name: 'Prepare a complete successor',
      exact: true,
    });
    await expect(
      form.getByRole('button', {
        name: 'Prepare full non-official Contract',
        exact: true,
      }),
    ).toBeEnabled();
    await expect(
      form.getByLabel('Case Client requisites and representative wording', {
        exact: true,
      }),
    ).toHaveValue(requisites);
    await expect(form.getByRole('checkbox')).not.toBeChecked();
    await expectValue(
      form.getByLabel('Select the exact source Offer Version', { exact: true }),
      '',
    );
    await expectValue(
      form.getByLabel('Select the approved Contract model Version', {
        exact: true,
      }),
      '',
    );
    await selectOption(
      form.getByLabel('Select the exact source Offer Version', { exact: true }),
      { value: ready.offerVersionId },
    );
    await selectOption(
      form.getByLabel('Select the approved Contract model Version', {
        exact: true,
      }),
      { value: ready.modelVersionId },
    );
    const revised = ' Corrected literal Client requisites DEMO ' + suffix;
    await form
      .getByLabel('Case Client requisites and representative wording', {
        exact: true,
      })
      .fill(revised);
    await form.getByRole('checkbox').check();
    heldEarlier = true;
    await form
      .getByRole('button', {
        name: 'Reload Contract · Source Offer',
        exact: true,
      })
      .click();
    await expect.poll(() => Boolean(releaseEarlier)).toBe(true);
    const successors: { body: string | null; key: string | undefined }[] = [];
    await page.route(
      '**/api' + base + '/versions/from-approved-model',
      async (route) => {
        successors.push({
          body: route.request().postData(),
          key: route.request().headers()['idempotency-key'],
        });
        const actual = await route.fetch({
          headers: { ...route.request().headers(), ...currentIdentity },
        });
        expect(actual.status()).toBe(201);
        if (successors.length === 1)
          await route.fulfill({
            status: 503,
            contentType: 'application/json',
            body: '{}',
          });
        else await route.fulfill({ response: actual });
      },
    );
    await form
      .getByRole('button', {
        name: 'Prepare full non-official Contract',
        exact: true,
      })
      .click();
    await expect(
      panel.getByRole('button', {
        name: 'Retry the same Contract command',
        exact: true,
      }),
    ).toBeEnabled();
    releaseEarlier?.();
    for (const name of [
      'Copy this Version into a successor draft',
      'Run Contract Quality Checks',
      'Download exact non-official Contract HTML',
      'Reload Contract',
      'Contract Version history',
    ])
      await expect(
        panel.getByRole('button', { name, exact: true }),
      ).toBeDisabled();
    await enterClassicCompatibility(page);
    await expect(
      form.getByLabel('Case Client requisites and representative wording', {
        exact: true,
      }),
    ).toHaveValue(revised);
    await page.getByRole('button', { name: 'Try Prisme', exact: true }).click();
    await expect(
      panel.getByRole('button', {
        name: 'Retry the same Contract command',
        exact: true,
      }),
    ).toBeEnabled();
    await panel
      .getByRole('button', {
        name: 'Retry the same Contract command',
        exact: true,
      })
      .click();
    await expect(form).toHaveCount(0);
    expect(successors).toHaveLength(2);
    expect(successors[0]).toEqual(successors[1]);
    await expect(
      panel.getByText(revised.trim(), { exact: true }),
    ).toBeVisible();
    await panel
      .getByRole('button', { name: 'Contract Version history', exact: true })
      .click();
    await panel
      .getByRole('button', { name: 'Open Contract Version 1', exact: true })
      .click();
    await expect(
      panel.getByText(requisites.trim(), { exact: true }),
    ).toBeVisible();
    expect(await exactDownload()).toBe(firstHtml);
    await expect(
      panel.getByRole('button', {
        name: 'Run Contract Quality Checks',
        exact: true,
      }),
    ).toBeDisabled();
    await ready.command(
      `/contract-models/consulting-ro/versions/${ready.modelVersionId}/withdrawal`,
      {
        expectedModelRevision: 2,
        versionNumber: 1,
        reason: 'Synthetic future-use withdrawal',
      },
      modelContractIdentities.preparer,
      ready.companyId,
    );
    for (const role of [
      'company-contract-model-editor',
      'company-contract-model-approver',
      'company-profitability-contributor',
    ])
      await ready.revoke(role);
    currentIdentity = modelContractIdentities.reader;
    panel = await openCase();
    await expect(
      panel.getByText(revised.trim(), { exact: true }),
    ).toBeVisible();
    await expect(
      panel.getByRole('button', {
        name: 'Copy this Version into a successor draft',
        exact: true,
      }),
    ).toHaveCount(0);

    let releaseHistory: (() => void) | undefined;
    await page.route('**/api' + base + '/versions', async (route) => {
      const actual = await route.fetch({
        headers: { ...route.request().headers(), ...currentIdentity },
      });
      await new Promise<void>((resolve) => {
        releaseHistory = resolve;
        releases.push(resolve);
      });
      await route.fulfill({ response: actual }).catch(() => undefined);
    });
    await panel
      .getByRole('button', { name: 'Contract Version history', exact: true })
      .click();
    await expect.poll(() => Boolean(releaseHistory)).toBe(true);
    await selectCompany(page, ready.otherCompanyName, narrow);
    await expect(page.locator('.model-contract-panel')).toHaveCount(0);
    releaseHistory?.();
    await expect(page.getByText(revised.trim(), { exact: true })).toHaveCount(
      0,
    );
    await page.unroute('**/api' + base + '/versions');
    panel = await openCase();
    await expect(
      panel.getByText(revised.trim(), { exact: true }),
    ).toBeVisible();
    await ready.revoke('company-contract-approver', ready.readerId);
    await panel
      .getByRole('button', { name: 'Reload Contract', exact: true })
      .click();
    await expect(page.locator('.model-contract-panel')).toHaveCount(0);
    await expect(page.getByText(revised.trim(), { exact: true })).toHaveCount(
      0,
    );
    await page.screenshot({
      path: info.outputPath(`corresponding-contract-retired-${suffix}.png`),
      fullPage: true,
    });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
  } finally {
    for (const release of releases) release();
  }
});
async function selectCompany(page: Page, name: string, narrow: boolean) {
  if (narrow)
    await page.getByRole('button', { name: 'Open navigation' }).click();
  await selectOption(page.getByLabel('Active Company', { exact: true }), {
    label: name,
  });
  if (narrow)
    await page.getByRole('button', { name: 'Close navigation' }).click();
}
async function navigate(page: Page, name: string, narrow: boolean) {
  if (narrow)
    await page.getByRole('button', { name: 'Open navigation' }).click();
  await page
    .getByRole('navigation', { name: 'Primary navigation' })
    .getByRole('link', { name, exact: true })
    .click();
}
