import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';
import { selectOption } from './select-option';
import { enterClassicCompatibility } from './classic-compatibility';
import { missionApplicabilityMessages } from '../src/project/mission-applicability.copy';
import { resolveMessage, formatMessage } from '../src/localization/messages';
import { taskResultMessages } from '../src/project/task-results.copy';

const origin = 'http://127.0.0.1:4174/api';
const ada = {
  'x-test-external-provider': 'local-demo',
  'x-test-external-subject': 'local-demonstration-user',
  'x-test-display-name': 'Ada Ionescu',
  'x-test-email': 'ada@example.test',
};
const owner = {
  ...ada,
  'x-test-external-subject': 'workspace-owner',
  'x-test-display-name': 'Workspace Owner',
  'x-test-email': 'owner@example.test',
};
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Expected public response');
  return Object.fromEntries(Object.entries(value));
}
function text(value: unknown) {
  if (typeof value !== 'string' || !value)
    throw new Error('Expected public identity');
  return value;
}
function objects(value: unknown) {
  if (!Array.isArray(value)) throw new Error('Expected source activities');
  const rows: unknown[] = value;
  return rows.map(object);
}
async function openProject(
  page: Page,
  companyId: string,
  title: string,
  narrow: boolean,
) {
  await page.goto('/');
  if (narrow)
    await page.getByRole('button', { name: 'Open navigation' }).click();
  await selectOption(
    page.getByLabel('Active Company', { exact: true }),
    companyId,
  );
  if (narrow)
    await page.getByRole('button', { name: 'Close navigation' }).click();
  if (narrow)
    await page.getByRole('button', { name: 'Open navigation' }).click();
  await page
    .getByRole('navigation', { name: 'Primary navigation' })
    .getByRole('link', { name: 'Projects', exact: true })
    .click();
  const projects = page.locator('.project-workspace');
  await projects.getByRole('searchbox', { name: 'Find Projects' }).fill(title);
  await projects
    .getByRole('list', { name: 'Projects', exact: true })
    .getByRole('button', { name: new RegExp(title, 'u') })
    .click();
  return projects;
}

for (const frame of ['prisme', 'classic'] as const)
  for (const locale of ['en', 'ro', 'fr', 'ru'] as const)
    test(`completes attributable applicability proposal/correction/decision/restore in ${frame} / ${locale} with independent native work`, async ({
      page,
    }, info) => {
      test.setTimeout(120_000);
      const narrow = info.project.name.endsWith('narrow'),
        suffix = `${frame}-${locale}-${narrow ? 'narrow' : 'desktop'}`,
        membershipId = text(process.env.ACCEPTANCE_PRIMARY_MEMBERSHIP_ID);
      const copy = (key: (typeof missionApplicabilityMessages.keys)[number]) =>
        resolveMessage(missionApplicabilityMessages, locale, key);
      async function captureViewport(name: string) {
        const skip = page.locator('.prisme-skip-link');
        if (await skip.count()) {
          await expect(skip).not.toBeFocused();
          const box = await skip.boundingBox();
          if (!box) throw new Error('Expected native skip-link layout');
          expect(box.y + box.height).toBeLessThanOrEqual(0);
        }
        // A native viewport image distinguishes visible UI from Chromium's
        // offscreen fixed-element artifacts in tall beyond-viewport captures.
        await page.screenshot({
          path: info.outputPath(name + '-viewport-' + suffix + '.png'),
        });
      }
      const companyResponse = await page.request.post(origin + '/companies', {
        headers: { ...owner, 'idempotency-key': randomUUID() },
        data: { displayName: 'Applicability DEMO ' + suffix },
      });
      expect(companyResponse.status()).toBe(201);
      const companyId = text(object(await companyResponse.json()).id),
        headers = { ...ada, 'x-company-context-id': companyId };
      async function assign(bundle: string, active = true) {
        const path = origin + `/company-${bundle}-assignments`;
        const response = active
          ? await page.request.post(path, {
              headers: { ...owner, 'idempotency-key': randomUUID() },
              data: { companyId, workspaceMembershipId: membershipId },
            })
          : await page.request.delete(path + `/${membershipId}/${companyId}`, {
              headers: { ...owner, 'idempotency-key': randomUUID() },
            });
        expect(response.status()).toBe(active ? 201 : 200);
      }
      for (const bundle of [
        'context',
        'director-client',
        'project',
        'task-manager',
        'project-template-user',
        'document-registrar',
        'mission-deliverable-access',
        'document-content-reader',
        'document-content-uploader',
        'document-approver',
        'document-project-organizer',
        'task-result-recorder',
        'mission-applicability-coordinator',
        'mission-applicability-approver',
      ])
        await assign(bundle);
      async function post(path: string, data: unknown) {
        const response = await page.request.post(origin + path, {
          headers: { ...headers, 'idempotency-key': randomUUID() },
          data,
        });
        expect(response.status(), path).toBe(201);
        return object(await response.json());
      }
      async function read(path: string) {
        const response = await page.request.get(origin + path, { headers });
        expect(response.status(), path).toBe(200);
        return object(await response.json());
      }
      const clientId = text(
          (
            await post('/clients', {
              displayName: 'Applicability Client DEMO ' + suffix,
            })
          ).id,
        ),
        title = 'Applicability Project DEMO ' + suffix;
      const projectId = text(
          (
            await post('/projects/from-template', {
              clientAccountId: clientId,
              title,
              templateKey: 'CONSULTING_MISSION_PILOT_ILLUSTRATIVE',
              templateVersion: 1,
            })
          ).id,
        ),
        path = `/projects/${projectId}/mission-applicability`;
      const source = await read(`/projects/${projectId}/template`),
        activity = objects(object(source.template).activities)[6];
      if (!activity) throw new Error('Missing preserved CT_AN07');
      const taskId = text(activity.taskId);
      const document = await post('/documents', {
          type: 'mission-deliverable',
          clientId,
          title: 'Frozen applicability continuation DEMO ' + suffix,
          purpose: 'Independent result evidence',
        }),
        documentId = text(document.id),
        versionId = text(object(document.version).id);
      const bytes = await readFile(
        new URL(
          '../../api/test-support/fixtures/questionnaire-demo.pdf',
          import.meta.url,
        ),
      );
      const upload = await page.request.post(
        origin +
          `/documents/${documentId}/versions/${versionId}/content?expectedRevision=1&fileName=applicability-demo.pdf`,
        {
          headers: {
            ...headers,
            'idempotency-key': randomUUID(),
            'content-type': 'application/pdf',
          },
          data: bytes,
        },
      );
      expect(upload.status()).toBe(201);
      expect(
        (
          await page.request.post(
            origin +
              `/documents/${documentId}/versions/${versionId}/official-designation`,
            {
              headers: { ...headers, 'idempotency-key': randomUUID() },
              data: { expectedRevision: 2 },
            },
          )
        ).status(),
      ).toBe(200);
      await post(`/documents/${documentId}/project-association`, {
        action: 'link',
        projectId,
        expectedRevision: 0,
      });
      await post(`/tasks/${taskId}/results`, {
        expectedTaskVersion: 1,
        expectedResultRevision: 0,
        documentId,
        versionId,
        declaration: 'Independent literal result DEMO Ж / 🌍',
      });
      const nativeBefore = {
        task: await read(`/tasks/${taskId}`),
        result: await read(`/tasks/${taskId}/results`),
        review: await read(`/projects/${projectId}/mission-result-reviews`),
        lifecycle: await read(`/projects/${projectId}/lifecycle`),
      };
      const projects = await openProject(page, companyId, title, narrow);
      if (frame === 'classic') await enterClassicCompatibility(page);
      // Locale and presentation change the actual mounted production interface.
      await selectOption(page.locator('#interface-locale'), locale);
      const panel = page.getByRole('region', {
        name: copy('title'),
        exact: true,
      });
      await expect(
        panel.getByText(copy('empty'), { exact: true }),
      ).toBeVisible();
      await expect(
        panel.getByText(copy('certificationHold'), { exact: true }),
      ).toBeVisible();
      const selector = panel.getByRole('combobox', {
        name: copy('select'),
        exact: true,
      });
      await selector.focus();
      await page.keyboard.press('ArrowDown');
      await page.keyboard.press('End');
      await page.keyboard.press('Enter');
      await expect(
        panel.getByRole('heading', { name: /CT_AN13/u }),
      ).toBeVisible();
      await selectOption(selector, taskId);
      await panel
        .getByRole('button', { name: copy('reviewProposal'), exact: true })
        .focus();
      await page.keyboard.press('Enter');
      await expect(
        panel.getByRole('textbox', { name: copy('reason'), exact: true }),
      ).toBeFocused();
      const reason =
        'DEMO literal scope\nЖ / é / 🌍 <script>inert()</script> ' +
        'LongUnbrokenLiteral'.repeat(35);
      async function fillProposal(agreement = 'PARTIES_AGREEMENT_UNAVAILABLE') {
        await panel
          .getByRole('textbox', { name: copy('reason'), exact: true })
          .fill(reason);
        await panel
          .getByRole('textbox', { name: copy('scopeBasis'), exact: true })
          .fill('DEMO explicitly reported case scope');
        await selectOption(
          panel.getByRole('combobox', { name: copy('agreement'), exact: true }),
          agreement,
        );
        await panel
          .getByRole('textbox', {
            name: copy(
              agreement === 'PARTIES_AGREEMENT_REPORTED'
                ? 'reference'
                : 'agreementBasis',
            ),
            exact: true,
          })
          .fill(
            agreement === 'PARTIES_AGREEMENT_REPORTED'
              ? 'https://example.test/DEMO-agreement literal source — not verified'
              : 'DEMO parties agreement unavailable',
          );
      }
      await fillProposal();
      await captureViewport('literal-proposal');
      await panel.screenshot({
        path: info.outputPath('literal-proposal-' + suffix + '.png'),
      });
      await panel
        .getByRole('button', { name: copy('reviewProposal'), exact: true })
        .click();
      let originalReceipt: Record<string, unknown> | undefined;
      const attempts: Array<{ body: string | null; key: string | undefined }> =
        [];
      // Only transport delivery is disrupted. route.fetch commits through the REAL
      // API/PG; no intercepted DTO or child fixture stands in for business behavior.
      await page.route('**/api' + path, async (route) => {
        if (route.request().method() !== 'POST') {
          await route.continue();
          return;
        }
        attempts.push({
          body: route.request().postData(),
          key: route.request().headers()['idempotency-key'],
        });
        if (attempts.length === 1) {
          const response = await route.fetch();
          expect(response.status()).toBe(201);
          originalReceipt = object(await response.json());
          await route.abort('failed');
        } else await route.continue();
      });
      await panel
        .getByRole('button', { name: copy('recordProposal'), exact: true })
        .click();
      await expect(
        panel.getByText(copy('uncertain'), { exact: true }),
      ).toBeVisible();
      expect(object((await read(path)).applicability).revision).toBe(1);
      await panel
        .getByRole('button', { name: copy('retry'), exact: true })
        .click();
      await expect(
        panel.getByText(copy('confirmed'), { exact: true }),
      ).toBeVisible();
      expect(attempts).toHaveLength(2);
      expect(attempts[1]).toEqual(attempts[0]);
      expect(originalReceipt?.applicabilityRevision).toBe(1);
      await page.unroute('**/api' + path);
      await expect(
        panel.getByRole('button', {
          name: copy('reviewCorrection'),
          exact: true,
        }),
      ).toBeVisible();
      await panel
        .getByRole('textbox', { name: copy('decisionBasis'), exact: true })
        .fill('DEMO explicit human basis');
      await panel
        .getByRole('button', { name: copy('reviewDecision'), exact: true })
        .click();
      await panel
        .getByRole('button', { name: copy('recordDecision'), exact: true })
        .click();
      await expect(
        panel.getByText(copy('conflict'), { exact: true }),
      ).toBeVisible();
      expect(object((await read(path)).applicability).revision).toBe(1);
      await panel
        .getByRole('button', { name: copy('reload'), exact: true })
        .click();
      await expect(
        panel.getByRole('textbox', {
          name: copy('correctionReason'),
          exact: true,
        }),
      ).toBeVisible();
      await fillProposal('PARTIES_AGREEMENT_REPORTED');
      await panel
        .getByRole('textbox', { name: copy('correctionReason'), exact: true })
        .fill('DEMO obtained a reported literal source');
      await panel
        .getByRole('button', { name: copy('reviewCorrection'), exact: true })
        .click();
      await panel
        .getByRole('button', { name: copy('recordCorrection'), exact: true })
        .click();
      await expect
        .poll(async () => object((await read(path)).applicability).revision)
        .toBe(2);
      await panel
        .getByRole('textbox', { name: copy('decisionBasis'), exact: true })
        .fill('DEMO exact proposal approved for this scope only');
      await panel
        .getByRole('button', { name: copy('reviewDecision'), exact: true })
        .click();
      await panel
        .getByRole('button', { name: copy('recordDecision'), exact: true })
        .click();
      await expect(
        panel.getByText(copy('EXCLUDED_BY_APPROVER'), { exact: true }),
      ).toBeVisible();
      await expect(panel.locator('.applicability-literal a')).toHaveCount(0);
      await expect(
        panel
          .getByRole('region', { name: copy('history'), exact: true })
          .locator('.applicability-fact'),
      ).toHaveCount(3);
      await captureViewport('approved-history');
      await panel.screenshot({
        path: info.outputPath('approved-history-' + suffix + '.png'),
      });
      await panel
        .getByRole('textbox', { name: copy('restorationBasis'), exact: true })
        .fill('DEMO activity is required again');
      await panel
        .getByRole('button', { name: copy('reviewRestoration'), exact: true })
        .click();
      await panel
        .getByRole('button', { name: copy('recordRestoration'), exact: true })
        .click();
      await expect(
        panel.getByText(copy('REQUIRED'), { exact: true }),
      ).toBeVisible();
      await fillProposal('NO_CONTRACTUAL_CHANGE_REPORTED');
      await panel
        .getByRole('button', { name: copy('reviewProposal'), exact: true })
        .click();
      await panel
        .getByRole('button', { name: copy('recordProposal'), exact: true })
        .click();
      await expect
        .poll(async () => object((await read(path)).applicability).revision)
        .toBe(5);
      await selectOption(
        panel.getByRole('combobox', { name: copy('outcome'), exact: true }),
        'REJECT',
      );
      await panel
        .getByRole('textbox', { name: copy('decisionBasis'), exact: true })
        .fill('DEMO retain required work');
      await panel
        .getByRole('button', { name: copy('reviewDecision'), exact: true })
        .click();
      await panel
        .getByRole('button', { name: copy('recordDecision'), exact: true })
        .click();
      await expect
        .poll(async () => object((await read(path)).applicability).revision)
        .toBe(6);
      await expect(
        panel.getByText(copy('REQUIRED'), { exact: true }),
      ).toBeVisible();
      await expect(
        panel
          .getByRole('region', { name: copy('history'), exact: true })
          .locator('.applicability-fact'),
      ).toHaveCount(6);
      const history = object((await read(path + '/history')).history);
      expect(objects(history.facts).map((row) => row.kind)).toEqual([
        'REJECTED',
        'PROPOSED',
        'RESTORED',
        'APPROVED',
        'PROPOSAL_CORRECTED',
        'PROPOSED',
      ]);
      for (const fact of objects(history.facts)) {
        expect(object(fact.actor).displayName).toBe('Ada Ionescu');
        expect(object(fact.capture).permissionSetVersion).toBe('v1');
        expect(Number.isFinite(Date.parse(text(fact.occurredAt)))).toBe(true);
      }
      expect(await read(`/projects/${projectId}/template`)).toEqual(source);
      expect({
        task: await read(`/tasks/${taskId}`),
        result: await read(`/tasks/${taskId}/results`),
        review: await read(`/projects/${projectId}/mission-result-reviews`),
        lifecycle: await read(`/projects/${projectId}/lifecycle`),
      }).toEqual(nativeBefore);
      await panel
        .getByRole('button', { name: copy('openTask'), exact: true })
        .focus();
      const opened = page.waitForResponse(
        (response) =>
          new URL(response.url()).pathname === `/api/tasks/${taskId}` &&
          response.status() === 200,
      );
      await page.keyboard.press('Enter');
      await opened;
      await expect
        .poll(() =>
          projects
            .locator('input')
            .evaluateAll(
              (elements, title) =>
                elements.some((element) => element.value === title),
              text(activity.title),
            ),
        )
        .toBe(true);
      const pendingDownload = page.waitForEvent('download');
      await projects
        .locator('.task-results')
        .getByRole('button', {
          name: formatMessage(
            resolveMessage(taskResultMessages, locale, 'download'),
            { number: 1 },
          ),
          exact: true,
        })
        .click();
      const downloaded = await (await pendingDownload).path();
      if (!downloaded) throw new Error('Missing native exact PDF download');
      expect(await readFile(downloaded)).toEqual(bytes);
      const pdf = await page.request.get(
        origin + `/documents/${documentId}/versions/${versionId}/content`,
        { headers },
      );
      expect(pdf.status()).toBe(200);
      expect(await pdf.body()).toEqual(bytes);
      await assign('document-content-reader', false);
      await panel
        .getByRole('button', { name: copy('reload'), exact: true })
        .click();
      await expect(
        panel.getByText(copy('unavailable'), { exact: true }),
      ).toBeVisible();
      await expect(panel.locator('.applicability-fact')).toHaveCount(0);
      expect(await read(`/tasks/${taskId}`)).toEqual(nativeBefore.task);
      await assign('document-content-reader');
      await expect(page.locator('body')).toHaveJSProperty(
        'scrollWidth',
        await page.evaluate(() => document.documentElement.clientWidth),
      );
      await page.screenshot({
        path: info.outputPath('native-unavailable-' + suffix + '.png'),
        fullPage: true,
      });
    });
