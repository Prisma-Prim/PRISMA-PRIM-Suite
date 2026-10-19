import { expect, type Page, type TestInfo } from '@playwright/test';
import {
  assignmentAdministration,
  assignmentAdministrator,
  assignmentBundleCases,
  assignmentCompanyId,
  assignmentCompanyName,
  assignmentMemberId,
  type AssignmentLocaleFixture,
} from '../src/access/company-assignment-localization.test-fixtures';
import { selectOption } from './select-option';

export function deferredDecision<Value>() {
  let complete: ((value: Value) => void) | undefined;
  const promise = new Promise<Value>((resolve) => {
    complete = resolve;
  });
  return {
    promise,
    resolve(value: Value) {
      if (complete === undefined)
        throw new Error('Deferred decision is not initialized');
      complete(value);
    },
  };
}

type MutationDecision = ReturnType<
  typeof deferredDecision<'commit' | 'uncertain'>
>;
type AdministrationDecision = ReturnType<
  typeof deferredDecision<'ready' | 'failure' | 'empty'>
>;
export interface AssignmentCommandEvidence {
  path: string;
  method: string;
  key: string | undefined;
  body: string | null;
}

export async function installAssignmentBoundary({ page }: { page: Page }) {
  const director = assignmentBundleCases.find(
    (bundle) => bundle.value === 'director-client',
  );
  if (!director) throw new Error('Missing independent Director fixture');
  const state: {
    active: boolean;
    version: 'v1' | 'v2';
    availableTargets: boolean;
    actorDenied: boolean;
    denySessionRead: boolean;
    administrationReads: number;
    actorReads: number;
    activityReads: number;
    settledMutations: number;
    commands: AssignmentCommandEvidence[];
    nextMutation: MutationDecision | undefined;
    nextAdministration: AdministrationDecision | undefined;
    failNextAdministration: boolean;
  } = {
    active: false,
    version: 'v2',
    availableTargets: true,
    actorDenied: false,
    denySessionRead: false,
    administrationReads: 0,
    actorReads: 0,
    activityReads: 0,
    settledMutations: 0,
    commands: [],
    nextMutation: undefined,
    nextAdministration: undefined,
    failNextAdministration: false,
  };
  await page.route('**/api/**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (path === '/api/access/current-actor') {
      state.actorReads += 1;
      return state.actorDenied
        ? route.fulfill({ status: 403 })
        : route.fulfill({ json: assignmentAdministrator });
    }
    if (path === '/api/companies') return route.fulfill({ json: [] });
    if (path === '/api/activity-log') {
      state.activityReads += 1;
      return route.fulfill({ json: { events: [] } });
    }
    if (path === '/api/workspace-session-revocations') {
      if (!state.denySessionRead)
        throw new Error('Unexpected session recovery read');
      state.actorDenied = true;
      return route.fulfill({ status: 403 });
    }
    if (path === '/api/company-context-assignments/administration') {
      state.administrationReads += 1;
      const pending = state.nextAdministration;
      state.nextAdministration = undefined;
      const outcome = pending === undefined ? 'ready' : await pending.promise;
      if (outcome === 'failure' || state.failNextAdministration) {
        state.failNextAdministration = false;
        return route.fulfill({ status: 503 });
      }
      if (outcome === 'empty' || !state.availableTargets)
        return route.fulfill({
          json: { members: [], companies: [], assignments: [] },
        });
      const administration = assignmentAdministration({
        activeBundles: state.active ? [director] : [],
      });
      return route.fulfill({
        json: {
          ...administration,
          assignments: administration.assignments.map((assignment) => ({
            ...assignment,
            permissionSetVersion: state.version,
          })),
        },
      });
    }
    const mutationPath = '/api/company-director-client-assignments';
    if (
      path === mutationPath ||
      path === `${mutationPath}/${assignmentMemberId}/${assignmentCompanyId}`
    ) {
      expect(['POST', 'DELETE']).toContain(request.method());
      if (request.method() === 'POST') {
        expect(path).toBe(mutationPath);
        expect(request.postDataJSON()).toEqual({
          workspaceMembershipId: assignmentMemberId,
          companyId: assignmentCompanyId,
        });
      } else {
        expect(path).toBe(
          `${mutationPath}/${assignmentMemberId}/${assignmentCompanyId}`,
        );
        expect(request.postData()).toBeNull();
      }
      const evidence = {
        path,
        method: request.method(),
        key: request.headers()['idempotency-key'],
        body: request.postData(),
      };
      expect(evidence.key).toBeTruthy();
      state.commands.push(evidence);
      const pending = state.nextMutation;
      state.nextMutation = undefined;
      const outcome = pending === undefined ? 'commit' : await pending.promise;
      if (outcome === 'uncertain') {
        await route.abort('failed');
        state.settledMutations += 1;
        return;
      }
      state.active = request.method() === 'POST';
      if (state.active) state.version = 'v2';
      await route.fulfill({
        status: state.active ? 201 : 200,
        json: {
          id: '33333333-3333-4333-8333-333333333333',
          workspaceMembershipId: assignmentMemberId,
          companyId: assignmentCompanyId,
          bundle: 'Company Director Client Access',
          permissionSetVersion: state.version,
          active: state.active,
        },
      });
      state.settledMutations += 1;
      return;
    }
    throw new Error(
      `Unexpected Company assignment HTTP boundary: ${request.method()} ${path}`,
    );
  });
  return state;
}

export function assignmentRequestCounts({
  state,
}: {
  state: Awaited<ReturnType<typeof installAssignmentBoundary>>;
}) {
  return {
    actor: state.actorReads,
    administration: state.administrationReads,
    activity: state.activityReads,
    mutations: state.commands.length,
  };
}

export async function chooseCompanyAssignment({
  page,
  locale,
  keyboard = false,
}: {
  page: Page;
  locale: AssignmentLocaleFixture;
  keyboard?: boolean;
}) {
  const member = page.getByRole('combobox', { name: locale.member });
  const company = page.getByRole('combobox', {
    name: locale.company,
    exact: true,
  });
  await expect(member).toBeVisible();
  if (keyboard) {
    for (const control of [member, company]) {
      await control.focus();
      await control.press('Enter');
      await expect(page.getByRole('listbox')).toBeVisible();
      await control.press('ArrowDown');
      await control.press('Enter');
      await expect(control).toBeFocused();
    }
  } else {
    await selectOption(member, { value: assignmentMemberId });
    await selectOption(company, { value: assignmentCompanyId });
  }
  await expect(member).toHaveAttribute('data-value', assignmentMemberId);
  await expect(company).toHaveAttribute('data-value', assignmentCompanyId);
  await expect(company).toContainText(assignmentCompanyName);
  await selectOption(page.getByRole('combobox', { name: locale.bundle }), {
    label: locale.director,
  });
}

export async function changeAssignmentLanguage({
  page,
  from,
  to,
}: {
  page: Page;
  from: AssignmentLocaleFixture;
  to: AssignmentLocaleFixture;
}) {
  await selectOption(page.getByRole('combobox', { name: from.language }), {
    label: to.option,
  });
  await expect(page.getByRole('combobox', { name: to.language })).toBeFocused();
  await expect(page.locator('html')).toHaveAttribute('lang', to.locale);
}

export async function captureAssignmentState({
  page,
  testInfo,
  name,
}: {
  page: Page;
  testInfo: TestInfo;
  name: string;
}) {
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(await page.evaluate(() => innerWidth));
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: testInfo.outputPath(`${name}-${testInfo.project.name}.png`),
    fullPage: true,
  });
}
