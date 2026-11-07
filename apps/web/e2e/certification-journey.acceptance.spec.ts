import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { expect, test, type Locator } from '@playwright/test';
import {
  compactPdfText,
  inspectCommercialPdf,
} from '../../api/src/commercial-pdf/pdf-inspection.test-support.mjs';
import {
  certificationMessages,
  type CertificationMessageKey,
} from '../src/certification/certification.copy';
import { formatMessage, resolveMessage } from '../src/localization/messages';
import {
  CERTIFICATE_TEXT,
  DECISION_FACTS,
  addDays,
  addMonths,
  certificationMembers,
  prepareCertificationJourney,
  record,
  records,
  text,
  type Identity,
} from './certification-journey.acceptance.fixture';
import { selectOption } from './select-option';

const copy = (key: CertificationMessageKey) =>
  resolveMessage(certificationMessages, 'en', key);

/** The English step labels the dossier register prints with each version. */
const STEP_LABELS = new Map([
  ['application', 'Application'],
  ['application_review', 'Application review'],
  ['duration', 'Audit duration'],
  ['agreement', 'Certification agreement'],
  ['team', 'Audit team'],
  ['team_decision', 'Audit team decision'],
  ['stage_1_plan', 'Stage 1 plan'],
  ['stage_1_report', 'Stage 1 report'],
  ['stage_2_plan', 'Stage 2 plan'],
  ['stage_2_report', 'Stage 2 report'],
  ['recommendation', 'Team recommendation'],
  ['dossier_review', 'Dossier review'],
  ['decision', 'Certification decision'],
  ['certificate_data', 'Certificate data'],
]);
/** Buttons that would record or change something; a reader sees none. */
const COMMAND =
  /^(Record|Correct|Change|Reclassify|Judge|Verify|Attach|Add|Remove|Open a|Propose|Approve)\b/u;

test('runs the fictional Lactis Demo SRL Case from the application to the Certificate and downloads its dossier register', async ({
  page,
}, info) => {
  test.setTimeout(360_000);
  const narrow = info.project.name.endsWith('narrow');
  const width = narrow ? 'narrow' : 'desktop';
  const journey = await prepareCertificationJourney(
    page.request,
    `${width}-${randomUUID().slice(0, 8)}`,
  );
  const { manager, auditor, approver, reader } = certificationMembers;

  // One browser page; each member acts through the test identity headers the
  // API accepts in test mode, after a fresh load of the application.
  let member: Identity = manager;
  await page.route('**/api/**', (route) =>
    route.fallback({ headers: { ...route.request().headers(), ...member } }),
  );
  const decisionPosts: string[] = [];
  page.on('request', (request) => {
    if (
      request.method() === 'POST' &&
      new URL(request.url()).pathname === `/api${journey.base}/decision`
    )
      decisionPosts.push(request.url());
  });

  /** Opens the Case in the Project's Certification tab as this member. */
  async function openCase(next: Identity): Promise<Locator> {
    member = next;
    await page.goto('/');
    if (narrow)
      await page.getByRole('button', { name: 'Open navigation' }).click();
    await selectOption(page.getByLabel('Active Company', { exact: true }), {
      value: journey.companyId,
    });
    if (narrow) {
      await page.getByRole('button', { name: 'Close navigation' }).click();
      await page.getByRole('button', { name: 'Open navigation' }).click();
    }
    await page
      .getByRole('navigation', { name: 'Primary navigation' })
      .getByRole('link', { name: 'Projects', exact: true })
      .click();
    const projects = page.locator('.project-workspace');
    await projects
      .getByRole('searchbox', { name: 'Find Projects' })
      .fill(journey.projectTitle);
    await projects
      .getByRole('list', { name: 'Projects', exact: true })
      .getByRole('button', {
        name: `${journey.projectTitle} Client: ${journey.clientName}`,
        exact: true,
      })
      .click();
    await projects
      .getByRole('tab', { name: copy('title'), exact: true })
      .click();
    const panel = page.getByRole('tabpanel', {
      name: copy('title'),
      exact: true,
    });
    await panel
      .getByRole('button', { name: journey.orderReference, exact: true })
      .click();
    const article = page.getByRole('article', {
      name: formatMessage(copy('caseHeading'), {
        reference: journey.orderReference,
      }),
      exact: true,
    });
    await expect(article).toBeVisible();
    return article;
  }
  function region(article: Locator, title: CertificationMessageKey) {
    return article.getByRole('region', { name: copy(title), exact: true });
  }

  await test.step('the team leader records the recommendation by keyboard', async () => {
    const article = await openCase(auditor);
    const panel = region(article, 'recommendationTitle');
    const form = panel.getByRole('form', {
      name: copy('recordRecommendation'),
      exact: true,
    });
    const grant = form.getByRole('radio', {
      name: copy('recommendationGrant'),
      exact: true,
    });
    await grant.focus();
    await page.keyboard.press('Space');
    await expect(grant).toBeChecked();
    await page.keyboard.press('Tab');
    const basis = form.getByLabel(copy('recommendationBasis'), {
      exact: true,
    });
    await expect(basis).toBeFocused();
    await page.keyboard.type(
      'Fictional minor nonconformity with an adequate plan; system effectively implemented.',
    );
    const submit = form.getByRole('button', {
      name: copy('recommendationSubmit'),
      exact: true,
    });
    await submit.focus();
    await page.keyboard.press('Enter');
    await expect(
      panel.getByRole('button', {
        name: copy('correctRecommendation'),
        exact: true,
      }),
    ).toBeVisible();
    await expect(page.getByText(copy('saveConfirmed'))).toBeVisible();

    // He also holds the approver bundle, yet his team link refuses him the
    // dossier review and the decision, in the interface and at the server.
    await expect(
      region(article, 'dossierReviewTitle').getByText(
        copy('dossierIndependence'),
      ),
    ).toBeVisible();
    const decisionPanel = region(article, 'certificationDecisionTitle');
    await expect(
      decisionPanel.getByText(copy('certificationDecisionIndependence')),
    ).toBeVisible();
    await expect(decisionPanel.getByRole('form')).toHaveCount(0);
    const current = record(await journey.read(auditor, journey.base));
    const refused = await journey.post(auditor, `${journey.base}/decision`, {
      expectedRevision: current.revision,
      ...journey.decision(),
    });
    expect(refused.status()).toBe(409);
    expect(record(await refused.json()).code).toBe(
      'CERTIFICATION_INDEPENDENCE',
    );
  });

  await test.step('the decision before the dossier review is blocked with its reason, then recorded', async () => {
    const article = await openCase(approver);
    decisionPosts.length = 0;
    const panel = region(article, 'certificationDecisionTitle');
    await expect(
      panel.getByRole('list', {
        name: copy('decisionPreconditionsList'),
        exact: true,
      }),
    ).toHaveText(copy('preconditionDossierReviewIncomplete'));
    const form = panel.getByRole('form', {
      name: copy('recordCertificationDecision'),
      exact: true,
    });
    await form
      .getByRole('group', { name: copy('decisionOutcome'), exact: true })
      .getByRole('radio', { name: copy('decisionGranted'), exact: true })
      .check();
    const granted = form.getByRole('group', {
      name: formatMessage(copy('certificateTextHeading'), { position: 1 }),
      exact: true,
    });
    await granted
      .getByLabel(copy('certificateLanguage'), { exact: true })
      .fill(CERTIFICATE_TEXT.language);
    await granted
      .getByLabel(copy('certificateHolderName'), { exact: true })
      .fill(CERTIFICATE_TEXT.holderName);
    await granted
      .getByLabel(copy('certificateAddress'), { exact: true })
      .fill(CERTIFICATE_TEXT.address);
    await granted
      .getByLabel(copy('certificateScope'), { exact: true })
      .fill(CERTIFICATE_TEXT.scope);
    await form
      .getByLabel(copy('decidedOn'), { exact: true })
      .fill(journey.today);
    await form
      .getByLabel(copy('decidedBy'), { exact: true })
      .fill(DECISION_FACTS.decidedBy);
    await form
      .getByLabel(copy('decidedByFunction'), { exact: true })
      .fill(DECISION_FACTS.decidedByFunction);
    await form
      .getByLabel(copy('decisionRationale'), { exact: true })
      .fill(DECISION_FACTS.rationale);
    await form
      .getByRole('checkbox', {
        name: copy('decisionIndependenceAttestation'),
        exact: true,
      })
      .check();
    const submit = form.getByRole('button', {
      name: copy('certificationDecisionSubmit'),
      exact: true,
    });
    await submit.focus();
    await page.keyboard.press('Enter');
    // The reason is announced and nothing is sent.
    const blocked = panel.getByRole('alert');
    await expect(blocked).toContainText(copy('decisionPreconditionsTitle'));
    await expect(
      blocked.getByRole('list', {
        name: copy('decisionPreconditionsList'),
        exact: true,
      }),
    ).toHaveText(copy('preconditionDossierReviewIncomplete'));
    expect(decisionPosts).toEqual([]);

    // The approver reviews the dossier; the kept draft is then recorded.
    await journey.reviewDossier();
    await article
      .getByRole('button', { name: copy('reload'), exact: true })
      .click();
    await expect(
      region(article, 'dossierReviewTitle').getByRole('button', {
        name: copy('correctDossierReview'),
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      panel.getByRole('list', { name: copy('decisionPreconditionsList') }),
    ).toHaveCount(0);
    await submit.focus();
    await page.keyboard.press('Enter');
    await expect(
      panel.getByRole('button', {
        name: copy('correctDecisionTexts'),
        exact: true,
      }),
    ).toBeVisible();
    expect(decisionPosts).toHaveLength(1);
    expect(record(await journey.read(approver, journey.base))).toMatchObject({
      nextStep: 'certificate_data',
      decision: {
        value: {
          decision: 'granted',
          decidedOn: journey.today,
          grantedTexts: [CERTIFICATE_TEXT],
        },
      },
    });
  });

  let readerCase: Locator | undefined;
  await test.step('a reader consults the open Case without any command', async () => {
    const article = await openCase(reader);
    readerCase = article;
    await expect(article.getByText(copy('readOnly'))).toBeVisible();
    await expect(article.getByRole('form')).toHaveCount(0);
    await expect(article.getByRole('button', { name: COMMAND })).toHaveCount(0);
    await expect(
      region(article, 'registerPdfTitle').getByRole('button', {
        name: copy('registerPdfDownload'),
        exact: true,
      }),
    ).toBeVisible();
  });

  await test.step('the Certificate is recorded, valid three years minus one day', async () => {
    const data = await journey.attach(
      'certificate_data',
      'Signed Certificate data form',
    );
    await journey.step(manager, `${journey.base}/certificate-data`, {
      texts: [CERTIFICATE_TEXT],
      agreedOn: journey.today,
      agreementAttachmentId: data,
    });
    const issued = await journey.attach('certificate', 'Issued Certificate');
    const certified = await journey.step(
      approver,
      `${journey.base}/certificate`,
      {
        number: `DEMO-${journey.orderReference}`,
        attachmentId: issued,
        signedBy: DECISION_FACTS.decidedBy,
        signedByFunction: DECISION_FACTS.decidedByFunction,
        independenceAttested: true,
      },
    );
    expect(certified).toMatchObject({
      status: 'certified',
      nextStep: null,
      certificate: {
        validFrom: journey.today,
        validUntil: addDays(addMonths(journey.today, 36), -1),
      },
    });
  });

  await test.step('the reader downloads the dossier register by keyboard', async () => {
    if (!readerCase) throw new Error('The reader has not opened the Case.');
    const article = readerCase;
    await article
      .getByRole('button', { name: copy('reload'), exact: true })
      .click();
    await expect(article.getByText(copy('caseCertifiedNote'))).toBeVisible();
    const button = region(article, 'registerPdfTitle').getByRole('button', {
      name: copy('registerPdfDownload'),
      exact: true,
    });
    const responsePromise = page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname === `/api${journey.base}/register`,
    );
    const downloadPromise = page.waitForEvent('download');
    await button.focus();
    await page.keyboard.press('Enter');
    const [response, download] = await Promise.all([
      responsePromise,
      downloadPromise,
    ]);
    expect(response.status()).toBe(200);
    expect(response.headers()['content-type']).toBe('application/pdf');
    expect(new URL(response.url()).searchParams.get('language')).toBe('en');
    expect(download.suggestedFilename()).toBe(
      `certification-case-register-${journey.caseId.slice(0, 8)}.pdf`,
    );
    const path = info.outputPath(`dossier-register-${width}.pdf`);
    await download.saveAs(path);
    const bytes = new Uint8Array(await readFile(path));
    expect(bytes.length).toBeGreaterThan(0);
    expect(Buffer.from(bytes.subarray(0, 5)).toString('latin1')).toBe('%PDF-');

    const content = compactPdfText(
      (await inspectCommercialPdf(bytes)).map((page) => page.text).join('\n'),
    );
    const expected = [
      'Dossier register',
      'Lactis Demo SRL',
      journey.orderReference,
      `DEMO-${journey.orderReference}`,
    ];
    const timeline = records(
      (await journey.read(reader, `${journey.base}/timeline`)).entries,
    );
    expect(timeline.map((entry) => entry.step)).toEqual([
      ...STEP_LABELS.keys(),
    ]);
    for (const entry of timeline) {
      const label = STEP_LABELS.get(text(entry.step));
      if (!label) throw new Error(`Unlabelled step ${String(entry.step)}`);
      expected.push(`${label} — version ${String(entry.version)}`);
    }
    const documents = records(
      (await journey.read(reader, `${journey.base}/documents`)).items,
    );
    expect(documents).toHaveLength(8);
    for (const document of documents)
      expected.push(text(document.versionId), text(document.sourceTitle));
    for (const value of expected)
      expect(content, value).toContain(compactPdfText(value));
  });

  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: info.outputPath(`certification-journey-${width}.png`),
    fullPage: true,
  });
});
