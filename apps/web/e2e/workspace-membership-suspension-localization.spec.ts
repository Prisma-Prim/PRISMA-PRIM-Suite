import { expect, test } from '@playwright/test';
import { actorContextFixture } from './actor-context.fixture';
import { selectOption } from './select-option';

const memberId = '11111111-1111-4111-8111-111111111111';
const memberName = 'Ana {originală} / Борис {имя}';
const memberLabel = `${memberName} — ana@example.test`;
const workspaceName = 'Atelier {origine} / Пространство';
const cases = [
  {
    locale: 'ro',
    language: 'Limba interfeței',
    option: 'Română',
    title: 'Acces la spațiul de lucru',
    member: 'Membru de suspendat',
    review: 'Examinează suspendarea',
    region: 'Confirmă suspendarea accesului la spațiul de lucru',
    warning:
      'Accesul la aplicație va fi oprit. Identitatea, atribuirile și istoricul vor fi păstrate. Sesiunile existente ale furnizorului de identitate vor fi, de asemenea, revocate în întreaga aplicație.',
    cancel: 'Anulează',
    confirm: 'Suspendă accesul',
    success: 'Membrul a fost suspendat. Starea serverului a fost actualizată.',
    error:
      'Suspendarea nu a putut fi finalizată. Starea serverului a fost actualizată.',
    empty: 'Nu există niciun membru activ disponibil pentru suspendare.',
  },
  {
    locale: 'ru',
    language: 'Язык интерфейса',
    option: 'Русский',
    title: 'Доступ к рабочему пространству',
    member: 'Участник для приостановки доступа',
    review: 'Проверить приостановку доступа',
    region: 'Подтвердить приостановку доступа к рабочему пространству',
    warning:
      'Доступ к приложению будет прекращён. Идентификационные данные, назначения и история будут сохранены. Существующие сеансы поставщика идентификации также будут отозваны во всём приложении.',
    cancel: 'Отмена',
    confirm: 'Приостановить доступ',
    success: 'Доступ участника приостановлен. Состояние сервера обновлено.',
    error:
      'Не удалось завершить приостановку доступа. Состояние сервера обновлено.',
    empty: 'Нет действующих участников для приостановки доступа.',
  },
  {
    locale: 'fr',
    language: 'Langue de l’interface',
    option: 'Français',
    title: 'Accès à l’espace de travail',
    member: 'Membre à suspendre',
    review: 'Examiner la suspension',
    region: 'Confirmer la suspension de l’accès à l’espace de travail',
    warning:
      'L’accès à l’application sera interrompu. L’identité, les attributions et l’historique seront conservés. Les sessions existantes du fournisseur d’identité seront également révoquées dans toute l’application.',
    cancel: 'Annuler',
    confirm: 'Suspendre l’accès',
    success: 'Membre suspendu. L’état du serveur a été actualisé.',
    error:
      'La suspension n’a pas pu être terminée. L’état du serveur a été actualisé.',
    empty: 'Aucun membre actif n’est disponible pour une suspension.',
  },
  {
    locale: 'en',
    language: 'Interface language',
    option: 'English',
    title: 'Workspace access',
    member: 'Member to suspend',
    review: 'Review suspension',
    region: 'Confirm Workspace access suspension',
    warning:
      'Their application access will stop. Their identity, assignments, and history will be preserved. Existing identity-provider sessions will also be revoked across this application.',
    cancel: 'Cancel',
    confirm: 'Suspend access',
    success: 'Member suspended. Server state refreshed.',
    error: 'The suspension could not be completed. Server state was refreshed.',
    empty: 'No active member is available for suspension.',
  },
] as const;

test.use({ contextOptions: { reducedMotion: 'reduce' } });

for (const locale of cases) {
  test(`${locale.locale}: preserves member suspension confirmation and explicit recovery through language changes and reload`, async ({
    page,
  }, testInfo) => {
    let active = true;
    let administrationReads = 0;
    const commands: Array<{
      method: string;
      path: string;
      body: string | null;
      key: string | undefined;
      companyContext: string | undefined;
    }> = [];
    await page.route('**/api/access/current-actor', (route) =>
      route.fulfill({
        json: {
          ...actorContextFixture,
          workspaceName,
          workspacePermissions: ['company.assignment.manage'],
        },
      }),
    );
    await page.route('**/api/companies', (route) =>
      route.fulfill({ json: [] }),
    );
    await page.route('**/api/activity-log', (route) =>
      route.fulfill({ json: { events: [] } }),
    );
    await page.route(
      '**/api/company-context-assignments/administration',
      (route) => {
        administrationReads += 1;
        return route.fulfill({
          json: {
            members: active
              ? [
                  {
                    workspaceMembershipId: memberId,
                    displayName: memberName,
                    email: 'ana@example.test',
                  },
                ]
              : [],
            companies: [],
            assignments: [],
          },
        });
      },
    );
    await page.route('**/api/workspace-membership-suspensions', (route) => {
      const request = route.request();
      commands.push({
        method: request.method(),
        path: new URL(request.url()).pathname,
        body: request.postData(),
        key: request.headers()['idempotency-key'],
        companyContext: request.headers()['x-company-context-id'],
      });
      if (commands.length === 1) return route.fulfill({ status: 409 });
      active = false;
      return route.fulfill({
        status: 201,
        json: { workspaceMembershipId: memberId, status: 'inactive' },
      });
    });

    await page.goto('/?frame=prisme#access');
    await expect(
      page.getByRole('combobox', { name: 'Member to suspend', exact: true }),
    ).toBeVisible();
    await selectOption(
      page.getByRole('combobox', { name: 'Interface language', exact: true }),
      { label: locale.option },
    );
    const panel = page.getByRole('region', { name: locale.title, exact: true });
    await expect(
      panel.getByRole('heading', { name: locale.title, exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole('banner').getByText(workspaceName, { exact: true }),
    ).toBeVisible();
    const member = panel.getByRole('combobox', {
      name: locale.member,
      exact: true,
    });
    await member.focus();
    await member.press('Enter');
    await expect(
      page.getByRole('option', { name: memberLabel, exact: true }),
    ).toHaveAttribute('data-value', memberId);
    await member.press('End');
    await member.press('Enter');
    await expect(member).toHaveAttribute('data-value', memberId);
    const review = panel.getByRole('button', {
      name: locale.review,
      exact: true,
    });
    await member.press('Tab');
    await expect(review).toBeFocused();
    await review.press('Enter');
    const confirmation = panel.getByRole('region', {
      name: locale.region,
      exact: true,
    });
    await expect(
      confirmation.getByText(memberLabel, { exact: true }),
    ).toBeVisible();
    await expect(
      confirmation.getByText(locale.warning, { exact: true }),
    ).toBeVisible();
    expect(administrationReads).toBe(1);
    expect(commands).toHaveLength(0);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    await confirmation.scrollIntoViewIfNeeded();
    await page.screenshot({
      path: testInfo.outputPath(
        `suspension-confirmation-${locale.locale}-${testInfo.project.name}.png`,
      ),
      fullPage: true,
    });
    const cancel = confirmation.getByRole('button', {
      name: locale.cancel,
      exact: true,
    });
    await review.press('Tab');
    await expect(cancel).toBeFocused();
    await cancel.press('Enter');
    await expect(confirmation).toHaveCount(0);
    await expect(member).toHaveAttribute('data-value', memberId);
    expect(commands).toHaveLength(0);
    await review.press('Enter');
    const confirm = confirmation.getByRole('button', {
      name: locale.confirm,
      exact: true,
    });
    await confirm.focus();
    await expect(confirm).toBeFocused();
    await confirm.press('Enter');
    await expect(panel.getByRole('alert')).toHaveText(locale.error);
    expect(administrationReads).toBe(2);
    expect(commands).toHaveLength(1);

    const alternative = locale.locale === 'fr' ? cases[0] : cases[2];
    await selectOption(
      page.getByRole('combobox', { name: locale.language, exact: true }),
      { label: alternative.option },
    );
    const changed = page.getByRole('region', {
      name: alternative.title,
      exact: true,
    });
    await expect(changed.getByRole('alert')).toHaveText(alternative.error);
    await expect(
      changed.getByRole('combobox', { name: alternative.member, exact: true }),
    ).toHaveAttribute('data-value', memberId);
    expect(administrationReads).toBe(2);
    expect(commands).toHaveLength(1);
    await changed
      .getByRole('button', { name: alternative.review, exact: true })
      .click();
    await selectOption(
      page.getByRole('combobox', { name: alternative.language, exact: true }),
      { label: locale.option },
    );
    await expect(
      confirmation.getByText(memberLabel, { exact: true }),
    ).toBeVisible();
    expect(administrationReads).toBe(2);
    expect(commands).toHaveLength(1);
    await confirmation
      .getByRole('button', { name: locale.confirm, exact: true })
      .press('Enter');
    await expect(panel.getByRole('status')).toHaveText(locale.success);
    await expect(panel.getByText(locale.empty, { exact: true })).toBeVisible();
    expect(administrationReads).toBe(3);
    expect(commands).toHaveLength(2);
    const expected = {
      method: 'POST',
      path: '/api/workspace-membership-suspensions',
      body: JSON.stringify({ workspaceMembershipId: memberId }),
      companyContext: undefined,
    };
    expect(commands[0]).toMatchObject(expected);
    expect(commands[1]).toMatchObject(expected);
    expect(commands[0]?.key).toMatch(/^[0-9a-f-]{36}$/u);
    expect(commands[1]?.key).toBe(commands[0]?.key);
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('lang', locale.locale);
    await expect(panel.getByText(locale.empty, { exact: true })).toBeVisible();
    await expect(
      panel.getByRole('combobox', { name: locale.member, exact: true }),
    ).toHaveCount(0);
    expect(administrationReads).toBe(4);
    expect(commands).toHaveLength(2);
    await page.goto('/?frame=prisme#activity');
    await page.goto('/?frame=prisme#access');
    await expect(panel.getByText(locale.empty, { exact: true })).toBeVisible();
    expect(commands).toHaveLength(2);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    await panel.scrollIntoViewIfNeeded();
    await page.screenshot({
      path: testInfo.outputPath(
        `suspension-saved-${locale.locale}-${testInfo.project.name}.png`,
      ),
      fullPage: true,
    });
  });
}
