import { expect, test } from '@playwright/test';
import {
  assignmentBundleCases,
  assignmentCompanyId,
  assignmentCompanyName,
  assignmentCompanyReference,
  assignmentLocaleCases,
  assignmentMemberId,
  assignmentMemberLabel,
  assignmentMemberReference,
  assignmentOtherCompanyReference,
  assignmentOtherMemberReference,
} from '../src/access/company-assignment-localization.test-fixtures';
import {
  assignmentRequestCounts,
  captureAssignmentState,
  changeAssignmentLanguage,
  chooseCompanyAssignment,
  deferredDecision,
  installAssignmentBoundary,
} from './company-assignment-localization.fixture';
import { openSelect } from './select-option';

// Intercepted App contract evidence. No live PostgreSQL or Clerk claim.
test.use({ locale: 'fr-FR' });

for (const locale of assignmentLocaleCases) {
  test(`${locale.locale}: preserves captured v1, deliberately grants v2 and revokes through the real App with keyboard and duplicate labels`, async ({
    page,
  }, testInfo) => {
    await page.addInitScript(
      (savedLocale) =>
        localStorage.setItem('prisma-prim.interface-locale', savedLocale),
      locale.locale,
    );
    const state = await installAssignmentBoundary({ page });
    state.active = true;
    state.version = 'v1';
    await page.goto('/?frame=prisme#access');
    await chooseCompanyAssignment({ page, locale, keyboard: true });
    const access = page.getByRole('region', { name: locale.title });
    await expect(access).toHaveClass(/company-access--prisme/u);
    const member = page.getByRole('combobox', { name: locale.member });
    const company = page.getByRole('combobox', {
      name: locale.company,
      exact: true,
    });
    const bundle = page.getByRole('combobox', { name: locale.bundle });
    await expect(member).toHaveText(
      `${assignmentMemberLabel} — ${locale.reference} ${assignmentMemberReference}`,
    );
    await expect(company).toHaveText(
      `${assignmentCompanyName} — ${locale.reference} ${assignmentCompanyReference}`,
    );
    await expect(access.getByRole('status')).toHaveText(
      `${locale.state}: ${locale.version} v1`,
    );
    await expect(access.getByText(locale.captured)).toBeVisible();
    await expect(
      access.getByRole('button', { name: locale.grant }),
    ).toBeDisabled();

    const memberOptions = await openSelect(member);
    await expect(memberOptions.getByRole('option')).toHaveText([
      locale.selectMember,
      `${assignmentMemberLabel} — ${locale.reference} ${assignmentMemberReference}`,
      `${assignmentMemberLabel} — ${locale.reference} ${assignmentOtherMemberReference}`,
    ]);
    await page.keyboard.press('Escape');
    const companyOptions = await openSelect(company);
    await expect(companyOptions.getByRole('option')).toHaveText([
      locale.selectCompany,
      `${assignmentCompanyName} — ${locale.reference} ${assignmentCompanyReference}`,
      `${assignmentCompanyName} — ${locale.reference} ${assignmentOtherCompanyReference}`,
    ]);
    await page.keyboard.press('Escape');
    const options = await openSelect(bundle);
    await expect(options.getByRole('option')).toHaveText(
      assignmentBundleCases.map((choice) => choice.labels[locale.locale]),
    );
    await captureAssignmentState({
      page,
      testInfo,
      name: `${locale.locale}-assignment-open-bundles-v1`,
    });
    await page.keyboard.press('Escape');
    const handles = await Promise.all([
      member.elementHandle(),
      company.elementHandle(),
      bundle.elementHandle(),
    ]);
    const counts = assignmentRequestCounts({ state });
    const alternate =
      locale.locale === 'ro'
        ? assignmentLocaleCases[2]
        : assignmentLocaleCases[0];
    await changeAssignmentLanguage({ page, from: locale, to: alternate });
    await expect(
      page.getByRole('region', { name: alternate.title }).getByRole('status'),
    ).toHaveText(`${alternate.state}: ${alternate.version} v1`);
    for (const handle of handles) {
      if (handle === null)
        throw new Error('Selected control disappeared before locale switch');
      expect(await handle.evaluate((element) => element.isConnected)).toBe(
        true,
      );
    }
    await expect(
      page.getByRole('combobox', { name: alternate.member }),
    ).toHaveAttribute('data-value', assignmentMemberId);
    await expect(
      page.getByRole('combobox', { name: alternate.company, exact: true }),
    ).toHaveAttribute('data-value', assignmentCompanyId);
    await expect(
      page.getByRole('combobox', { name: alternate.bundle }),
    ).toHaveAttribute('data-value', 'director-client');
    expect(assignmentRequestCounts({ state })).toEqual(counts);
    await changeAssignmentLanguage({ page, from: alternate, to: locale });
    expect(assignmentRequestCounts({ state })).toEqual(counts);

    await access.getByRole('button', { name: locale.revoke }).click();
    await expect(access.getByText(locale.revoked)).toBeVisible();
    await expect(
      access.getByRole('status').filter({ hasText: locale.state }),
    ).toHaveText(`${locale.state}: ${locale.notGranted}`);
    await access.getByRole('button', { name: locale.grant }).click();
    await expect(access.getByText(locale.granted)).toBeVisible();
    await expect(
      access.getByRole('status').filter({ hasText: locale.state }),
    ).toHaveText(`${locale.state}: ${locale.version} v2`);
    await expect(access.getByText(locale.captured)).toBeVisible();
    await captureAssignmentState({
      page,
      testInfo,
      name: `${locale.locale}-assignment-granted-v2`,
    });
    await access.getByRole('button', { name: locale.revoke }).click();
    await expect(access.getByText(locale.revoked)).toBeVisible();
    await expect(
      access.getByRole('status').filter({ hasText: locale.state }),
    ).toHaveText(`${locale.state}: ${locale.notGranted}`);
    await captureAssignmentState({
      page,
      testInfo,
      name: `${locale.locale}-assignment-revoked`,
    });
    expect(state.commands.map((command) => command.method)).toEqual([
      'DELETE',
      'POST',
      'DELETE',
    ]);
    expect(new Set(state.commands.map((command) => command.key)).size).toBe(3);
    expect(state.administrationReads).toBe(counts.administration + 3);
    expect(state.activityReads).toBe(counts.activity + 3);
    expect(state.actorReads).toBe(counts.actor);
  });

  test(`${locale.locale}: pending language switch → uncertain exact retry → confirmed reload failure → explicit read recovery`, async ({
    page,
  }, testInfo) => {
    await page.addInitScript(
      (savedLocale) =>
        localStorage.setItem('prisma-prim.interface-locale', savedLocale),
      locale.locale,
    );
    const state = await installAssignmentBoundary({ page });
    const pending = deferredDecision<'commit' | 'uncertain'>();
    state.nextMutation = pending;
    try {
      await page.goto('/?frame=prisme#access');
      await chooseCompanyAssignment({ page, locale });
      await page.getByRole('button', { name: locale.grant }).click();
      await expect.poll(() => state.commands.length).toBe(1);
      const counts = assignmentRequestCounts({ state });
      const alternate =
        locale.locale === 'fr'
          ? assignmentLocaleCases[1]
          : assignmentLocaleCases[2];
      await changeAssignmentLanguage({ page, from: locale, to: alternate });
      expect(assignmentRequestCounts({ state })).toEqual(counts);
      const access = page.getByRole('region', { name: alternate.title });
      await expect(
        access.getByRole('combobox', { name: alternate.member }),
      ).toBeDisabled();
      await expect(
        access.getByRole('combobox', { name: alternate.bundle }),
      ).toHaveAttribute('data-value', 'director-client');
      await captureAssignmentState({
        page,
        testInfo,
        name: `${locale.locale}-assignment-pending-${alternate.locale}`,
      });
      pending.resolve('uncertain');
      await expect(access.getByRole('alert')).toHaveText(alternate.error);
      await expect(
        access.getByRole('button', { name: alternate.grant }),
      ).toBeEnabled();
      expect(state.commands).toHaveLength(1);
      state.failNextAdministration = true;
      await access.getByRole('button', { name: alternate.grant }).click();
      await expect(
        access.getByRole('button', { name: alternate.retry }),
      ).toBeVisible();
      await expect(access.getByRole('alert')).toHaveText(alternate.error);
      await expect(access.getByText(alternate.granted)).toHaveCount(0);
      expect(state.commands).toHaveLength(2);
      expect(state.commands[1]).toEqual(state.commands[0]);
      const unrefreshedCounts = assignmentRequestCounts({ state });
      await captureAssignmentState({
        page,
        testInfo,
        name: `${locale.locale}-assignment-confirmed-unrefreshed`,
      });
      await changeAssignmentLanguage({ page, from: alternate, to: locale });
      expect(assignmentRequestCounts({ state })).toEqual(unrefreshedCounts);
      const currentAccess = page.getByRole('region', { name: locale.title });
      await currentAccess.getByRole('button', { name: locale.retry }).click();
      await expect(currentAccess.getByText(locale.granted)).toBeVisible();
      await expect(
        currentAccess.getByRole('status').filter({ hasText: locale.state }),
      ).toHaveText(`${locale.state}: ${locale.version} v2`);
      expect(state.commands).toHaveLength(2);
      await currentAccess.getByRole('button', { name: locale.revoke }).click();
      await expect(currentAccess.getByText(locale.revoked)).toBeVisible();
      expect(state.commands).toHaveLength(3);
      expect(state.commands[2]?.method).toBe('DELETE');
      await captureAssignmentState({
        page,
        testInfo,
        name: `${locale.locale}-assignment-recovered-revoked`,
      });
    } finally {
      pending.resolve('uncertain');
    }
  });

  test(`${locale.locale}: delayed loading, safe error, explicit read retry and empty administration`, async ({
    page,
  }, testInfo) => {
    await page.addInitScript(
      (savedLocale) =>
        localStorage.setItem('prisma-prim.interface-locale', savedLocale),
      locale.locale,
    );
    const state = await installAssignmentBoundary({ page });
    const pending = deferredDecision<'ready' | 'failure' | 'empty'>();
    state.nextAdministration = pending;
    try {
      await page.goto('/?frame=prisme#access');
      const access = page.getByRole('region', { name: locale.title });
      await expect(access.getByRole('status')).toHaveText(locale.loading);
      await expect.poll(() => state.administrationReads).toBe(1);
      pending.resolve('failure');
      await expect(access.getByRole('alert')).toHaveText(locale.error);
      await captureAssignmentState({
        page,
        testInfo,
        name: `${locale.locale}-assignment-read-error`,
      });
      state.availableTargets = false;
      await access.getByRole('button', { name: locale.retry }).click();
      await expect(access.getByText(locale.empty)).toBeVisible();
      await expect(
        access.getByRole('combobox', { name: locale.member }),
      ).toHaveCount(0);
      expect(state.administrationReads).toBe(2);
      expect(state.commands).toHaveLength(0);
      await captureAssignmentState({
        page,
        testInfo,
        name: `${locale.locale}-assignment-empty`,
      });
    } finally {
      pending.resolve('failure');
    }
  });
}

test('defaults the Company assignment form to Romanian independently of browser language and rejects a stale Workspace while its grant is pending', async ({
  page,
}, testInfo) => {
  await page.addInitScript(() =>
    localStorage.setItem('prisma-prim.interface-locale', 'unsupported'),
  );
  const state = await installAssignmentBoundary({ page });
  state.denySessionRead = true;
  const pending = deferredDecision<'commit' | 'uncertain'>();
  state.nextMutation = pending;
  try {
    await page.goto('/?frame=prisme#access');
    const romanian = assignmentLocaleCases[0];
    await chooseCompanyAssignment({ page, locale: romanian });
    await expect(page.locator('html')).toHaveAttribute('lang', 'ro');
    await page.getByRole('button', { name: romanian.grant }).click();
    await expect.poll(() => state.commands.length).toBe(1);
    await changeAssignmentLanguage({
      page,
      from: romanian,
      to: assignmentLocaleCases[2],
    });
    const beforeRetirement = assignmentRequestCounts({ state });
    await page
      .getByRole('button', { name: 'Vérifier la révocation des sessions' })
      .click();
    await expect(
      page.getByRole('region', { name: assignmentLocaleCases[2].title }),
    ).toHaveCount(0);
    pending.resolve('commit');
    await expect.poll(() => state.settledMutations).toBe(1);
    expect(state.commands).toHaveLength(1);
    expect(state.activityReads).toBe(beforeRetirement.activity);
    expect(state.administrationReads).toBe(beforeRetirement.administration);
    await expect(page.getByText(assignmentLocaleCases[2].granted)).toHaveCount(
      0,
    );
    await captureAssignmentState({
      page,
      testInfo,
      name: 'assignment-retired-pending-workspace-fr',
    });
  } finally {
    pending.resolve('commit');
  }
});
