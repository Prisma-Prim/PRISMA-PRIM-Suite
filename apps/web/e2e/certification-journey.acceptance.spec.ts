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
import {
  consistencyMessages,
  type ConsistencyMessageKey,
} from '../src/certification/certification-consistency.copy';
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
const consistencyCopy = (key: ConsistencyMessageKey) =>
  resolveMessage(consistencyMessages, 'en', key);

/**
 * The Case page's timeline title of each step version. The dossier register
 * prints every version under the step name its title starts with (#1287).
 */
const STEP_TITLES = new Map<string, CertificationMessageKey>([
  ['application', 'timelineApplication'],
  ['application_review', 'timelineReview'],
  ['duration', 'timelineDuration'],
  ['agreement', 'timelineAgreement'],
  ['team', 'timelineTeam'],
  ['team_decision', 'timelineTeamDecision'],
  ['stage_1_plan', 'timelineStage1Plan'],
  ['stage_1_report', 'timelineStage1Report'],
  ['stage_2_plan', 'timelineStage2Plan'],
  ['stage_2_report', 'timelineStage2Report'],
  ['recommendation', 'timelineRecommendation'],
  ['dossier_review', 'timelineDossierReview'],
  ['decision', 'timelineCertificationDecision'],
  ['certificate_data', 'timelineCertificateData'],
]);
/** The step name a timeline title starts with, before its dash. */
function stepNameOf(title: string): string {
  const dash = title.indexOf(' — ');
  if (dash < 1)
    throw new Error(`Timeline title without a leading step name: ${title}`);
  return title.slice(0, dash);
}
/** Buttons that would record or change something; a reader sees none. */
const COMMAND =
  /^(Record|Correct|Change|Reclassify|Judge|Verify|Attach|Add|Remove|Open a|Propose|Approve|Accept|Resolve)\b/u;
/** The fictional reasons of the consistency part of the journey. */
const R04_REASON = 'Fictional long audit day agreed with the client.';
const MANUAL_REASON =
  'The signed PDF prevails; the editable draft is not part of the dossier.';

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
  function consistency(article: Locator) {
    return article.getByRole('region', {
      name: consistencyCopy('title'),
      exact: true,
    });
  }
  /**
   * The Discrepancy of a rule, or the manual one, by its heading; its
   * accessible name continues with the verdict.
   */
  function discrepancy(article: Locator, heading: string) {
    return consistency(article).getByRole('listitem', { name: heading });
  }
  function ruleHeading(rule: 'R01' | 'R04') {
    return `${rule} — ${consistencyCopy(rule === 'R01' ? 'ruleR01' : 'ruleR04')}`;
  }
  async function reload(article: Locator) {
    await article
      .getByRole('button', { name: copy('reload'), exact: true })
      .click();
    await expect(consistency(article)).toBeVisible();
  }

  await test.step('the headcount corrected to 60 opens R01, which blocks the decision until a new duration closes it as corrected', async () => {
    const article = await openCase(manager);
    const application = region(article, 'applicationTitle');
    await application
      .getByRole('button', { name: copy('correctApplication'), exact: true })
      .click();
    const form = application.getByRole('form', {
      name: copy('correctApplication'),
      exact: true,
    });
    await form.getByLabel(copy('totalHeadcount'), { exact: true }).fill('60');
    await form.getByLabel(copy('effectiveFte'), { exact: true }).fill('60');
    await form
      .getByLabel(copy('correctionReason'), { exact: true })
      .fill('Fictional: the client corrected its headcount to 60.');
    await form
      .getByRole('button', { name: copy('saveCorrection'), exact: true })
      .click();
    const r01 = discrepancy(article, ruleHeading('R01'));
    await expect(r01).toContainText(
      formatMessage(consistencyCopy('valueDays'), { days: '3.5' }),
    );
    await expect(r01).toContainText(
      formatMessage(consistencyCopy('valueDays'), { days: '3' }),
    );
    await expect(r01).toContainText(consistencyCopy('blocksDecision'));
    await expect(r01).toContainText(consistencyCopy('verdictError'));
    // R04 is open too: 2 auditor-days over one calendar day, one auditor.
    await expect(discrepancy(article, ruleHeading('R04'))).toContainText(
      consistencyCopy('neverBlocks'),
    );
    await consistency(article).screenshot({
      path: info.outputPath(`dossier-consistency-open-${width}.png`),
    });
    expect(record(await journey.read(manager, journey.base))).toMatchObject({
      consistency: { counts: { critical: 0, error: 1, toClarify: 1 } },
    });

    // The programme manager confirms a new duration on the corrected facts.
    await journey.step(manager, `${journey.base}/duration`, {
      reason: 'Fictional headcount corrected to 60; 3 auditor-days kept.',
      inputs: journey.durationInputs,
      confirmed: journey.confirmedDuration,
      justification:
        'Fictional single site; the change of band is absorbed by the plan.',
    });
    await reload(article);
    await expect(discrepancy(article, ruleHeading('R01'))).toContainText(
      formatMessage(consistencyCopy('sourceStep'), {
        step: consistencyCopy('stepDuration'),
        version: 2,
      }),
    );
    await expect(
      consistency(article).getByRole('heading', {
        name: consistencyCopy('resolvedTitle'),
        exact: true,
      }),
    ).toBeVisible();
  });

  await test.step('the programme manager accepts R04 with a reason; it stays resolved after a reload', async () => {
    const article = await openCase(manager);
    const r04 = discrepancy(article, ruleHeading('R04'));
    await r04
      .getByRole('button', {
        name: consistencyCopy('acceptAction'),
        exact: true,
      })
      .click();
    const form = r04.getByRole('form', {
      name: consistencyCopy('acceptFormTitle'),
      exact: true,
    });
    await form
      .getByLabel(consistencyCopy('reason'), { exact: true })
      .fill(R04_REASON);
    await form
      .getByRole('button', {
        name: consistencyCopy('acceptSubmit'),
        exact: true,
      })
      .click();
    const reason = formatMessage(consistencyCopy('resolvedReason'), {
      reason: R04_REASON,
    });
    await expect(r04).toContainText(reason);
    await reload(article);
    await expect(r04).toContainText(reason);
    await expect(r04).toContainText(consistencyCopy('resolvedAccepted'));
    await expect(
      consistency(article).getByText(consistencyCopy('noneOpen'), {
        exact: true,
      }),
    ).toBeVisible();
  });

  await test.step('the auditor records a manual Discrepancy that the approver accepts', async () => {
    const draft = await journey.attach(
      'other',
      'Editable Stage 2 report draft',
    );
    expect(draft).toBeTruthy();
    const article = await openCase(auditor);
    await consistency(article)
      .getByRole('button', {
        name: consistencyCopy('manualToggle'),
        exact: true,
      })
      .click();
    const form = consistency(article).getByRole('form', {
      name: consistencyCopy('manualFormTitle'),
      exact: true,
    });
    await form
      .getByLabel(consistencyCopy('manualSubject'), { exact: true })
      .fill('Stage type');
    await form
      .getByRole('radio', {
        name: consistencyCopy('verdictToClarify'),
        exact: true,
      })
      .check();
    for (const [legend, value, document] of [
      ['manualFirstValue', 'Stage 1', 'Editable Stage 2 report draft'],
      ['manualSecondValue', 'Stage 2', 'Stage 2 audit report'],
    ] as const) {
      const group = form.getByRole('group', {
        name: consistencyCopy(legend),
        exact: true,
      });
      await group
        .getByLabel(consistencyCopy('manualValue'), { exact: true })
        .fill(value);
      await selectOption(
        group.getByLabel(consistencyCopy('manualDocument'), { exact: true }),
        {
          label: formatMessage(consistencyCopy('sourceDocument'), {
            title: document,
            version: 1,
          }),
        },
      );
      await group
        .getByLabel(consistencyCopy('manualLocation'), { exact: true })
        .fill('page 1');
    }
    await form
      .getByRole('button', {
        name: consistencyCopy('manualSubmit'),
        exact: true,
      })
      .click();
    const heading = formatMessage(consistencyCopy('manualHeading'), {
      sequence: 1,
      subject: 'Stage type',
    });
    await expect(discrepancy(article, heading)).toContainText(
      consistencyCopy('neverBlocks'),
    );
    // The auditor records it; accepting it is the approver's act.
    await expect(discrepancy(article, heading).getByRole('button')).toHaveCount(
      0,
    );

    const approverCase = await openCase(approver);
    const manual = discrepancy(approverCase, heading);
    await manual
      .getByRole('button', {
        name: consistencyCopy('acceptAction'),
        exact: true,
      })
      .click();
    await manual
      .getByLabel(consistencyCopy('reason'), { exact: true })
      .fill(MANUAL_REASON);
    await manual
      .getByRole('button', {
        name: consistencyCopy('acceptSubmit'),
        exact: true,
      })
      .click();
    await expect(manual).toContainText(
      formatMessage(consistencyCopy('resolvedReason'), {
        reason: MANUAL_REASON,
      }),
    );
    await consistency(approverCase).screenshot({
      path: info.outputPath(`dossier-consistency-resolved-${width}.png`),
    });
    expect(record(await journey.read(approver, journey.base))).toMatchObject({
      consistency: {
        counts: { critical: 0, error: 0, toClarify: 0 },
        resolvedTotal: 3,
      },
    });
  });

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
    // The attached PDFs and the generated PDF carry distinct names, and the
    // dossier review form names the archive it is distinct from.
    const reviewForm = region(article, 'dossierReviewTitle').getByRole('form', {
      name: copy('recordDossierReview'),
      exact: true,
    });
    await expect(
      reviewForm.getByText(copy('dossierReviewHelp'), { exact: true }),
    ).toBeVisible();
    await region(article, 'documentsTitle').screenshot({
      path: info.outputPath(`certification-document-archive-${width}.png`),
    });
    await region(article, 'registerPdfTitle').screenshot({
      path: info.outputPath(`certification-register-pdf-${width}.png`),
    });
    await reviewForm.screenshot({
      path: info.outputPath(`certification-dossier-review-form-${width}.png`),
    });
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
    // Once: the standing notice yields to the alert.
    await expect(
      panel.getByRole('list', {
        name: copy('decisionPreconditionsList'),
        exact: true,
      }),
    ).toHaveCount(1);
    await expect(
      panel.getByText(copy('decisionPreconditionsTitle'), { exact: true }),
    ).toHaveCount(1);
    await panel.screenshot({
      path: info.outputPath(`decision-preconditions-blocked-${width}.png`),
    });
    expect(decisionPosts).toEqual([]);

    // The programme manager records the Certificate data after the
    // recommendation; the approver reviews the dossier; the kept draft is
    // then recorded.
    const data = await journey.attach(
      'certificate_data',
      'Signed Certificate data form',
    );
    await journey.step(manager, `${journey.base}/certificate-data`, {
      texts: [CERTIFICATE_TEXT],
      agreedOn: journey.today,
      agreementAttachmentId: data,
    });
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
      nextStep: 'certificate',
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
    // The corrected application and duration, then the Certificate data
    // before the dossier review.
    expect(timeline.map((entry) => entry.step)).toEqual([
      'application',
      'application_review',
      'duration',
      'agreement',
      'team',
      'team_decision',
      'stage_1_plan',
      'stage_1_report',
      'stage_2_plan',
      'stage_2_report',
      'application',
      'duration',
      'recommendation',
      'certificate_data',
      'dossier_review',
      'decision',
    ]);
    // The reader's timeline is complete once it ends with the Certificate.
    const titles = region(article, 'timelineTitle').locator(
      ':scope > ol > li > strong',
    );
    await expect(titles.last()).toHaveText(
      formatMessage(copy('timelineCertificate'), {
        number: `DEMO-${journey.orderReference}`,
      }),
    );
    const shown = await titles.allTextContents();
    for (const entry of timeline) {
      const title = STEP_TITLES.get(text(entry.step));
      if (!title) throw new Error(`Untitled step ${String(entry.step)}`);
      const name = stepNameOf(copy(title));
      // The page shows every version of the step under the name the register
      // prints with it.
      expect(
        shown.filter((line) => line.startsWith(`${name} — `)),
        name,
      ).toHaveLength(
        timeline.filter((other) => other.step === entry.step).length,
      );
      expected.push(`${name} — version ${String(entry.version)}`);
    }
    const documents = records(
      (await journey.read(reader, `${journey.base}/documents`)).items,
    );
    expect(documents).toHaveLength(9);
    // The dossier consistency section lists the resolved Discrepancies.
    expected.push(
      'Dossier consistency',
      'R01 — Audit duration against the current application — Error — Resolved',
      'R04 — Stage plan days against calendar days and auditors on site — To clarify — Resolved',
      'Manual Discrepancy 1 — Stage type — To clarify — Resolved',
      R04_REASON,
      MANUAL_REASON,
    );
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
