import {
  revisionMessages,
  type RevisionMessageKey,
} from '../src/certification/certification-revisions.copy';
import { fictionalCertificatePdf } from './certification-certificate-pdf.fixture';
import {
  releaseMessages,
  type ReleaseMessageKey,
} from '../src/certification/certification-release.copy';
import { createHash, randomUUID } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
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
import {
  exchangeMessages,
  type ExchangeMessageKey,
} from '../src/certification/certification-exchanges.copy';
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

const revisionCopy = (key: RevisionMessageKey) =>
  resolveMessage(revisionMessages, 'en', key);
const releaseCopy = (key: ReleaseMessageKey) =>
  resolveMessage(releaseMessages, 'en', key);
const copy = (key: CertificationMessageKey) =>
  resolveMessage(certificationMessages, 'en', key);
const consistencyCopy = (key: ConsistencyMessageKey) =>
  resolveMessage(consistencyMessages, 'en', key);
const exchangeCopy = (key: ExchangeMessageKey) =>
  resolveMessage(exchangeMessages, 'en', key);

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
  ['certificate_draft', 'releaseDraftTimeline'],
  ['client_opinion', 'releaseOpinionTimeline'],
  ['certificate_draft_approval', 'releaseApprovalTimeline'],
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
const R16_REASON =
  'Fictional: the Stage 2 report was released before the decision by mistake.';
const MANUAL_ITEM = 'Fictional: verify the allergen labels at dispatch.';

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
  function ruleHeading(rule: 'R01' | 'R04' | 'R16') {
    return `${rule} — ${consistencyCopy(
      rule === 'R01' ? 'ruleR01' : rule === 'R04' ? 'ruleR04' : 'ruleR16',
    )}`;
  }
  function exchanges(article: Locator) {
    return article.getByRole('region', {
      name: exchangeCopy('title'),
      exact: true,
    });
  }
  /** One procedure deadline of the region, by its name and Stage. */
  function deadline(article: Locator, name: string) {
    return exchanges(article)
      .getByRole('list', { name: exchangeCopy('deadlinesTitle'), exact: true })
      .getByRole('listitem')
      .filter({ hasText: name });
  }
  const stagePlanDeadline = (stage: 'stage1' | 'stage2') =>
    `${exchangeCopy('deadlineStagePlan')} — ${exchangeCopy(stage)}`;
  /** Opens and fills the same exchange controls for accepted and refused commands. */
  async function fillExchange(
    article: Locator,
    fields: {
      direction: ExchangeMessageKey;
      kind: ExchangeMessageKey;
      document: string;
      counterpart: ExchangeMessageKey;
      name: string;
      date: string;
      channel: ExchangeMessageKey;
      reference: string | null;
    },
  ) {
    const panel = exchanges(article);
    await panel
      .getByRole('button', { name: exchangeCopy('recordAction'), exact: true })
      .click();
    const form = panel.getByRole('form', {
      name: exchangeCopy('formTitle'),
      exact: true,
    });
    await selectOption(
      form.getByLabel(exchangeCopy('formDirection'), { exact: true }),
      { label: exchangeCopy(fields.direction) },
    );
    await selectOption(
      form.getByLabel(exchangeCopy('formKind'), { exact: true }),
      { label: exchangeCopy(fields.kind) },
    );
    await form
      .getByRole('checkbox', {
        name: formatMessage(exchangeCopy('documentVersion'), {
          title: fields.document,
          version: 1,
        }),
        exact: true,
      })
      .check();
    await selectOption(
      form.getByLabel(exchangeCopy('formCounterpartKind'), { exact: true }),
      { label: exchangeCopy(fields.counterpart) },
    );
    await form
      .getByLabel(exchangeCopy('formCounterpartName'), { exact: true })
      .fill(fields.name);
    await form
      .getByLabel(exchangeCopy('formDate'), { exact: true })
      .fill(fields.date);
    await selectOption(
      form.getByLabel(exchangeCopy('formChannel'), { exact: true }),
      { label: exchangeCopy(fields.channel) },
    );
    if (fields.reference !== null)
      await form
        .getByLabel(exchangeCopy('formReference'), { exact: true })
        .fill(fields.reference);
    return form;
  }
  async function recordExchange(
    article: Locator,
    fields: Parameters<typeof fillExchange>[1],
  ) {
    const form = await fillExchange(article, fields);
    await form
      .getByRole('button', { name: exchangeCopy('formSubmit'), exact: true })
      .click();
    await expect(form).toHaveCount(0);
  }
  async function reload(article: Locator) {
    await article
      .getByRole('button', { name: copy('reload'), exact: true })
      .click();
    await expect(consistency(article)).toBeVisible();
  }

  await test.step('the Company administrator sets the fictional procedure deadlines', async () => {
    const article = await openCase(approver);
    const panel = exchanges(article);
    await expect(
      panel.getByText(exchangeCopy('noDeadlines'), { exact: true }),
    ).toBeVisible();
    await expect(
      panel.getByText(exchangeCopy('empty'), { exact: true }),
    ).toBeVisible();
    await panel
      .getByRole('button', { name: exchangeCopy('adminOpen'), exact: true })
      .click();
    const form = panel.getByRole('form', {
      name: exchangeCopy('adminTitle'),
      exact: true,
    });
    for (const [kind, days] of [
      ['deadlineStagePlan', '10'],
      ['deadlineAuditDossier', '20'],
      ['deadlineStage2Report', '0'],
    ] as const)
      await form
        .getByLabel(
          formatMessage(exchangeCopy('adminDays'), {
            name: exchangeCopy(kind),
          }),
          { exact: true },
        )
        .fill(days);
    await form
      .getByRole('button', { name: exchangeCopy('adminSubmit'), exact: true })
      .click();
    await expect(
      panel.getByText(
        formatMessage(exchangeCopy('adminSaved'), { version: 1 }),
        {
          exact: true,
        },
      ),
    ).toBeVisible();
    await expect(
      panel.getByRole('list', {
        name: exchangeCopy('adminHistoryTitle'),
        exact: true,
      }),
    ).toContainText(
      `${exchangeCopy('deadlineStagePlan')}: 10 days; ${exchangeCopy('deadlineAuditDossier')}: 20 days; ${exchangeCopy('deadlineStage2Report')}: 0 days`,
    );
    // The Case reads the new set: nothing sent yet, the audit dossier is
    // already overdue after S2 + 20.
    await expect(
      deadline(article, exchangeCopy('deadlineAuditDossier')),
    ).toContainText(exchangeCopy('stateOverdue'));
    await expect(deadline(article, stagePlanDeadline('stage1'))).toContainText(
      exchangeCopy('stateOverdue'),
    );
  });

  await test.step('a missing application fact marks only its text input with the error border at desktop and narrow widths', async () => {
    const article = await openCase(manager);
    const before = record(await journey.read(manager, journey.base)).revision;
    await article
      .getByRole('button', { name: copy('correctApplication'), exact: true })
      .click();
    const form = article.getByRole('form', {
      name: copy('correctApplication'),
      exact: true,
    });
    const name = form.getByLabel(copy('declaredLegalName'), { exact: true });
    await name.fill('   ');
    await form
      .getByLabel(copy('correctionReason'), { exact: true })
      .fill('Fictional correction for the field validation check.');
    await form
      .getByRole('button', { name: copy('saveCorrection'), exact: true })
      .click();
    await expect(form.locator('[aria-invalid="true"]')).toHaveCount(1);
    await expect(name).toHaveAttribute('aria-invalid', 'true');
    await expect(name).toHaveCSS('border-top-color', 'rgb(167, 51, 73)');
    await expect(
      form.getByLabel(copy('declaredAddress'), { exact: true }),
    ).toHaveCSS('border-top-color', 'rgb(217, 209, 237)');
    await name.scrollIntoViewIfNeeded();
    await page.screenshot({
      path: info.outputPath(`application-refused-field-${width}.png`),
    });
    await form
      .getByRole('button', { name: copy('cancel'), exact: true })
      .click();
    await expect(form).toHaveCount(0);
    expect(record(await journey.read(manager, journey.base)).revision).toBe(
      before,
    );
  });

  await test.step('a refused future exchange marks only its date, with the error border at desktop and narrow widths', async () => {
    const article = await openCase(manager);
    const before = record(await journey.read(manager, journey.base)).revision;
    const form = await fillExchange(article, {
      direction: 'directionSent',
      kind: 'kindStagePlan',
      document: 'Stage 1 audit plan',
      counterpart: 'counterpartClient',
      name: 'Lactis Demo SRL, quality manager',
      date: addDays(journey.today, 2),
      channel: 'channelEmail',
      reference: null,
    });
    const refused = page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname === `/api${journey.base}/exchanges` &&
        response.request().method() === 'POST',
    );
    await form
      .getByRole('button', { name: exchangeCopy('formSubmit'), exact: true })
      .click();
    expect((await refused).status()).toBe(409);
    await expect(form.getByRole('alert')).toContainText(
      copy('exchangeInFuture'),
    );
    const date = form.getByLabel(exchangeCopy('formDate'), { exact: true });
    await expect(form.locator('[aria-invalid="true"]')).toHaveCount(1);
    await expect(date).toHaveAttribute('aria-invalid', 'true');
    await expect(date).toHaveCSS('border-top-color', 'rgb(167, 51, 73)');
    await expect(
      form.getByLabel(exchangeCopy('formCounterpartName'), { exact: true }),
    ).toHaveCSS('border-top-color', 'rgb(217, 209, 237)');
    await expect(
      form.getByLabel(exchangeCopy('formNote'), { exact: true }),
    ).toHaveCSS('border-top-color', 'rgb(217, 209, 237)');
    await date.scrollIntoViewIfNeeded();
    await page.screenshot({
      path: info.outputPath(`exchange-refused-date-${width}.png`),
    });
    await form
      .getByRole('button', { name: exchangeCopy('cancel'), exact: true })
      .click();
    await expect(form).toHaveCount(0);
    expect(record(await journey.read(manager, journey.base)).revision).toBe(
      before,
    );
  });

  await test.step('the programme manager records the questionnaire received by e-mail and the Stage plans sent, met and met late', async () => {
    await journey.attach('questionnaire', 'Fictional questionnaire');
    const article = await openCase(manager);
    await recordExchange(article, {
      direction: 'directionReceived',
      kind: 'kindApplication',
      document: 'Fictional questionnaire',
      counterpart: 'counterpartClient',
      name: 'Lactis Demo SRL, quality manager',
      date: addDays(journey.today, -45),
      channel: 'channelEmail',
      reference: null,
    });
    // The Stage 1 plan sent on S1 − 12 meets the deadline of 10 days.
    const s1Plan = addDays(journey.stages.stage1.start, -12);
    await recordExchange(article, {
      direction: 'directionSent',
      kind: 'kindStagePlan',
      document: 'Stage 1 audit plan',
      counterpart: 'counterpartClient',
      name: 'Lactis Demo SRL, quality manager',
      date: s1Plan,
      channel: 'channelEmail',
      reference: 'OUT-6',
    });
    // The Stage 2 plan sent 7 days before its first day meets it late.
    const current = record(await journey.read(manager, journey.base));
    const plan2 = records(current.stages).find(
      (entry) => entry.step === 'stage_2_plan',
    );
    const s2Plan = addDays(journey.stages.stage2.start, -7);
    await journey.step(manager, `${journey.base}/exchanges`, {
      direction: 'sent',
      itemKind: 'stage_plan',
      attachmentIds: [text(record(plan2?.value).planAttachmentId)],
      counterpart: { kind: 'client', name: 'Lactis Demo SRL, quality manager' },
      businessDate: s2Plan,
      channel: 'email',
      reference: 'OUT-7',
      note: null,
    });
    await reload(article);
    const panel = exchanges(article);
    await expect(
      panel.getByRole('listitem', {
        name: formatMessage(exchangeCopy('recordHeading'), {
          sequence: 1,
          direction: exchangeCopy('directionReceived'),
          kind: exchangeCopy('kindApplication'),
        }),
        exact: true,
      }),
    ).toContainText(exchangeCopy('channelEmail'));
    await expect(deadline(article, stagePlanDeadline('stage1'))).toContainText(
      formatMessage(exchangeCopy('metBy'), { sequence: 2, date: s1Plan }),
    );
    await expect(deadline(article, stagePlanDeadline('stage1'))).toContainText(
      exchangeCopy('stateMet'),
    );
    await expect(deadline(article, stagePlanDeadline('stage2'))).toContainText(
      exchangeCopy('stateMetLate'),
    );
    // The Stage 1 plan shows its sending.
    await expect(
      region(article, 'stage1Title').getByRole('list', {
        name: exchangeCopy('stepSendingsTitle'),
        exact: true,
      }),
    ).toContainText(`on ${s1Plan} by ${exchangeCopy('channelEmail')}`);
    // The register filters by direction.
    await selectOption(
      panel.getByLabel(exchangeCopy('filterDirection'), { exact: true }),
      { label: exchangeCopy('directionReceived') },
    );
    await expect(
      panel
        .getByRole('list', { name: exchangeCopy('registerTitle'), exact: true })
        .getByRole('listitem', { name: /^Exchange Record \d+ — /u }),
    ).toHaveCount(1);
    await selectOption(
      panel.getByLabel(exchangeCopy('filterDirection'), { exact: true }),
      { label: exchangeCopy('filterAll') },
    );
    await panel.screenshot({
      path: info.outputPath(`exchanges-deadlines-${width}.png`),
    });
    // The sendings match the plans' Versions: no exchange rule is raised;
    // only R04, open since the Stage 2 plan, asks to clarify.
    const checked = record(
      record(await journey.read(manager, journey.base)).consistency,
    );
    expect(checked.counts).toEqual({ critical: 0, error: 0, toClarify: 1 });
    expect(records(checked.open).map((entry) => entry.rule)).toEqual(['R04']);
  });

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

  await test.step('the Stage 2 report sent to the client before any decision opens R16, which blocks the decision until the approver accepts it', async () => {
    const current = record(await journey.read(manager, journey.base));
    const report2 = records(current.stages).find(
      (entry) => entry.step === 'stage_2_report',
    );
    const sentOn = addDays(journey.today, -3);
    await journey.step(manager, `${journey.base}/exchanges`, {
      direction: 'sent',
      itemKind: 'stage_report',
      attachmentIds: [text(record(report2?.value).reportAttachmentId)],
      counterpart: { kind: 'client', name: 'Lactis Demo SRL, quality manager' },
      businessDate: sentOn,
      channel: 'email',
      reference: null,
      note: null,
    });
    const blocked = await journey.post(approver, `${journey.base}/decision`, {
      expectedRevision: record(await journey.read(approver, journey.base))
        .revision,
      ...journey.decision(),
    });
    expect(blocked.status()).toBe(409);
    expect(record(await blocked.json())).toMatchObject({
      failures: expect.arrayContaining(['DISCREPANCIES_OPEN']),
      discrepancies: [
        expect.objectContaining({ rule: 'R16', verdict: 'error' }),
      ],
    });
    const article = await openCase(approver);
    const r16 = discrepancy(article, ruleHeading('R16'));
    await expect(r16).toContainText(consistencyCopy('blocksDecision'));
    await expect(r16).toContainText(consistencyCopy('verdictError'));
    await expect(
      deadline(article, exchangeCopy('deadlineStage2Report')),
    ).toContainText(exchangeCopy('stateSentTooEarly'));
    await r16
      .getByRole('button', {
        name: consistencyCopy('acceptAction'),
        exact: true,
      })
      .click();
    await r16
      .getByLabel(consistencyCopy('reason'), { exact: true })
      .fill(R16_REASON);
    await r16
      .getByRole('button', {
        name: consistencyCopy('acceptSubmit'),
        exact: true,
      })
      .click();
    await expect(r16).toContainText(
      formatMessage(consistencyCopy('resolvedReason'), { reason: R16_REASON }),
    );
    expect(record(await journey.read(approver, journey.base))).toMatchObject({
      consistency: {
        counts: { critical: 0, error: 0, toClarify: 0 },
        resolvedTotal: 4,
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

  await test.step('the programme manager agrees Certificate data after the recommendation and before the dossier review', async () => {
    const data = await journey.attach(
      'certificate_data',
      'Signed Certificate data form',
    );
    const article = await openCase(manager);
    const panel = region(article, 'certificateDataTitle');
    const form = panel.getByRole('form', {
      name: copy('recordCertificateData'),
      exact: true,
    });
    const textGroup = form.getByRole('group', {
      name: formatMessage(copy('certificateTextHeading'), { position: 1 }),
      exact: true,
    });
    await textGroup
      .getByLabel(copy('certificateLanguage'), { exact: true })
      .fill(CERTIFICATE_TEXT.language);
    await textGroup
      .getByLabel(copy('certificateHolderName'), { exact: true })
      .fill(CERTIFICATE_TEXT.holderName);
    await textGroup
      .getByLabel(copy('certificateAddress'), { exact: true })
      .fill(CERTIFICATE_TEXT.address);
    await textGroup
      .getByLabel(copy('certificateScope'), { exact: true })
      .fill(CERTIFICATE_TEXT.scope);
    await form
      .getByLabel(copy('certificateDataAgreedOn'), { exact: true })
      .fill(journey.today);
    await selectOption(
      form.getByLabel(copy('certificateDataDocument'), { exact: true }),
      { value: data },
    );
    await form
      .getByRole('button', { name: copy('certificateDataSubmit'), exact: true })
      .click();
    await expect(
      panel.getByRole('button', {
        name: copy('correctCertificateData'),
        exact: true,
      }),
    ).toBeVisible();
    const labels = await article
      .getByRole('list', { name: copy('steps'), exact: true })
      .locator(':scope > li > strong')
      .allTextContents();
    expect(labels.indexOf(copy('stepCertificateData'))).toBe(
      labels.indexOf(copy('stepRecommendation')) + 1,
    );
    await panel.screenshot({
      path: info.outputPath(`certificate-data-before-review-${width}.png`),
    });
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
    await expect(
      granted.getByLabel(copy('certificateLanguage'), { exact: true }),
    ).toHaveValue(CERTIFICATE_TEXT.language);
    await expect(
      granted.getByLabel(copy('certificateHolderName'), { exact: true }),
    ).toHaveValue(CERTIFICATE_TEXT.holderName);
    await expect(
      granted.getByLabel(copy('certificateAddress'), { exact: true }),
    ).toHaveValue(CERTIFICATE_TEXT.address);
    await expect(
      granted.getByLabel(copy('certificateScope'), { exact: true }),
    ).toHaveValue(CERTIFICATE_TEXT.scope);
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
      .getByRole('checkbox', {
        name: copy('decisionIndependenceAttestation'),
        exact: true,
      })
      .check();
    const submit = form.getByRole('button', {
      name: copy('certificationDecisionSubmit'),
      exact: true,
    });
    // Only the field left blank is shown and announced invalid. Its border
    // takes the invalid colour; the other fields keep the field colour.
    const fieldBorder = 'rgb(217, 209, 237)';
    const invalidBorder = 'rgb(167, 51, 73)';
    const scope = granted.getByLabel(copy('certificateScope'), {
      exact: true,
    });
    const rationale = form.getByLabel(copy('decisionRationale'), {
      exact: true,
    });
    const additional = form.getByLabel(copy('decisionAdditionalInformation'), {
      exact: true,
    });
    await submit.focus();
    await page.keyboard.press('Enter');
    await expect(panel.getByRole('alert')).toHaveText(
      copy('certificationDecisionValidation'),
    );
    await expect(form.locator('[aria-invalid="true"]')).toHaveCount(1);
    await expect(rationale).toHaveAttribute('aria-invalid', 'true');
    await expect(rationale).toHaveCSS('border-top-color', invalidBorder);
    await expect(scope).toHaveCSS('border-top-color', fieldBorder);
    await panel.screenshot({
      path: info.outputPath(`decision-blank-rationale-${width}.png`),
    });
    await rationale.fill(DECISION_FACTS.rationale);
    await submit.focus();
    await page.keyboard.press('Enter');
    // The reason is announced and nothing is sent.
    const blocked = panel.getByRole('alert');
    await expect(blocked).toContainText(copy('decisionPreconditionsTitle'));
    // A blocked precondition is a state of the Case, not a field error.
    await expect(form.locator('[aria-invalid="true"]')).toHaveCount(0);
    for (const field of [scope, rationale, additional])
      await expect(field).toHaveCSS('border-top-color', fieldBorder);
    await panel.screenshot({
      path: info.outputPath(`decision-blocked-${width}.png`),
    });
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

    // The approver reviews the already agreed data; the kept decision draft
    // is then recorded without silently reseeding the user's edits.
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

  await test.step('the minor nonconformity and a manual item added by the auditor are among the Re-verification Items', async () => {
    const article = await openCase(auditor);
    const panel = exchanges(article);
    await panel
      .getByRole('button', { name: exchangeCopy('addItem'), exact: true })
      .click();
    const form = panel.getByRole('form', {
      name: exchangeCopy('itemFormTitle'),
      exact: true,
    });
    await form
      .getByLabel(exchangeCopy('itemText'), { exact: true })
      .fill(MANUAL_ITEM);
    await form
      .getByRole('button', { name: exchangeCopy('itemSubmit'), exact: true })
      .click();
    const items = panel.getByRole('list', {
      name: exchangeCopy('reverificationTitle'),
      exact: true,
    });
    await expect(
      items.getByRole('listitem').filter({ hasText: MANUAL_ITEM }),
    ).toContainText(exchangeCopy('itemOpen'));
    await expect(items.getByRole('listitem')).toHaveCount(2);
    await expect(items.getByRole('listitem').first()).toContainText(
      formatMessage(exchangeCopy('itemAutomatic'), { sequence: 2 }),
    );
    await panel.screenshot({
      path: info.outputPath(`reverification-items-${width}.png`),
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

  const englishText = {
    language: 'en',
    holderName: 'Lactis Demo SRL',
    address: '1 Example Street, Demo City',
    scope: 'Production of pasteurised milk (example)',
  };
  await test.step('draft Version 1 DEMO-0001 is sent and the client asks by e-mail to add English', async () => {
    const draftPdf = await journey.attach(
      'certificate_draft',
      'Certificate draft Version 1',
    );
    let article = await openCase(manager);
    let release = article.getByRole('region', {
      name: releaseCopy('title'),
      exact: true,
    });
    const form = release.getByRole('form', {
      name: releaseCopy('recordDraft'),
      exact: true,
    });
    await form
      .getByLabel(releaseCopy('draftPdf'), { exact: true })
      .selectOption(draftPdf);
    await form
      .getByLabel(releaseCopy('number'), { exact: true })
      .fill('DEMO-0001');
    await form
      .getByLabel(releaseCopy('draftDate'), { exact: true })
      .fill(journey.today);
    await form
      .getByRole('button', { name: releaseCopy('recordDraft'), exact: true })
      .click();
    await expect(
      release.getByText(releaseCopy('current'), { exact: false }),
    ).toBeVisible();
    await journey.step(manager, `${journey.base}/exchanges`, {
      direction: 'sent',
      itemKind: 'certificate_draft',
      attachmentIds: [draftPdf],
      counterpart: { kind: 'client', name: 'Lactis Demo SRL, quality manager' },
      businessDate: journey.today,
      channel: 'email',
      reference: null,
      note: null,
    });
    const responsePdf = await journey.attach(
      'client_opinion',
      'Client opinion requesting English',
    );
    const received = await journey.step(manager, `${journey.base}/exchanges`, {
      direction: 'received',
      itemKind: 'client_opinion',
      attachmentIds: [responsePdf],
      counterpart: { kind: 'client', name: 'Lactis Demo SRL, quality manager' },
      businessDate: journey.today,
      channel: 'email',
      reference: null,
      note: 'Fictional client asks to add the English text.',
    });
    const receivedExchange = records(record(received.exchanges).records)
      .map((entry) => record(entry.current))
      .find((entry) => entry.itemKind === 'client_opinion');
    article = await openCase(manager);
    release = article.getByRole('region', {
      name: releaseCopy('title'),
      exact: true,
    });
    const opinion = release.getByRole('form', {
      name: releaseCopy('recordOpinion'),
      exact: true,
    });
    await opinion
      .getByLabel(releaseCopy('opinionDate'), { exact: true })
      .fill(journey.today);
    await opinion
      .getByLabel(releaseCopy('outcome'), { exact: true })
      .selectOption('changes_requested');
    await opinion
      .getByLabel(releaseCopy('opinionExchange'), { exact: true })
      .selectOption(text(receivedExchange?.id));
    await opinion
      .getByLabel(releaseCopy('requestedChange'), { exact: true })
      .fill('Please add the English text.');
    await opinion
      .getByRole('button', { name: releaseCopy('recordOpinion'), exact: true })
      .click();
    for (const title of [releaseCopy('approval'), releaseCopy('issuance')]) {
      const step = release.getByRole('listitem').filter({
        has: page.getByRole('heading', { name: title, exact: true }),
      });
      await expect(
        step.getByText(releaseCopy('changes_requested'), { exact: true }),
      ).toBeVisible();
    }
    await release
      .getByRole('heading', { name: releaseCopy('title'), exact: true })
      .click();
    await release.screenshot({
      path: info.outputPath(
        `certificate-release-changes-requested-${width}.png`,
      ),
    });
  });

  await test.step('agreed data and the fixed-outcome decision gain English, then draft Version 2 records the opinion skip', async () => {
    const data = await journey.attach(
      'certificate_data',
      'Signed bilingual Certificate data form',
    );
    let article = await openCase(manager);
    const dataPanel = region(article, 'certificateDataTitle');
    await dataPanel
      .getByRole('button', {
        name: copy('correctCertificateData'),
        exact: true,
      })
      .click();
    const dataForm = dataPanel.getByRole('form', {
      name: copy('correctCertificateData'),
      exact: true,
    });
    await dataForm
      .getByRole('button', {
        name: copy('addCertificateLanguage'),
        exact: true,
      })
      .click();
    const second = dataForm.getByRole('group', {
      name: formatMessage(copy('certificateTextHeading'), { position: 2 }),
      exact: true,
    });
    await second
      .getByLabel(copy('certificateLanguage'), { exact: true })
      .fill(englishText.language);
    await second
      .getByLabel(copy('certificateHolderName'), { exact: true })
      .fill(englishText.holderName);
    await second
      .getByLabel(copy('certificateAddress'), { exact: true })
      .fill(englishText.address);
    await second
      .getByLabel(copy('certificateScope'), { exact: true })
      .fill(englishText.scope);
    await selectOption(
      dataForm.getByLabel(copy('certificateDataDocument'), { exact: true }),
      { value: data },
    );
    await dataForm
      .getByLabel(copy('correctionReason'), { exact: true })
      .fill('Client requested English text.');
    await dataForm
      .getByRole('button', { name: copy('certificateDataSubmit'), exact: true })
      .click();
    await expect(
      dataPanel.getByRole('button', {
        name: copy('correctCertificateData'),
        exact: true,
      }),
    ).toBeVisible();
    article = await openCase(approver);
    const decisionPanel = region(article, 'certificationDecisionTitle');
    await decisionPanel
      .getByRole('button', { name: copy('correctDecisionTexts'), exact: true })
      .click();
    const decisionForm = decisionPanel.getByRole('form', {
      name: copy('correctDecisionTexts'),
      exact: true,
    });
    await expect(decisionForm.getByRole('radio')).toHaveCount(0);
    await decisionForm
      .getByRole('button', {
        name: copy('addCertificateLanguage'),
        exact: true,
      })
      .click();
    const grantedEnglish = decisionForm.getByRole('group', {
      name: formatMessage(copy('certificateTextHeading'), { position: 2 }),
      exact: true,
    });
    await grantedEnglish
      .getByLabel(copy('certificateLanguage'), { exact: true })
      .fill(englishText.language);
    await grantedEnglish
      .getByLabel(copy('certificateHolderName'), { exact: true })
      .fill(englishText.holderName);
    await grantedEnglish
      .getByLabel(copy('certificateAddress'), { exact: true })
      .fill(englishText.address);
    await grantedEnglish
      .getByLabel(copy('certificateScope'), { exact: true })
      .fill(englishText.scope);
    await decisionForm
      .getByLabel(copy('correctionReason'), { exact: true })
      .fill('Add the agreed English text; outcome unchanged.');
    await decisionForm
      .getByRole('checkbox', {
        name: copy('decisionIndependenceAttestation'),
        exact: true,
      })
      .check();
    await decisionForm
      .getByRole('button', { name: copy('saveCorrection'), exact: true })
      .click();
    await expect(
      decisionPanel.getByRole('button', {
        name: copy('correctDecisionTexts'),
        exact: true,
      }),
    ).toBeVisible();
    const draftPdf = await journey.attach(
      'certificate_draft',
      'Certificate draft Version 2 bilingual',
    );
    article = await openCase(manager);
    const release = article.getByRole('region', {
      name: releaseCopy('title'),
      exact: true,
    });
    const draft = release.getByRole('form', {
      name: releaseCopy('recordDraft'),
      exact: true,
    });
    await draft
      .getByLabel(releaseCopy('draftPdf'), { exact: true })
      .selectOption(draftPdf);
    await draft
      .getByLabel(releaseCopy('number'), { exact: true })
      .fill('DEMO-0001');
    await draft
      .getByLabel(releaseCopy('draftDate'), { exact: true })
      .fill(journey.today);
    await draft
      .getByLabel(releaseCopy('reason'), { exact: true })
      .fill('Bilingual draft follows the corrected decision.');
    await draft
      .getByRole('button', { name: releaseCopy('recordDraft'), exact: true })
      .click();
    const opinion = release.getByRole('form', {
      name: releaseCopy('recordOpinion'),
      exact: true,
    });
    await expect(opinion).toBeVisible();
    await opinion
      .getByLabel(releaseCopy('opinionDate'), { exact: true })
      .fill(journey.today);
    await opinion
      .getByLabel(releaseCopy('outcome'), { exact: true })
      .selectOption('skipped');
    await opinion
      .getByLabel(releaseCopy('skipReason'), { exact: true })
      .selectOption('texts_already_agreed');
    await opinion
      .getByLabel(releaseCopy('reason'), { exact: true })
      .fill('The client agreed the bilingual data.');
    await opinion
      .getByRole('button', { name: releaseCopy('recordOpinion'), exact: true })
      .click();
    const opinionStep = release.getByRole('listitem').filter({
      has: page.getByRole('heading', {
        name: releaseCopy('opinion'),
        exact: true,
      }),
    });
    const recordedSkipReason = opinionStep
      .getByRole('paragraph')
      .filter({ hasText: releaseCopy('skipTexts') });
    await expect(recordedSkipReason).toHaveText(releaseCopy('skipTexts'));
    await expect(recordedSkipReason).toBeVisible();
    const state = record(await journey.read(manager, journey.base));
    expect(record(state.decision)).toMatchObject({
      version: 2,
      value: {
        decision: 'granted',
        grantedTexts: [CERTIFICATE_TEXT, englishText],
      },
    });
    expect(record(state.certificateData)).toMatchObject({
      version: 2,
      value: { texts: [CERTIFICATE_TEXT, englishText] },
    });
    await release
      .getByRole('heading', { name: releaseCopy('title'), exact: true })
      .click();
    // Each draft version reads cleanly: the earlier one ends with its date,
    // the current one with its state (#1315).
    const draftLines = release
      .locator('p')
      .filter({ hasText: /^DEMO-0001 · /u });
    await expect(draftLines).toHaveCount(2);
    const [earlierDraft, currentDraft] = (
      await draftLines.allTextContents()
    ).map((line) => line.trim());
    expect(earlierDraft).not.toMatch(/·$/u);
    expect(currentDraft).toMatch(
      new RegExp(` · ${releaseCopy('current')}$`, 'u'),
    );
    await release.screenshot({
      path: info.outputPath(`certificate-release-draft-2-skipped-${width}.png`),
    });
  });

  await test.step('an independent approver explicitly approves and issues the current draft; courier transmission follows', async () => {
    const releaseState = record(
      record(await journey.read(approver, journey.base)).release,
    );
    const validity = record(releaseState.validity);
    const issuedPdf = await fictionalCertificatePdf({
      validity: {
        validFrom: text(validity.validFrom),
        validUntil: text(validity.validUntil),
        firstSurveillanceBy: text(validity.firstSurveillanceBy),
      },
      version: { kind: 'issued' },
    });
    const issued = await journey.attach(
      'certificate',
      'Issued bilingual Certificate',
      issuedPdf,
    );
    let article = await openCase(approver);
    let release = article.getByRole('region', {
      name: releaseCopy('title'),
      exact: true,
    });
    const approval = release.getByRole('form', {
      name: releaseCopy('approve'),
      exact: true,
    });
    await expect(approval.getByRole('checkbox', { checked: true })).toHaveCount(
      0,
    );
    await approval
      .getByLabel(releaseCopy('approvalDate'), { exact: true })
      .fill(journey.today);
    for (const key of [
      'textsConfirmation',
      'numberConfirmation',
      'validityConfirmation',
      'independence',
    ] as const)
      await approval
        .getByRole('checkbox', { name: releaseCopy(key), exact: true })
        .check();
    await approval
      .getByRole('button', { name: releaseCopy('approve'), exact: true })
      .click();
    const issue = release.getByRole('form', {
      name: copy('recordCertificate'),
      exact: true,
    });
    await expect(issue).toBeVisible();
    await expect(
      issue.getByLabel(copy('certificateNumber'), { exact: true }),
    ).toHaveValue('DEMO-0001');
    await issue
      .getByLabel(copy('certificateIssuedOn'), { exact: true })
      .fill(journey.today);
    await selectOption(
      issue.getByLabel(copy('certificatePdf'), { exact: true }),
      { value: issued },
    );
    await issue
      .getByLabel(copy('certificateSignedBy'), { exact: true })
      .fill(DECISION_FACTS.decidedBy);
    await issue
      .getByLabel(copy('certificateSignedByFunction'), { exact: true })
      .fill(DECISION_FACTS.decidedByFunction);
    await issue
      .getByRole('checkbox', {
        name: copy('certificateIndependenceAttestation'),
        exact: true,
      })
      .check();
    await issue
      .getByRole('button', { name: copy('certificateSubmit'), exact: true })
      .click();
    await expect(
      release.getByText(
        formatMessage(releaseCopy('pendingDays'), { days: 0 }),
        { exact: true },
      ),
    ).toBeVisible();
    await release
      .getByRole('heading', { name: releaseCopy('title'), exact: true })
      .click();
    await release.screenshot({
      path: info.outputPath(`certificate-release-issued-pending-${width}.png`),
    });
    const certified = record(await journey.read(approver, journey.base));
    expect(certified).toMatchObject({
      status: 'certified',
      nextStep: null,
      certificate: {
        number: 'DEMO-0001',
        issuedOn: journey.today,
        validFrom: journey.today,
        validUntil: addDays(addMonths(journey.today, 36), -1),
      },
    });
    await journey.step(manager, `${journey.base}/exchanges`, {
      direction: 'sent',
      itemKind: 'certificate',
      attachmentIds: [issued],
      counterpart: { kind: 'client', name: 'Lactis Demo SRL, quality manager' },
      businessDate: journey.today,
      channel: 'courier',
      reference: null,
      note: null,
    });
    article = await openCase(reader);
    readerCase = article;
    release = article.getByRole('region', {
      name: releaseCopy('title'),
      exact: true,
    });
    await expect(release).toContainText(exchangeCopy('channelCourier'));
    await expect(release.getByText(/Days since issuance/u)).toHaveCount(0);
    await expect(release.getByRole('form')).toHaveCount(0);
    await release
      .getByRole('heading', { name: releaseCopy('title'), exact: true })
      .click();
    await release.screenshot({
      path: info.outputPath(
        `certificate-release-transmitted-reader-${width}.png`,
      ),
    });
  });

  await test.step('revision 1 corrects the actual English PDF city and is transmitted separately by e-mail', async () => {
    const before = record(await journey.read(approver, journey.base));
    const original = record(before.certificate);
    const issuedBytes = await journey.download(
      reader,
      `${journey.base}/documents/${text(original.attachmentId)}/content`,
    );
    const issuedPages = await inspectCommercialPdf(issuedBytes);
    expect(issuedPages).toHaveLength(2);
    expect(compactPdfText(issuedPages[1]?.text ?? '')).toContain(
      compactPdfText('1 Example Street, Demo Ctiy'),
    );
    const revisedBytes = await fictionalCertificatePdf({
      validity: {
        validFrom: text(original.validFrom),
        validUntil: text(original.validUntil),
        firstSurveillanceBy: text(original.firstSurveillanceBy),
      },
      version: { kind: 'revision', revisedOn: journey.today },
    });
    const attachmentId = await journey.attach(
      'certificate',
      'Revision 1 corrects English city',
      revisedBytes,
    );
    const article = await openCase(approver);
    const release = article.getByRole('region', {
      name: releaseCopy('title'),
      exact: true,
    });
    const revisions = release.getByRole('region', {
      name: revisionCopy('title'),
      exact: true,
    });
    const form = revisions.getByRole('form', {
      name: revisionCopy('form'),
      exact: true,
    });
    await expect(form.getByRole('radio', { checked: true })).toHaveCount(0);
    await expect(form.getByRole('checkbox', { checked: true })).toHaveCount(0);
    await selectOption(form.getByLabel(revisionCopy('pdf'), { exact: true }), {
      value: attachmentId,
    });
    await form
      .getByLabel(revisionCopy('date'), { exact: true })
      .fill(journey.today);
    await form
      .getByLabel(revisionCopy('reason'), { exact: true })
      .fill('Correct Demo Ctiy to Demo City on the fictional English page.');
    await form
      .getByRole('radio', { name: revisionCopy('yes'), exact: true })
      .check();
    await form
      .getByRole('checkbox', { name: revisionCopy('attestation'), exact: true })
      .check();
    await form
      .getByRole('button', { name: revisionCopy('submit'), exact: true })
      .click();
    await expect(
      revisions.getByRole('heading', {
        name: formatMessage(revisionCopy('revision'), {
          index: 1,
          state: revisionCopy('current'),
        }),
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      revisions.getByRole('heading', {
        name: formatMessage(revisionCopy('original'), {
          state: revisionCopy('superseded'),
        }),
        exact: true,
      }),
    ).toBeVisible();
    const current = record(await journey.read(approver, journey.base));
    expect(current.certificate).toEqual(original);
    expect(record(current.decision).id).toBe(record(before.decision).id);
    expect(record(current.certificateData).id).toBe(
      record(before.certificateData).id,
    );
    expect(record(current.release)).toMatchObject({
      currentRevisionIndex: 1,
      revisionRequired: false,
      revisions: [{ index: 1, attachmentId, revisionMarked: true }],
    });
    const received = await journey.download(
      reader,
      `${journey.base}/documents/${attachmentId}/content`,
    );
    const pages = await inspectCommercialPdf(received);
    expect(pages).toHaveLength(2);
    const english = compactPdfText(pages[1]?.text ?? '');
    for (const expected of [
      '1 Example Street, Demo City',
      'Revision 1',
      `Revision date: ${journey.today}`,
    ])
      expect(english).toContain(compactPdfText(expected));
    expect(english).not.toContain(compactPdfText('Demo Ctiy'));
    const digest = (bytes: Uint8Array) =>
      createHash('sha256').update(bytes).digest('hex');
    expect(digest(received)).toBe(digest(revisedBytes));
    expect(digest(received)).not.toBe(digest(issuedBytes));
    const documents = records(
      (await journey.read(reader, `${journey.base}/documents`)).items,
    );
    const attached = documents.find((entry) => entry.id === attachmentId);
    const initial = documents.find(
      (entry) => entry.id === original.attachmentId,
    );
    expect(attached?.sha256).toBe(digest(received));
    expect(attached?.versionId).not.toBe(initial?.versionId);
    await writeFile(
      info.outputPath(`certificate-original-${width}.pdf`),
      issuedBytes,
    );
    await writeFile(
      info.outputPath(`certificate-revision-1-${width}.pdf`),
      received,
    );
    await revisions
      .getByRole('heading', { name: revisionCopy('title'), exact: true })
      .click();
    await revisions.screenshot({
      path: info.outputPath(`certificate-revision-1-pending-${width}.png`),
    });
    await journey.step(manager, `${journey.base}/exchanges`, {
      direction: 'sent',
      itemKind: 'certificate',
      attachmentIds: [attachmentId],
      counterpart: { kind: 'client', name: 'Lactis Demo SRL, quality manager' },
      businessDate: journey.today,
      channel: 'email',
      reference: null,
      note: 'Fictional corrected English page.',
    });
    readerCase = await openCase(reader);
    const history = readerCase.getByRole('region', {
      name: revisionCopy('title'),
      exact: true,
    });
    await expect(history.getByRole('form')).toHaveCount(0);
    const revision = history.getByRole('listitem').filter({
      has: page.getByRole('heading', {
        name: formatMessage(revisionCopy('revision'), {
          index: 1,
          state: revisionCopy('current'),
        }),
        exact: true,
      }),
    });
    await expect(revision).toContainText(exchangeCopy('channelEmail'));
    await expect(
      revision.getByText(revisionCopy('pending'), { exact: true }),
    ).toHaveCount(0);
    const state = record(
      record(await journey.read(reader, journey.base)).release,
    );
    expect(record(state.transmission).channel).toBe('courier');
    expect(record(records(state.revisions)[0]?.transmission).channel).toBe(
      'email',
    );
    await history
      .getByRole('heading', { name: revisionCopy('title'), exact: true })
      .click();
    await history.screenshot({
      path: info.outputPath(
        `certificate-revision-1-transmitted-reader-${width}.png`,
      ),
    });
  });

  await test.step('an explicitly unmarked later revision is retained with a visible warning', async () => {
    const before = record(await journey.read(approver, journey.base));
    const original = record(before.certificate);
    const bytes = await fictionalCertificatePdf({
      validity: {
        validFrom: text(original.validFrom),
        validUntil: text(original.validUntil),
        firstSurveillanceBy: text(original.firstSurveillanceBy),
      },
      version: { kind: 'unmarked_revision' },
    });
    const attachmentId = await journey.attach(
      'certificate',
      'Fictional corrected copy without revision mark',
      bytes,
    );
    const article = await openCase(approver);
    const revisions = article.getByRole('region', {
      name: revisionCopy('title'),
      exact: true,
    });
    const form = revisions.getByRole('form', {
      name: revisionCopy('form'),
      exact: true,
    });
    await selectOption(form.getByLabel(revisionCopy('pdf'), { exact: true }), {
      value: attachmentId,
    });
    await form
      .getByLabel(revisionCopy('date'), { exact: true })
      .fill(journey.today);
    await form
      .getByLabel(revisionCopy('reason'), { exact: true })
      .fill(
        'The fictional producer omitted the revision mark on this corrected copy.',
      );
    await form
      .getByRole('radio', { name: revisionCopy('no'), exact: true })
      .check();
    await form
      .getByRole('checkbox', { name: revisionCopy('attestation'), exact: true })
      .check();
    await form
      .getByRole('button', { name: revisionCopy('submit'), exact: true })
      .click();
    await expect(
      revisions.getByText(revisionCopy('unmarked'), { exact: true }),
    ).toBeVisible();
    const exact = await journey.download(
      reader,
      `${journey.base}/documents/${attachmentId}/content`,
    );
    expect(createHash('sha256').update(exact).digest('hex')).toBe(
      createHash('sha256').update(bytes).digest('hex'),
    );
    const pages = await inspectCommercialPdf(exact);
    expect(pages).toHaveLength(2);
    expect(compactPdfText(pages[1]?.text ?? '')).toContain(
      compactPdfText('1 Example Street, Demo City'),
    );
    expect(
      compactPdfText(pages.map((page) => page.text).join(' ')),
    ).not.toContain(compactPdfText('Revision 1'));
    await journey.step(manager, `${journey.base}/exchanges`, {
      direction: 'sent',
      itemKind: 'certificate',
      attachmentIds: [attachmentId],
      counterpart: { kind: 'client', name: 'Lactis Demo SRL, quality manager' },
      businessDate: journey.today,
      channel: 'email',
      reference: null,
      note: null,
    });
    readerCase = await openCase(reader);
    const history = readerCase.getByRole('region', {
      name: revisionCopy('title'),
      exact: true,
    });
    await expect(
      history.getByText(revisionCopy('unmarked'), { exact: true }),
    ).toBeVisible();
    await expect(
      history.getByRole('heading', {
        name: formatMessage(revisionCopy('revision'), {
          index: 2,
          state: revisionCopy('current'),
        }),
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      history.getByRole('heading', {
        name: formatMessage(revisionCopy('revision'), {
          index: 1,
          state: revisionCopy('superseded'),
        }),
        exact: true,
      }),
    ).toBeVisible();
    await expect(history.getByRole('form')).toHaveCount(0);
    await history
      .getByRole('heading', { name: revisionCopy('title'), exact: true })
      .click();
    await history.screenshot({
      path: info.outputPath(
        `certificate-revision-unmarked-reader-${width}.png`,
      ),
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
      'DEMO-0001',
      'Revision 0',
      'Revision 1',
      'Revision 2',
      'revision not marked on the Certificate',
      'Superseded',
      'Current',
      'Correct Demo Ctiy to Demo City on the fictional English page.',
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
      'certificate_draft',
      'client_opinion',
      'certificate_data',
      'decision',
      'certificate_draft',
      'client_opinion',
      'certificate_draft_approval',
    ]);
    // The reader's timeline is complete once it ends with the Certificate.
    const titles = region(article, 'timelineTitle').locator(
      ':scope > ol > li > strong',
    );
    await expect(titles.last()).toHaveText(
      formatMessage(copy('timelineCertificate'), {
        number: 'DEMO-0001',
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
    expect(documents).toHaveLength(16);
    // The dossier consistency section lists the resolved Discrepancies.
    expected.push(
      'Dossier consistency',
      'R01 — Audit duration against the current application — Error — Resolved',
      'R04 — Stage plan days against calendar days and auditors on site — To clarify — Resolved',
      'Manual Discrepancy 1 — Stage type — To clarify — Resolved',
      `R16 — ${consistencyCopy('ruleR16')} — Error — Resolved`,
      R04_REASON,
      MANUAL_REASON,
      R16_REASON,
    );
    // The exchange register with its deadline states at generation time,
    // then the Re-verification Items.
    expected.push(
      'Exchanges and deadlines',
      'Procedure deadline set, version 1',
      'Stage plan sent to the client — Stage 1 — Met',
      'Stage plan sent to the client — Stage 2 — Met late',
      'Audit dossier transmitted to the certification body — Overdue',
      'Stage 2 report released to the client — Sent too early',
      'Exchange Record 1 — Received — Application',
      'Exchange Record 2 — Sent — Stage plan',
      'Lactis Demo SRL, quality manager',
      'Re-verification Items',
      'Automatic Re-verification Item — Open',
      'Re-verification Item 1 — Open',
      MANUAL_ITEM,
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

  await test.step('the reader continues past 200 exchanges and keeps the older Stage sending at desktop and narrow widths', async () => {
    const current = record(await journey.read(manager, journey.base));
    let expectedRevision = current.revision;
    const loaded = record(current.exchanges);
    const documents = records(
      (await journey.read(manager, `${journey.base}/documents`)).items,
    );
    const document = documents[0];
    if (!document || typeof loaded.total !== 'number')
      throw new Error('Expected the fictional register.');
    for (let sequence = loaded.total + 1; sequence <= 205; sequence++) {
      const response = await journey.post(
        manager,
        `${journey.base}/exchanges`,
        {
          expectedRevision,
          direction: 'received',
          itemKind: 'other',
          attachmentIds: [text(document.id)],
          counterpart: {
            kind: 'client',
            name: 'Lactis Demo SRL, quality manager',
          },
          businessDate: journey.today,
          channel: 'email',
          reference: `PAGED-${sequence}`,
          note: null,
        },
      );
      expect(response.status()).toBe(201);
      expectedRevision = record(await response.json()).revision;
    }
    const article = await openCase(reader);
    const panel = exchanges(article);
    await expect(
      panel.getByRole('listitem', { name: /^Exchange Record \d+ — /u }),
    ).toHaveCount(200);
    await expect(
      region(article, 'stage1Title').getByRole('list', {
        name: exchangeCopy('stepSendingsTitle'),
        exact: true,
      }),
    ).toContainText('Exchange Record 2');
    const more = panel.getByRole('button', {
      name: exchangeCopy('pageMore'),
      exact: true,
    });
    await more.scrollIntoViewIfNeeded();
    await page.screenshot({
      path: info.outputPath(`exchange-pagination-${width}.png`),
    });
    await more.click();
    await expect(
      panel.getByRole('listitem', { name: /^Exchange Record \d+ — /u }),
    ).toHaveCount(205);
    await expect(more).toHaveCount(0);
    const oldest = panel.getByRole('listitem', {
      name: /^Exchange Record 1 — /u,
    });
    await oldest.scrollIntoViewIfNeeded();
    await expect(oldest).toContainText('Fictional questionnaire');
    await page.screenshot({
      path: info.outputPath(`exchange-pagination-loaded-${width}.png`),
    });
  });
});
