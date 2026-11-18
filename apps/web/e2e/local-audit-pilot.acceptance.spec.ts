import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { test, expect, type Page } from '@playwright/test';
import { selectOption } from './select-option';
import { certificationMessages } from '../src/certification/certification.copy';
import { resolveMessage, formatMessage } from '../src/localization/messages';
import { startPilotPreview } from './audit-pilot-preview.mjs';
import { preparePilotDossier, pilotCertificate } from './audit-pilot.fixture';
import { qualifyCombinedAudit } from './combined-audit-journey.fixture';
import {
  inspectCommercialPdf,
  compactPdfText,
} from '../../api/src/commercial-pdf/pdf-inspection.test-support.mjs';
import {
  certificationMembers,
  record,
  text,
  type Identity,
} from './certification-journey.acceptance.fixture';

test.use({ actionTimeout: 20_000 });

test('opens and reopens the guided fictional pilot through native review and independent Certificate export', async ({
  page,
  browser,
}, info) => {
  test.setTimeout(360_000);
  const locale = info.project.name.endsWith('narrow') ? 'ru' : 'ro';
  const specimen = await preparePilotDossier(
    page.request,
    `Pilot-${locale}-${Date.now()}`,
  );
  const pilot = await startPilotPreview({
    port: 4175,
    apiOrigin: 'http://127.0.0.1:4174',
    webRoot: fileURLToPath(new URL('..', import.meta.url)),
    specimen,
    certificate: (role: keyof typeof certificationMembers) =>
      pilotCertificate(page.request, specimen, role),
  });
  try {
    await page.goto(`${pilot.origin}/__pilot?lang=${locale}`);
    await expect(
      page.getByRole('heading', {
        name:
          locale === 'ru' ? 'Учебный пилот аудита' : 'Pilot fictiv de audit',
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      page.getByText(specimen.projectTitle, { exact: true }),
    ).toBeVisible();
    const manifestReply = await page.request.get(
      `${pilot.origin}/__pilot/manifest`,
    );
    expect(manifestReply.status()).toBe(200);
    const raw: unknown = await manifestReply.json();
    const manifest = record(raw);
    expect(text(manifest.caseId)).toBe(specimen.caseId);
    expect(text(manifest.projectId)).toBe(specimen.projectId);
    for (const [path, bytes] of [
      ['evidence.pdf', specimen.pdf],
      ['review.docx', specimen.docx],
    ] satisfies Array<[string, Buffer]>) {
      const response = await page.request.get(
        `${pilot.origin}/__pilot/sources/${path}`,
      );
      expect(response.status()).toBe(200);
      expect(await response.body()).toEqual(bytes);
      expect(response.headers().etag).toBe(
        `"${createHash('sha256').update(bytes).digest('hex')}"`,
      );
    }
    const prematureCertificate = await page.request.get(
      `${pilot.origin}/__pilot/sources/certificate-example.pdf`,
    );
    expect(prematureCertificate.status()).toBe(409);
    await page.screenshot({
      path: info.outputPath(`pilot-guide-${locale}.png`),
      fullPage: true,
    });

    async function openActor(member: Identity, activePage: Page = page) {
      const role = (
        ['manager', 'auditor', 'approver', 'reader'] satisfies Array<
          keyof typeof certificationMembers
        >
      ).find(
        (candidate) =>
          certificationMembers[candidate]['x-test-external-subject'] ===
          member['x-test-external-subject'],
      );
      if (!role) throw new Error('Unknown seeded fictional participant.');
      const independent = await activePage.request.get(
        'http://127.0.0.1:4174/api/access/current-actor',
        { headers: member },
      );
      expect(independent.status()).toBe(200);
      const expectedActor = record(await independent.json());
      await activePage.goto(`${pilot.origin}/__pilot?lang=${locale}`);
      const current = activePage.waitForResponse(
        (response) =>
          new URL(response.url()).pathname === '/api/access/current-actor',
      );
      await activePage.locator(`a[href="/__pilot/actor/${role}"]`).click();
      const actual = await current;
      expect(actual.status()).toBe(200);
      expect(record(await actual.json()).workspaceMembershipId).toBe(
        expectedActor.workspaceMembershipId,
      );
    }
    await qualifyCombinedAudit({
      kind: 'pilot',
      page,
      info,
      fixture: specimen,
      openActor,
      supplementaryFileName: 'fictional-reviewed-values.docx',
    });
    const example = await page.request.get(
      `${pilot.origin}/__pilot/sources/certificate-example.pdf`,
    );
    expect(example.status()).toBe(200);
    const issuedText = compactPdfText(
      (await inspectCommercialPdf(new Uint8Array(await example.body())))
        .map((page) => page.text)
        .join('\n'),
    );
    expect(issuedText).toContain(`QUAL-${specimen.caseId.slice(0, 8)}`);
    expect(issuedText).toContain(compactPdfText('Lactis Demo SRL'));
    const fresh = await browser.newContext({
      viewport: info.project.name.endsWith('narrow')
        ? { width: 390, height: 844 }
        : { width: 1440, height: 900 },
    });
    try {
      await fresh.addInitScript(
        (value) => localStorage.setItem('prisma-prim.interface-locale', value),
        locale,
      );
      const reopenedPage = await fresh.newPage();
      await openActor(certificationMembers.manager, reopenedPage);
      const narrow = info.project.name.endsWith('narrow');
      if (narrow) await reopenedPage.locator('.production-menu-button').click();
      await selectOption(
        reopenedPage.locator('.prisme-company-selector').getByRole('combobox'),
        { value: specimen.companyId },
      );
      if (narrow) await reopenedPage.locator('.production-menu-button').click();
      const projects = reopenedPage.locator('.project-workspace');
      await projects.getByRole('searchbox').fill(specimen.projectTitle);
      await projects
        .locator('.project-list')
        .getByRole('button')
        .filter({ hasText: specimen.projectTitle })
        .click();
      const copy = (key: 'title' | 'caseHeading') =>
        resolveMessage(certificationMessages, locale, key);
      await projects
        .getByRole('tab', { name: copy('title'), exact: true })
        .click();
      await reopenedPage
        .getByRole('button', { name: specimen.orderReference, exact: true })
        .click();
      await expect(
        reopenedPage.getByRole('article', {
          name: formatMessage(copy('caseHeading'), {
            reference: specimen.orderReference,
          }),
          exact: true,
        }),
      ).toBeVisible();
      const reopened = await fresh.request.get(
        `${pilot.origin}/api/certification-cases/${specimen.caseId}`,
        {
          headers: { 'x-company-context-id': specimen.companyId },
        },
      );
      expect(reopened.status()).toBe(200);
      const retained = record(await reopened.json());
      expect(retained.id).toBe(specimen.caseId);
      expect(retained.status).toBe('certified');
      await reopenedPage.screenshot({
        path: info.outputPath(`pilot-reopened-${locale}.png`),
        fullPage: true,
      });
    } finally {
      await fresh.close();
    }
  } finally {
    await pilot.close();
  }
});
