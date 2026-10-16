import { expect, test } from '@playwright/test';
import { actorContextFixture } from './actor-context.fixture';
import { selectOption } from './select-option';

const memberId = '11111111-1111-4111-8111-111111111111';
const memberName = 'Ana {originală} / Борис {имя}';
const cases = [
  {
    locale: 'ro',
    language: 'Limba interfeței',
    option: 'Română',
    title: 'Sesiunile furnizorului de identitate',
    refresh: 'Verifică revocarea sesiunilor',
    retry: 'Reîncearcă revocarea sesiunilor',
    required:
      'Revocarea sesiunilor necesită o nouă încercare. Reîncearcă după 30 de secunde.',
    complete:
      'Sesiunile existente ale furnizorului au fost revocate. Accesul la spațiul de lucru rămâne suspendat.',
    error:
      'Starea revocării sesiunilor nu a putut fi verificată. Accesul la spațiul de lucru rămâne suspendat.',
  },
  {
    locale: 'ru',
    language: 'Язык интерфейса',
    option: 'Русский',
    title: 'Сеансы поставщика идентификации',
    refresh: 'Проверить отзыв сеансов',
    retry: 'Повторить отзыв сеансов',
    required:
      'Требуется ещё одна попытка отзыва сеансов. Повторите через 30 секунд.',
    complete:
      'Существующие сеансы поставщика отозваны. Доступ к рабочему пространству остаётся приостановленным.',
    error:
      'Не удалось проверить состояние отзыва сеансов. Доступ к рабочему пространству остаётся приостановленным.',
  },
  {
    locale: 'fr',
    language: 'Langue de l’interface',
    option: 'Français',
    title: 'Sessions du fournisseur d’identité',
    refresh: 'Vérifier la révocation des sessions',
    retry: 'Réessayer la révocation des sessions',
    required:
      'La révocation des sessions nécessite une nouvelle tentative. Réessayez après 30 secondes.',
    complete:
      'Les sessions existantes du fournisseur sont révoquées. L’accès à l’espace de travail reste suspendu.',
    error:
      'Impossible de vérifier la révocation des sessions. L’accès à l’espace de travail reste suspendu.',
  },
  {
    locale: 'en',
    language: 'Interface language',
    option: 'English',
    title: 'Identity-provider sessions',
    refresh: 'Check session revocations',
    retry: 'Retry session revocation',
    required:
      'Session revocation needs another attempt. Retry after 30 seconds.',
    complete:
      'Existing provider sessions revoked. Workspace access remains suspended.',
    error:
      'Session revocation status could not be verified. Workspace access remains suspended.',
  },
] as const;

test.use({ contextOptions: { reducedMotion: 'reduce' } });

for (const locale of cases) {
  test(`${locale.locale}: preserves canonical session-revocation recovery through language changes and reload`, async ({
    page,
  }, testInfo) => {
    let complete = false;
    let reads = 0;
    const commands: Array<{
      method: string;
      path: string;
      body: string | null;
    }> = [];
    await page.route('**/api/access/current-actor', (route) =>
      route.fulfill({
        json: {
          ...actorContextFixture,
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
      (route) =>
        route.fulfill({
          json: { members: [], companies: [], assignments: [] },
        }),
    );
    await page.route(
      /\/api\/workspace-session-revocations(?:\/[^/]+\/retry)?$/,
      (route) => {
        const request = route.request();
        if (request.method() === 'POST') {
          commands.push({
            method: request.method(),
            path: new URL(request.url()).pathname,
            body: request.postData(),
          });
          if (commands.length === 1) return route.fulfill({ status: 503 });
          complete = true;
          return route.fulfill({ status: 201, json: { status: 'checked' } });
        }
        reads += 1;
        return route.fulfill({
          json: {
            records: [
              {
                workspaceMembershipId: memberId,
                displayName: memberName,
                status: complete ? 'complete' : 'retry_required',
              },
            ],
            nextCursor: null,
          },
        });
      },
    );
    await page.goto('/?frame=prisme#access');
    await expect(
      page.getByRole('heading', {
        name: 'Identity-provider sessions',
        exact: true,
      }),
    ).toBeVisible();
    await selectOption(
      page.getByRole('combobox', { name: 'Interface language' }),
      { label: locale.option },
    );
    const panel = page.getByRole('region', { name: locale.title, exact: true });
    await panel
      .getByRole('button', { name: locale.refresh, exact: true })
      .click();
    const record = panel.getByRole('listitem').filter({ hasText: memberName });
    await expect(record).toHaveAttribute('data-status', 'retry_required');
    await expect(
      record.getByText(locale.required, { exact: true }),
    ).toBeVisible();
    expect(reads).toBe(1);
    expect(commands).toHaveLength(0);
    const retry = record.getByRole('button', {
      name: locale.retry,
      exact: true,
    });
    await retry.focus();
    await expect(retry).toBeFocused();
    await retry.click();
    await expect(panel.getByRole('alert')).toHaveText(locale.error);
    expect(reads).toBe(1);
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
    expect(reads).toBe(1);
    expect(commands).toHaveLength(1);
    await changed
      .getByRole('button', { name: alternative.refresh, exact: true })
      .click();
    await expect(
      changed.getByText(alternative.required, { exact: true }),
    ).toBeVisible();
    expect(reads).toBe(2);
    await selectOption(
      page.getByRole('combobox', { name: alternative.language, exact: true }),
      { label: locale.option },
    );
    await expect(
      panel.getByText(locale.required, { exact: true }),
    ).toBeVisible();
    expect(reads).toBe(2);
    await panel
      .getByRole('button', { name: locale.retry, exact: true })
      .click();
    await expect(record).toHaveAttribute('data-status', 'complete');
    await expect(
      record.getByText(locale.complete, { exact: true }),
    ).toBeVisible();
    await expect(
      panel.getByRole('button', { name: locale.retry, exact: true }),
    ).toHaveCount(0);
    expect(reads).toBe(3);
    expect(commands).toEqual([
      {
        method: 'POST',
        path: `/api/workspace-session-revocations/${memberId}/retry`,
        body: null,
      },
      {
        method: 'POST',
        path: `/api/workspace-session-revocations/${memberId}/retry`,
        body: null,
      },
    ]);
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('lang', locale.locale);
    await expect(
      panel.getByRole('heading', { name: locale.title, exact: true }),
    ).toBeVisible();
    expect(reads).toBe(3);
    await panel
      .getByRole('button', { name: locale.refresh, exact: true })
      .click();
    await expect(
      record.getByText(locale.complete, { exact: true }),
    ).toBeVisible();
    expect(reads).toBe(4);
    expect(commands).toHaveLength(2);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    await panel.scrollIntoViewIfNeeded();
    await page.screenshot({
      path: testInfo.outputPath(
        `session-revocation-${locale.locale}-${testInfo.project.name}.png`,
      ),
      fullPage: true,
    });
  });
}
