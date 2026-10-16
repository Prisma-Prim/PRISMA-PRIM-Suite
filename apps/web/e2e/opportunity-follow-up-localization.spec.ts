import { expect, test, type Page } from '@playwright/test';
import {
  actorContextFixture,
  operationalHomeFixture,
} from './actor-context.fixture';
import { selectOption } from './select-option';
import {
  buildClientRequest,
  requestListItemFor,
} from '../src/test/commercial-intake-responses';

const locales = [
  {
    code: 'ro',
    name: 'Română',
    localeLabel: 'Limba interfeței',
    next: 'Acțiunea următoare',
    edit: 'Editează acțiunea următoare',
    save: 'Salvează acțiunea următoare',
    retry: 'Reîncearcă actualizarea',
    nextUncertain:
      'Actualizarea acțiunii următoare nu s-a finalizat. Reîncercați pentru a confirma rezultatul.',
    nextSaved: 'Acțiunea următoare a fost salvată.',
    responsible: 'Schimbă responsabilul',
    choice: 'Noul responsabil',
    saveResponsible: 'Salvează responsabilul',
    responsibleUncertain:
      'Schimbarea responsabilului nu s-a finalizat. Reîncercați pentru a confirma rezultatul.',
    responsibleSaved: 'Responsabilul a fost schimbat.',
    back: 'Înapoi la Solicitări',
    version: 'Versiune',
  },
  {
    code: 'ru',
    name: 'Русский',
    localeLabel: 'Язык интерфейса',
    next: 'Следующее действие',
    edit: 'Изменить следующее действие',
    save: 'Сохранить следующее действие',
    retry: 'Повторить обновление',
    nextUncertain:
      'Обновление следующего действия не завершено. Повторите попытку, чтобы подтвердить результат.',
    nextSaved: 'Следующее действие сохранено.',
    responsible: 'Сменить ответственного',
    choice: 'Новый ответственный',
    saveResponsible: 'Сохранить ответственного',
    responsibleUncertain:
      'Смена ответственного не завершена. Повторите попытку, чтобы подтвердить результат.',
    responsibleSaved: 'Ответственный изменён.',
    back: 'Назад к Запросам',
    version: 'Версия',
  },
  {
    code: 'fr',
    name: 'Français',
    localeLabel: 'Langue de l’interface',
    next: 'Prochaine action',
    edit: 'Modifier la prochaine action',
    save: 'Enregistrer la prochaine action',
    retry: 'Réessayer la mise à jour',
    nextUncertain:
      'La mise à jour de la prochaine action n’a pas abouti. Réessayez pour confirmer le résultat.',
    nextSaved: 'Prochaine action enregistrée.',
    responsible: 'Changer le responsable',
    choice: 'Nouveau responsable',
    saveResponsible: 'Enregistrer le responsable',
    responsibleUncertain:
      'Le changement de responsable n’a pas abouti. Réessayez pour confirmer le résultat.',
    responsibleSaved: 'Responsable modifié.',
    back: 'Retour aux Demandes',
    version: 'Version',
  },
  {
    code: 'en',
    name: 'English',
    localeLabel: 'Interface language',
    next: 'Next action',
    edit: 'Edit next action',
    save: 'Save next action',
    retry: 'Retry update',
    nextUncertain:
      'The next action update did not complete. Retry to confirm the result.',
    nextSaved: 'Next action saved.',
    responsible: 'Change responsible',
    choice: 'New responsible actor',
    saveResponsible: 'Save responsible',
    responsibleUncertain:
      'The responsible actor change did not complete. Retry to confirm the result.',
    responsibleSaved: 'Responsible actor changed.',
    back: 'Back to Requests',
    version: 'Version',
  },
] as const;

const company = {
  id: '00000000-0000-4000-8000-000000000627',
  workspaceId: actorContextFixture.workspaceId,
  displayName: 'Demo Company',
  status: 'active',
  createdAt: '2026-10-16T10:00:00.000Z',
  createdByInternalUserId: actorContextFixture.internalUserId,
};
const member = {
  workspaceMembershipId: '00000000-0000-4000-8000-000000000628',
  displayName: 'Nou {responsabil} / Новый',
};
const memberLabel = `${member.displayName} · 2B`;
const nextAction = '  Sună {clientul} / Позвонить  ';
const source = 'Original {sursă} / источник';
const initial = buildClientRequest({
  id: 'request-follow-up',
  companyId: company.id,
  subject: 'Source {original}',
  originalText: source,
  initialOpportunity: {
    id: 'opportunity-follow-up',
    nextAction: 'Original next action',
  },
});

type Command = {
  body: string | null;
  key: string | undefined;
  companyId: string | undefined;
};
async function installRoutes(page: Page) {
  let saved = initial;
  const nextActions: Command[] = [];
  const responsibilities: Command[] = [];
  let memberReads = 0;
  await page.route('**/api/**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (path === '/api/access/current-actor')
      return route.fulfill({
        json: {
          ...actorContextFixture,
          ...(request.headers()['x-company-context-id'] === company.id
            ? {
                activeCompany: {
                  id: company.id,
                  displayName: company.displayName,
                  clientPermissions: ['client.read'],
                  commercialIntakePermissionAssignmentId: 'demo-intake',
                  commercialIntakePermissionSetVersion: 'v2',
                  commercialIntakePermissions: [
                    'commercial.request.read',
                    'commercial.request.create',
                    'commercial.opportunity.read',
                    'commercial.opportunity.create',
                    'commercial.opportunity.next_action.update',
                  ],
                  opportunityManagerPermissionAssignmentId: 'demo-manager',
                  opportunityManagerPermissionSetVersion: 'v1',
                  opportunityManagerPermissions: [
                    'commercial.opportunity.assign',
                  ],
                },
              }
            : {}),
        },
      });
    if (path === '/api/companies') return route.fulfill({ json: [company] });
    if (path === '/api/activity-log')
      return route.fulfill({ json: { events: [] } });
    if (path === '/api/operational-home')
      return route.fulfill({
        json: operationalHomeFixture(company.id, { active_clients: 1 }),
      });
    if (path === '/api/commercial-intake/requests')
      return route.fulfill({ json: { items: [requestListItemFor(saved)] } });
    if (path === '/api/commercial-intake/requests/request-follow-up')
      return route.fulfill({ json: saved });
    if (
      path ===
      '/api/commercial-intake/opportunities/opportunity-follow-up/eligible-responsible-actors'
    ) {
      memberReads += 1;
      return route.fulfill({
        json: {
          members: [
            {
              workspaceMembershipId:
                initial.initialOpportunity.responsibleWorkspaceMembershipId,
              displayLabel: 'Iurie · 1A',
            },
            {
              workspaceMembershipId: member.workspaceMembershipId,
              displayLabel: memberLabel,
            },
          ],
        },
      });
    }
    if (
      request.method() === 'POST' &&
      (path.endsWith('/next-action') || path.endsWith('/responsible'))
    ) {
      const commands = path.endsWith('/next-action')
        ? nextActions
        : responsibilities;
      commands.push({
        body: request.postData(),
        key: request.headers()['idempotency-key'],
        companyId: request.headers()['x-company-context-id'],
      });
      if (commands.length === 1) return route.fulfill({ status: 503 });
      const version = path.endsWith('/next-action') ? 2 : 3;
      saved = buildClientRequest({
        ...saved,
        initialOpportunity: {
          ...saved.initialOpportunity,
          version,
          ...(path.endsWith('/next-action')
            ? { nextAction }
            : {
                responsibleActor: member,
                responsibleWorkspaceMembershipId: member.workspaceMembershipId,
              }),
        },
      });
      return route.fulfill({
        json: {
          receipt: {
            opportunityId: 'opportunity-follow-up',
            version,
            outcome: 'updated',
            ...(path.endsWith('/next-action')
              ? { nextAction }
              : { workspaceMembershipId: member.workspaceMembershipId }),
          },
          request: saved,
        },
      });
    }
    return route.fulfill({ status: 404 });
  });
  return { nextActions, responsibilities, memberReadCount: () => memberReads };
}

for (const locale of locales) {
  test(`updates and reopens Opportunity follow-up in ${locale.code} with exact retries`, async ({
    page,
  }, testInfo) => {
    test.setTimeout(90_000);
    const commands = await installRoutes(page);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/');
    if (testInfo.project.name === 'narrow')
      await page.getByRole('button', { name: 'Open navigation' }).click();
    await selectOption(page.getByLabel('Active Company', { exact: true }), {
      label: company.displayName,
    });
    await page
      .getByRole('navigation', { name: 'Primary navigation' })
      .getByRole('link', { name: 'Client Requests', exact: true })
      .click();
    await selectOption(page.getByLabel('Interface language', { exact: true }), {
      label: locale.name,
    });
    const intake = page.locator('.commercial-intake-workspace');
    await intake
      .getByRole('button')
      .filter({ has: page.getByText('Source {original}', { exact: true }) })
      .click();
    await intake
      .getByRole('button', { name: locale.edit, exact: true })
      .click();
    await intake.getByLabel(locale.next, { exact: true }).fill(nextAction);
    const alternate = locale.code === 'en' ? locales[0] : locales[3];
    await selectOption(page.getByLabel(locale.localeLabel, { exact: true }), {
      label: alternate.name,
    });
    await expect(
      intake.getByLabel(alternate.next, { exact: true }),
    ).toHaveValue(nextAction);
    expect(commands.nextActions).toHaveLength(0);
    await selectOption(
      page.getByLabel(alternate.localeLabel, { exact: true }),
      { label: locale.name },
    );
    await intake
      .getByRole('button', { name: locale.save, exact: true })
      .click();
    await expect(intake.locator(':scope > [role="alert"]')).toHaveText(
      locale.nextUncertain,
    );
    await selectOption(page.getByLabel(locale.localeLabel, { exact: true }), {
      label: alternate.name,
    });
    await expect(intake.locator(':scope > [role="alert"]')).toHaveText(
      alternate.nextUncertain,
    );
    await expect(
      intake.getByLabel(alternate.next, { exact: true }),
    ).toHaveValue(nextAction);
    await expect(
      intake.getByLabel(alternate.next, { exact: true }),
    ).toBeDisabled();
    expect(commands.nextActions).toHaveLength(1);
    await intake
      .getByRole('button', { name: alternate.retry, exact: true })
      .click();
    await expect(intake.locator(':scope > [role="alert"]')).toHaveText(
      alternate.nextSaved,
    );
    expect(commands.nextActions).toHaveLength(2);
    expect(commands.nextActions[0]?.key).toBeTruthy();
    expect(commands.nextActions[1]).toEqual(commands.nextActions[0]);
    expect(commands.nextActions[0]?.companyId).toBe(company.id);
    expect(commands.nextActions[0]?.body).toBe(
      JSON.stringify({ expectedVersion: 1, nextAction }),
    );
    await selectOption(
      page.getByLabel(alternate.localeLabel, { exact: true }),
      { label: locale.name },
    );
    await expect(intake.locator(':scope > [role="alert"]')).toHaveText(
      locale.nextSaved,
    );
    await intake
      .getByRole('button', { name: locale.responsible, exact: true })
      .click();
    await selectOption(
      intake.getByRole('combobox', { name: locale.choice, exact: true }),
      { label: memberLabel },
    );
    await selectOption(page.getByLabel(locale.localeLabel, { exact: true }), {
      label: alternate.name,
    });
    await expect(
      intake.getByRole('combobox', { name: alternate.choice, exact: true }),
    ).toHaveText(memberLabel);
    await expect(
      intake.getByRole('combobox', { name: alternate.choice, exact: true }),
    ).toHaveAttribute('data-value', member.workspaceMembershipId);
    expect(commands.responsibilities).toHaveLength(0);
    expect(commands.memberReadCount()).toBe(1);
    await selectOption(
      page.getByLabel(alternate.localeLabel, { exact: true }),
      { label: locale.name },
    );
    await intake
      .getByRole('button', { name: locale.saveResponsible, exact: true })
      .click();
    await expect(intake.locator(':scope > [role="alert"]')).toHaveText(
      locale.responsibleUncertain,
    );
    await selectOption(page.getByLabel(locale.localeLabel, { exact: true }), {
      label: alternate.name,
    });
    await expect(intake.locator(':scope > [role="alert"]')).toHaveText(
      alternate.responsibleUncertain,
    );
    await expect(
      intake.getByRole('combobox', { name: alternate.choice, exact: true }),
    ).toBeDisabled();
    await expect(
      intake.getByRole('combobox', { name: alternate.choice, exact: true }),
    ).toHaveText(memberLabel);
    await expect(
      intake.getByRole('combobox', { name: alternate.choice, exact: true }),
    ).toHaveAttribute('data-value', member.workspaceMembershipId);
    expect(commands.responsibilities).toHaveLength(1);
    await intake
      .getByRole('button', { name: alternate.retry, exact: true })
      .click();
    await expect(intake.locator(':scope > [role="alert"]')).toHaveText(
      alternate.responsibleSaved,
    );
    expect(commands.responsibilities).toHaveLength(2);
    expect(commands.responsibilities[0]?.key).toBeTruthy();
    expect(commands.responsibilities[1]).toEqual(commands.responsibilities[0]);
    expect(commands.responsibilities[0]?.companyId).toBe(company.id);
    expect(commands.responsibilities[0]?.body).toBe(
      JSON.stringify({
        expectedVersion: 2,
        workspaceMembershipId: member.workspaceMembershipId,
      }),
    );
    expect(commands.memberReadCount()).toBe(1);
    await selectOption(
      page.getByLabel(alternate.localeLabel, { exact: true }),
      { label: locale.name },
    );
    await expect(intake.locator(':scope > [role="alert"]')).toHaveText(
      locale.responsibleSaved,
    );
    await intake
      .getByRole('button', { name: locale.back, exact: true })
      .click();
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('lang', locale.code);
    await intake
      .getByRole('button')
      .filter({ has: page.getByText('Source {original}', { exact: true }) })
      .click();
    await expect(intake.getByText(source, { exact: true })).toBeVisible();
    const detail = intake.locator('.commercial-intake-detail');
    await expect(detail).toContainText(member.displayName);
    await expect(detail).toContainText(`${locale.version}: 3`);
    expect(await detail.textContent()).toContain(nextAction);
    expect(commands.nextActions).toHaveLength(2);
    expect(commands.responsibilities).toHaveLength(2);
    await expect(page.getByRole('banner')).toContainText(company.displayName);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(testInfo.project.name === 'narrow' ? 390 : 1440);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({
      path: testInfo.outputPath(`follow-up-${locale.code}.png`),
      fullPage: true,
    });
  });
}
