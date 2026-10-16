import { expect, test, type Page } from '@playwright/test';
import {
  actorContextFixture,
  operationalHomeFixture,
} from './actor-context.fixture';
import { selectOption } from './select-option';
import {
  buildClientRequest,
  buildOutcomeHistoryEntry,
  requestListItemFor,
} from '../src/test/commercial-intake-responses';

const locales = [
  {
    code: 'ro',
    name: 'Română',
    back: 'Înapoi la Solicitări',
    version: 'Versiune',
    language: 'Limba interfeței',
    change: 'Schimbă starea',
    transition: 'Schimbarea stării',
    lose: 'Marchează ca pierdută',
    loss: 'Motivul pierderii',
    other: 'Altul',
    note: 'Notă (obligatorie pentru Altul)',
    reason: 'Motiv',
    save: 'Salvează starea',
    retry: 'Reîncearcă actualizarea',
    validation:
      'Alegeți o schimbare de stare și completați câmpurile obligatorii, fiecare cu 1–500 de caractere.',
    uncertain:
      'Schimbarea stării nu s-a finalizat. Reîncercați pentru a confirma rezultatul.',
    success: 'Stare schimbată.',
    history: 'Istoricul stărilor',
    older: 'Arată schimbările de stare mai vechi',
    olderError:
      'Schimbările de stare mai vechi nu au putut fi încărcate. Reîncercați.',
    lost: 'Deschisă → Pierdută',
    resumed: 'În așteptare → Deschisă',
    hold: 'Deschisă → În așteptare',
    date: '23 sept. 2026, 10:00',
  },
  {
    code: 'ru',
    name: 'Русский',
    back: 'Назад к Запросам',
    version: 'Версия',
    language: 'Язык интерфейса',
    change: 'Изменить статус',
    transition: 'Изменение статуса',
    lose: 'Отметить как проигранную',
    loss: 'Причина проигрыша',
    other: 'Другая',
    note: 'Примечание (обязательно для другой причины)',
    reason: 'Причина',
    save: 'Сохранить статус',
    retry: 'Повторить обновление',
    validation:
      'Выберите изменение статуса и заполните обязательные поля, каждое длиной от 1 до 500 символов.',
    uncertain:
      'Изменение статуса не завершено. Повторите попытку, чтобы подтвердить результат.',
    success: 'Статус изменён.',
    history: 'История статусов',
    older: 'Показать более ранние изменения статуса',
    olderError:
      'Не удалось загрузить более ранние изменения статуса. Повторите попытку.',
    lost: 'Открыта → Проиграна',
    resumed: 'Приостановлена → Открыта',
    hold: 'Открыта → Приостановлена',
    date: '23 сент. 2026 г., 10:00',
  },
  {
    code: 'fr',
    name: 'Français',
    back: 'Retour aux Demandes',
    version: 'Version',
    language: 'Langue de l’interface',
    change: 'Modifier le statut',
    transition: 'Changement de statut',
    lose: 'Marquer comme perdue',
    loss: 'Motif de perte',
    other: 'Autre',
    note: 'Note (obligatoire pour Autre)',
    reason: 'Motif',
    save: 'Enregistrer le statut',
    retry: 'Réessayer la mise à jour',
    validation:
      'Choisissez un changement de statut et renseignez les champs obligatoires, chacun de 1 à 500 caractères.',
    uncertain:
      'Le changement de statut n’a pas abouti. Réessayez pour confirmer le résultat.',
    success: 'Statut modifié.',
    history: 'Historique des statuts',
    older: 'Afficher les changements de statut plus anciens',
    olderError:
      'Impossible de charger les changements de statut plus anciens. Réessayez.',
    lost: 'Ouverte → Perdue',
    resumed: 'En attente → Ouverte',
    hold: 'Ouverte → En attente',
    date: '23 sept. 2026, 10:00',
  },
  {
    code: 'en',
    name: 'English',
    back: 'Back to Requests',
    version: 'Version',
    language: 'Interface language',
    change: 'Change status',
    transition: 'Status change',
    lose: 'Mark as lost',
    loss: 'Loss reason',
    other: 'Other',
    note: 'Note (required for Other)',
    reason: 'Reason',
    save: 'Save status',
    retry: 'Retry update',
    validation:
      'Choose a status change and enter its required fields, each between 1 and 500 characters.',
    uncertain:
      'The status change did not complete. Retry to confirm the result.',
    success: 'Status changed.',
    history: 'Status history',
    older: 'Show older status changes',
    olderError: 'Older status changes could not be loaded. Try again.',
    lost: 'Open → Lost',
    resumed: 'On hold → Open',
    hold: 'Open → On hold',
    date: 'Sep 23, 2026, 10:00 AM',
  },
] as const;

const company = {
  id: '00000000-0000-4000-8000-000000000629',
  workspaceId: actorContextFixture.workspaceId,
  displayName: 'Demo Company',
  status: 'active',
  createdAt: '2026-10-16T10:00:00.000Z',
  createdByInternalUserId: actorContextFixture.internalUserId,
};
const note = '  {Motiv} / Причина păstrată  ';
const reason = '  Așteaptă {bugetul} / бюджет  ';
const source = 'Original {sursă} / источник';
const actor = {
  workspaceMembershipId: 'membership-1',
  displayLabel: 'Ana {nume} / Имя',
};
const held = buildOutcomeHistoryEntry({ reason, actor });
const resumed = buildOutcomeHistoryEntry({
  previousStatus: 'ON_HOLD',
  newStatus: 'OPEN',
  reason: null,
  version: 3,
  changedAt: '2026-09-22T10:00:00.000Z',
  actor,
});
const lost = buildOutcomeHistoryEntry({
  previousStatus: 'OPEN',
  newStatus: 'LOST',
  reason: null,
  lossReasonCode: 'OTHER',
  note,
  version: 4,
  changedAt: '2026-09-23T10:00:00.000Z',
  actor,
});

type Command = {
  path: string;
  body: string | null;
  key: string | undefined;
  companyId: string | undefined;
};
async function installRoutes(page: Page) {
  let saved = buildClientRequest({
    companyId: company.id,
    subject: 'Source {original}',
    originalText: source,
    initialOpportunity: {
      outcomeHistory: { entries: [resumed], nextCursor: 'older-2' },
    },
  });
  const commands: Command[] = [];
  let olderReads = 0;
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
                  opportunityManagerPermissionSetVersion: 'v2',
                  opportunityManagerPermissions: [
                    'commercial.opportunity.assign',
                    'commercial.opportunity.outcome.change',
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
      return route.fulfill({ json: operationalHomeFixture(company.id, {}) });
    if (path === '/api/commercial-intake/requests')
      return route.fulfill({ json: { items: [requestListItemFor(saved)] } });
    if (path === '/api/commercial-intake/requests/request-1')
      return route.fulfill({ json: saved });
    if (path.endsWith('/outcome-history')) {
      expect(new URL(request.url()).searchParams.get('cursor')).toBe('older-2');
      olderReads += 1;
      return olderReads === 1
        ? route.fulfill({ status: 503 })
        : route.fulfill({ json: { entries: [held] } });
    }
    if (request.method() === 'POST' && path.endsWith('/outcome')) {
      commands.push({
        path,
        body: request.postData(),
        key: request.headers()['idempotency-key'],
        companyId: request.headers()['x-company-context-id'],
      });
      if (commands.length === 1) return route.fulfill({ status: 503 });
      saved = buildClientRequest({
        ...saved,
        initialOpportunity: {
          ...saved.initialOpportunity,
          status: 'LOST',
          statusEnteredAt: lost.changedAt,
          version: 4,
          outcomeHistory: { entries: [lost, resumed], nextCursor: 'older-2' },
        },
      });
      return route.fulfill({
        json: {
          receipt: {
            opportunityId: 'opportunity-1',
            previousStatus: 'OPEN',
            status: 'LOST',
            version: 4,
          },
          request: saved,
        },
      });
    }
    return route.fulfill({ status: 404 });
  });
  return { commands, olderReadCount: () => olderReads };
}

for (const locale of locales) {
  test(`changes and reopens Opportunity outcome and older history in ${locale.code}`, async ({
    page,
  }, testInfo) => {
    test.setTimeout(90_000);
    const observed = await installRoutes(page);
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
    const open = () =>
      intake
        .getByRole('button')
        .filter({ has: page.getByText('Source {original}', { exact: true }) })
        .click();
    await open();
    await intake
      .getByRole('button', { name: locale.change, exact: true })
      .click();
    await selectOption(
      intake.getByRole('combobox', { name: locale.transition, exact: true }),
      { label: locale.lose },
    );
    await selectOption(
      intake.getByRole('combobox', { name: locale.loss, exact: true }),
      { label: locale.other },
    );
    await intake
      .getByRole('button', { name: locale.save, exact: true })
      .click();
    const feedback = intake.locator(':scope > [role="alert"]');
    await expect(feedback).toHaveText(locale.validation);
    expect(observed.commands).toHaveLength(0);
    await intake
      .getByRole('textbox', { name: locale.note, exact: true })
      .fill(note);
    const alternate = locale.code === 'en' ? locales[0] : locales[3];
    await selectOption(page.getByLabel(locale.language, { exact: true }), {
      label: alternate.name,
    });
    await expect(
      intake.getByRole('textbox', { name: alternate.note, exact: true }),
    ).toHaveValue(note);
    await expect(
      intake.getByRole('combobox', { name: alternate.transition, exact: true }),
    ).toHaveText(alternate.lose);
    await expect(
      intake.getByRole('combobox', { name: alternate.loss, exact: true }),
    ).toHaveAttribute('data-value', 'OTHER');
    expect(observed.commands).toHaveLength(0);
    await intake
      .getByRole('button', { name: alternate.save, exact: true })
      .click();
    await expect(feedback).toHaveText(alternate.uncertain);
    await selectOption(page.getByLabel(alternate.language, { exact: true }), {
      label: locale.name,
    });
    await expect(feedback).toHaveText(locale.uncertain);
    await expect(
      intake.getByRole('textbox', { name: locale.note, exact: true }),
    ).toHaveValue(note);
    await expect(
      intake.getByRole('textbox', { name: locale.note, exact: true }),
    ).toBeDisabled();
    expect(observed.commands).toHaveLength(1);
    expect(observed.olderReadCount()).toBe(0);
    await intake
      .getByRole('button', { name: locale.retry, exact: true })
      .click();
    await expect(feedback).toHaveText(locale.success);
    expect(observed.commands).toHaveLength(2);
    expect(observed.commands[0]?.key).toBeTruthy();
    expect(observed.commands[1]).toEqual(observed.commands[0]);
    expect(observed.commands[0]).toMatchObject({
      path: '/api/commercial-intake/opportunities/opportunity-1/outcome',
      companyId: company.id,
      body: JSON.stringify({
        expectedVersion: 3,
        status: 'LOST',
        lossReasonCode: 'OTHER',
        note,
      }),
    });
    await intake
      .getByRole('button', { name: locale.older, exact: true })
      .click();
    await expect(
      intake.getByText(locale.olderError, { exact: true }),
    ).toBeVisible();
    await selectOption(page.getByLabel(locale.language, { exact: true }), {
      label: alternate.name,
    });
    await expect(feedback).toHaveText(alternate.success);
    await expect(
      intake.getByText(alternate.olderError, { exact: true }),
    ).toBeVisible();
    let history = intake.getByRole('list', {
      name: alternate.history,
      exact: true,
    });
    await expect(history.getByRole('listitem')).toHaveCount(2);
    expect(observed.olderReadCount()).toBe(1);
    await intake
      .getByRole('button', { name: alternate.older, exact: true })
      .click();
    await expect(history.getByRole('listitem')).toHaveCount(3);
    await selectOption(page.getByLabel(alternate.language, { exact: true }), {
      label: locale.name,
    });
    history = intake.getByRole('list', { name: locale.history, exact: true });
    const rows = history.getByRole('listitem');
    await expect(rows).toHaveCount(3);
    await expect(rows.nth(0)).toContainText(locale.lost);
    await expect(rows.nth(1)).toContainText(locale.resumed);
    await expect(rows.nth(2)).toContainText(locale.hold);
    await expect(rows.nth(0)).toContainText('{Motiv} / Причина păstrată');
    await expect(rows.nth(2)).toContainText('Așteaptă {bugetul} / бюджет');
    await expect(rows.nth(0).locator('time')).toHaveAttribute(
      'datetime',
      '2026-09-23T10:00:00.000Z',
    );
    await expect(rows.nth(0).locator('time')).toHaveText(locale.date);
    expect(observed.olderReadCount()).toBe(2);
    await intake
      .getByRole('button', { name: locale.back, exact: true })
      .click();
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('lang', locale.code);
    await open();
    const reopened = intake.getByRole('list', {
      name: locale.history,
      exact: true,
    });
    await expect(reopened.getByRole('listitem')).toHaveCount(2);
    await expect(reopened.getByRole('listitem').first()).toContainText(
      locale.lost,
    );
    await expect(reopened.getByRole('listitem').first()).toContainText(
      'Ana {nume} / Имя',
    );
    await expect(reopened.getByRole('listitem').first()).toContainText(
      '{Motiv} / Причина păstrată',
    );
    await expect(reopened.locator('time').first()).toHaveText(locale.date);
    await expect(intake.getByText(source, { exact: true })).toBeVisible();
    await expect(intake.locator('.commercial-intake-detail')).toContainText(
      `${locale.version}: 4`,
    );
    expect(observed.commands).toHaveLength(2);
    expect(observed.olderReadCount()).toBe(2);
    await expect(page.getByRole('banner')).toContainText(company.displayName);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(testInfo.project.name === 'narrow' ? 390 : 1440);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({
      path: testInfo.outputPath(`outcome-${locale.code}.png`),
      fullPage: true,
    });
  });
}
