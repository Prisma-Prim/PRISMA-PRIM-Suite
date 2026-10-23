import { expect, test } from '@playwright/test';
import type { ActorContext } from '../src/access-types';
import { contractMessages } from '../src/contract/contract.copy';
import { contractProjectsMessages } from '../src/contract/contract-projects.copy';
import { contractProjectCreateMessages } from '../src/contract/contract-project-create.copy';
import type {
  ContractProjectCandidate,
  LinkedProject,
} from '../src/contract/contract-projects-response';
import { interfaceLocaleStorageKey } from '../src/localization/interface-locale';
import { resolveMessage } from '../src/localization/messages';
import {
  contractLocaleActor,
  contractLocaleChecksum,
  contractLocaleIds,
  contractLocalePath,
  contractLocaleRequest,
  readContractLocaleFixture,
} from '../src/test/contract-localization-fixture';
import {
  contractQualityRun,
  pendingQualityContract,
  qualityPath,
} from '../src/test/contract-quality-localization-fixture';

// A small public-App HTTP journey for the existing Project controls, not a new
// permission or backend contract. The longer C9 journey remains unchanged.
test('Prisme Contract Project controls keep keyboard choices and explicit creation', async ({
  page,
}, testInfo) => {
  const locale = 'ro';
  const projectsCopy = (key: (typeof contractProjectsMessages.keys)[number]) =>
    resolveMessage(contractProjectsMessages, locale, key);
  const createCopy = (
    key: (typeof contractProjectCreateMessages.keys)[number],
  ) => resolveMessage(contractProjectCreateMessages, locale, key);
  const originalActor = contractLocaleActor();
  if (!originalActor.activeCompany)
    throw new Error('Expected synthetic Company');
  const requestSubject = contractLocaleRequest.subject;
  if (requestSubject === null)
    throw new Error('Expected synthetic Service Request subject');
  const actor = {
    ...originalActor,
    activeCompany: {
      ...originalActor.activeCompany,
      clientPermissions: ['client.read'],
      offerPermissions: [],
      pricingUserPermissions: [],
      commercialActivityPermissions: [],
      contractPermissions: [
        'commercial.contract.read',
        'commercial.contract.project.link',
      ],
      projectPermissions: ['project.read', 'project.create'],
    },
  } satisfies ActorContext;
  const evaluatedAt = '2026-10-07T09:00:00.000Z';
  const approvalRun = contractQualityRun({
    origin: 'direct',
    id: 'controls-approval-756',
    evaluatedAt: '2026-10-07T08:59:00.000Z',
  });
  const signatureRun = contractQualityRun({
    origin: 'direct',
    id: 'controls-signature-756',
    evaluatedAt,
  });
  const pending = pendingQualityContract({
    origin: 'direct',
    latestRun: signatureRun,
  });
  const available: ContractProjectCandidate = {
    id: 'project-available-756',
    title:
      'Auditul complet al documentației sistemului de management pentru întreprinderea demonstrativă',
    status: 'preparatory',
    createdAt: '2026-10-01T09:00:00.000Z',
    alreadyLinked: false,
    otherContracts: [],
  };
  const alreadyLinked: ContractProjectCandidate = {
    ...available,
    id: 'project-linked-756',
    title:
      'Proiect deja asociat pentru pregătirea documentației și instruirea echipei demonstrative',
    alreadyLinked: true,
  };
  const created = {
    id: 'project-created-756',
    title:
      'Un nou Proiect demonstrativ cu titlu lung pentru verificarea lizibilității',
    status: 'preparatory',
    createdAt: '2026-10-07T10:00:00.000Z',
  };
  let revision = 4;
  const linkedProjects: LinkedProject[] = [
    {
      ...alreadyLinked,
      link: {
        id: 'existing-link-756',
        contractId: contractLocaleIds.contract,
        projectId: alreadyLinked.id,
        revision,
        created: false,
        actorWorkspaceMembershipId: contractLocaleIds.member,
        linkedAt: '2026-10-07T09:05:00.000Z',
      },
    },
  ];
  const recorded = () => ({
    ...pending,
    revision,
    linkedProjects,
    version: {
      ...pending.version,
      createdAt: '2026-10-07T08:30:00.000Z',
      decisionState: 'APPROVED',
      decision: {
        id: 'controls-decision-756',
        contractVersionId: contractLocaleIds.version,
        revision: 2,
        kind: 'APPROVE',
        actorWorkspaceMembershipId: approvalRun.actorWorkspaceMembershipId,
        decidedAt: approvalRun.evaluatedAt,
        qualityRun: approvalRun,
        acknowledgedWarningCodes: ['DIRECT_ORIGIN_REVIEWED'],
        representationChecksum: contractLocaleChecksum,
      },
      executionState: 'EXECUTED',
      signature: {
        id: 'controls-signature-756',
        contractVersionId: contractLocaleIds.version,
        revision: 3,
        evidenceKind: 'SIMULATED',
        provenance: 'ILLUSTRATIVE',
        provisional: true,
        actorWorkspaceMembershipId: signatureRun.actorWorkspaceMembershipId,
        recordedAt: evaluatedAt,
        providerSignatoryLabel: 'Synthetic provider declaration',
        clientSignatoryLabel: 'Synthetic Client declaration',
        providerSignedOn: '2026-10-07',
        clientSignedOn: '2026-10-07',
        note: null,
        qualityRun: signatureRun,
        acknowledgedWarningCodes: [],
        representationChecksum: contractLocaleChecksum,
      },
    },
  });
  const attempts: Array<{ body: string | null; key: string | undefined }> = [];
  const unexpected: string[] = [];
  let candidateReads = 0;
  let creations = 0;
  await page.addInitScript(
    ({ key, locale }) => localStorage.setItem(key, locale),
    {
      key: interfaceLocaleStorageKey,
      locale,
    },
  );
  await page.route('**/api/**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (
      request.method() === 'POST' &&
      path === `${contractLocalePath}/projects`
    ) {
      expect(request.headers()['x-company-context-id']).toBe(
        contractLocaleIds.company,
      );
      attempts.push({
        body: request.postData(),
        key: request.headers()['idempotency-key'],
      });
      if (attempts.length === 1) return route.abort('failed');
      expect(attempts).toHaveLength(2);
      expect(attempts[1]).toEqual(attempts[0]);
      expect(attempts[0]?.key).toBeTruthy();
      const body: unknown = JSON.parse(attempts[0]?.body ?? 'null');
      expect(body).toEqual({
        projectId: available.id,
        expectedContractRevision: 4,
      });
      revision = 5;
      const link = {
        id: 'chosen-link-756',
        contractId: contractLocaleIds.contract,
        projectId: available.id,
        revision,
        created: false,
        actorWorkspaceMembershipId: contractLocaleIds.member,
        linkedAt: '2026-10-07T09:10:00.000Z',
      };
      linkedProjects.push({ ...available, link });
      return route.fulfill({ status: 201, json: link });
    }
    if (
      request.method() === 'POST' &&
      path === `${contractLocalePath}/projects/create`
    ) {
      expect(request.headers()['x-company-context-id']).toBe(
        contractLocaleIds.company,
      );
      creations += 1;
      expect(creations).toBe(1);
      const body: unknown = request.postDataJSON();
      expect(body).toEqual({
        title: created.title,
        acknowledgedCandidateProjectIds: [available.id, alreadyLinked.id],
        expectedContractRevision: 5,
      });
      revision = 6;
      const link = {
        id: 'created-link-756',
        contractId: contractLocaleIds.contract,
        projectId: created.id,
        revision,
        created: true,
        actorWorkspaceMembershipId: contractLocaleIds.member,
        linkedAt: created.createdAt,
      };
      linkedProjects.push({ ...created, status: 'preparatory', link });
      return route.fulfill({ status: 201, json: { project: created, link } });
    }
    if (request.method() !== 'GET') {
      unexpected.push(request.method() + ' ' + path);
      return route.fulfill({ status: 405 });
    }
    if (path === '/api/access/current-actor')
      return route.fulfill({ json: actor });
    if (path === '/api/projects') return route.fulfill({ json: [] });
    if (
      path === contractLocalePath ||
      path === `${contractLocalePath}/versions/${contractLocaleIds.version}`
    )
      return route.fulfill({ json: { contract: recorded() } });
    if (path === `${contractLocalePath}/project-candidates`) {
      candidateReads += 1;
      if (candidateReads === 1) return route.fulfill({ status: 500 });
      return route.fulfill({ json: { items: [available, alreadyLinked] } });
    }
    if (path === qualityPath)
      return route.fulfill({
        json: { items: [signatureRun, approvalRun], nextCursor: null },
      });
    try {
      return await route.fulfill({
        json: readContractLocaleFixture({
          path,
          hasCompany: true,
          recorded: true,
        }),
      });
    } catch (error: unknown) {
      unexpected.push(
        error instanceof Error ? error.message : 'Unknown synthetic GET',
      );
      return route.fulfill({ status: 404 });
    }
  });

  await page.goto('/?frame=prisme#requests');
  await expect(page.locator('.prisme-shell')).toBeVisible();
  await page
    .getByRole('button')
    .filter({
      has: page.getByText(requestSubject, { exact: true }),
    })
    .click();
  const panel = page.getByRole('region', {
    name: resolveMessage(contractMessages, locale, 'title'),
    exact: true,
  });
  const projects = panel.getByRole('region', {
    name: projectsCopy('title'),
    exact: true,
  });
  const creation = projects.getByRole('region', {
    name: createCopy('title'),
    exact: true,
  });
  const acknowledgement = creation.getByRole('checkbox', {
    name: createCopy('acknowledge'),
    exact: true,
  });
  const confirm = creation.getByRole('button', {
    name: createCopy('confirm'),
    exact: true,
  });
  const reload = projects.getByRole('button', {
    name: projectsCopy('reload'),
    exact: true,
  });
  const capture = async (state: string) => {
    await expect(page).toHaveURL(/frame=prisme#requests$/u);
    await page.screenshot({
      path: testInfo.outputPath(
        `prisme-contract-project-controls-ro-${testInfo.project.name}-${state}-viewport.png`,
      ),
      fullPage: false,
    });
    await projects.screenshot({
      path: testInfo.outputPath(
        `prisme-contract-project-controls-ro-${testInfo.project.name}-${state}.png`,
      ),
    });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  };

  await expect(
    projects.getByText(projectsCopy('error'), { exact: true }),
  ).toBeVisible();
  await expect(acknowledgement).toBeDisabled();
  await reload.focus();
  await expect(reload).toBeFocused();
  await capture('read-error-disabled');
  await page.keyboard.press('Enter');

  const availableRadio = projects.getByRole('radio', {
    name: /^Auditul complet/,
  });
  const linkedRadio = projects.getByRole('radio', {
    name: /^Proiect deja asociat/,
  });
  await expect(availableRadio).toBeEnabled();
  await expect(linkedRadio).toBeDisabled();
  await expect(confirm).toBeDisabled();
  await availableRadio.focus();
  await page.keyboard.press('Space');
  await expect(availableRadio).toBeChecked();
  await expect(availableRadio).toBeFocused();
  await capture('radio-selected-focus');
  await page.keyboard.press('Tab');
  const link = projects.getByRole('button', {
    name: projectsCopy('link'),
    exact: true,
  });
  await expect(link).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(
    projects.getByText(projectsCopy('uncertain'), { exact: true }),
  ).toBeVisible();
  await expect(availableRadio).toBeDisabled();
  const retry = projects.getByRole('button', {
    name: projectsCopy('retry'),
    exact: true,
  });
  await retry.focus();
  await expect(retry).toBeFocused();
  await capture('uncertain-retry');
  await page.keyboard.press('Enter');
  await expect(
    projects.getByText(projectsCopy('success'), { exact: true }),
  ).toBeVisible();
  await expect(availableRadio).toBeDisabled();
  await expect(
    projects.getByRole('button', {
      name: projectsCopy('openProject'),
      exact: true,
    }),
  ).toHaveCount(2);

  await creation
    .getByRole('textbox', { name: createCopy('projectTitle'), exact: true })
    .fill(created.title);
  await expect(acknowledgement).not.toBeChecked();
  await acknowledgement.focus();
  await page.keyboard.press('Space');
  await expect(acknowledgement).toBeChecked();
  await expect(acknowledgement).toBeFocused();
  await expect(confirm).toBeEnabled();
  await capture('creation-acknowledged-focus');
  await page.keyboard.press('Tab');
  await expect(confirm).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(
    creation.getByText(createCopy('success'), { exact: true }),
  ).toBeVisible();
  await expect(acknowledgement).toBeDisabled();
  await expect(
    projects.getByRole('button', {
      name: projectsCopy('openProject'),
      exact: true,
    }),
  ).toHaveCount(3);
  await capture('created-disabled');
  expect(candidateReads).toBe(2);
  expect(creations).toBe(1);
  expect(unexpected).toEqual([]);
});
