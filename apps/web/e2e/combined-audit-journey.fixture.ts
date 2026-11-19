import {
  expect,
  type Locator,
  type Route,
  type Page,
  type TestInfo,
} from '@playwright/test';
import { createHash, randomUUID } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import {
  combinedAuditPdf,
  combinedCertificatePdf,
} from '../../api/test-support/combined-audit-pdf.fixture.mjs';
import {
  compactPdfText,
  inspectCommercialPdf,
} from '../../api/src/commercial-pdf/pdf-inspection.test-support.mjs';
import { prepareCombinedAudit } from './combined-audit-qualification.fixture';
import {
  certificationMembers,
  record,
  records,
  text,
  type Identity,
  DECISION_FACTS,
  CERTIFICATE_TEXT,
} from './certification-journey.acceptance.fixture';
import {
  certificationMessages,
  type CertificationMessageKey,
} from '../src/certification/certification.copy';
import {
  releaseMessages,
  type ReleaseMessageKey,
} from '../src/certification/certification-release.copy';
import { resolveMessage, formatMessage } from '../src/localization/messages';
import { openSelect, selectOption } from './select-option';
import { removeRoute } from './route-removal';

type AuditProofInput = { page: Page; info: TestInfo } & (
  | { kind: 'registered' }
  | {
      kind: 'pilot';
      fixture: Awaited<ReturnType<typeof prepareCombinedAudit>>;
      openActor: (member: Identity) => Promise<void>;
      supplementaryFileName: string;
    }
);

/** One complete native proof; entry modes retain the same independent assertions. */
export async function qualifyCombinedAudit(input: AuditProofInput) {
  const { page, info } = input;
  const narrow = info.project.name.endsWith('narrow');
  const locale = narrow ? 'ru' : 'ro';
  const copy = (key: CertificationMessageKey) =>
    resolveMessage(certificationMessages, locale, key);
  const releaseCopy = (key: ReleaseMessageKey) =>
    resolveMessage(releaseMessages, locale, key);
  const words = narrow
    ? {
        title: 'Анализ досье',
        importFiles: 'Импортировать PDF / Word',
        document: 'Документ и версия',
        addPdf: 'Добавить PDF',
        chooseFile: 'Выберите файл',
        uploadDocx: 'Загрузить DOCX',
        createRun: 'Создать анализ',
        openRun: 'Открыть',
        original: 'Открыть оригинал',
        context: 'Контекст JSON',
        manual: 'Ручное предложение',
        value: 'Значение',
        rationale: 'Обоснование',
        citation: 'Цитируемый фрагмент',
        submit: 'Отправить',
        confirm: 'Подтвердить',
        retry: 'Повторить',
        stale: 'Исторический / устаревший',
        partial: 'Частично',
      }
    : {
        title: 'Analiza dosarului',
        importFiles: 'Importă fișiere PDF / Word',
        document: 'Document și versiune',
        addPdf: 'Adăugați PDF',
        chooseFile: 'Alegeți fișierul',
        uploadDocx: 'Încărcați DOCX',
        createRun: 'Creați analiza',
        openRun: 'Deschideți',
        original: 'Deschideți originalul',
        context: 'Context JSON',
        manual: 'Propunere manuală',
        value: 'Valoare',
        rationale: 'Justificare',
        citation: 'Pasaj citat',
        submit: 'Trimiteți',
        confirm: 'Confirmați',
        retry: 'Reîncercați',
        stale: 'Istorică / neactuală',
        partial: 'Parțială',
      };
  await page.addInitScript(
    (value) => localStorage.setItem('prisma-prim.interface-locale', value),
    locale,
  );
  const fixture =
    input.kind === 'pilot'
      ? input.fixture
      : await prepareCombinedAudit(
          page.request,
          `1444-${locale}-${randomUUID().slice(0, 8)}`,
        );
  const supplementaryFileName =
    input.kind === 'pilot'
      ? input.supplementaryFileName
      : 'fictional-bilingual.docx';
  const { manager, auditor, approver, reader } = certificationMembers;
  const membership = process.env.ACCEPTANCE_PRIMARY_MEMBERSHIP_ID;
  if (!membership) throw new Error('Missing native acceptance membership');
  let member: Identity = manager;
  if (input.kind === 'registered')
    await page.route('**/api/**', (route) =>
      route.fallback({ headers: { ...route.request().headers(), ...member } }),
    );
  async function openProject(next: Identity) {
    if (input.kind === 'pilot') await input.openActor(next);
    else {
      member = next;
      await page.goto('/');
    }
    if (narrow) await page.locator('.production-menu-button').click();
    await selectOption(
      page.locator('.prisme-company-selector').getByRole('combobox'),
      { value: fixture.companyId },
    );
    if (narrow) {
      await page.locator('.production-menu-button').click();
      await page.locator('.production-menu-button').click();
    }
    await page.locator('nav a[href="#projects"]').click();
    const projects = page.locator('.project-workspace');
    await projects.getByRole('searchbox').fill(fixture.projectTitle);
    await projects
      .locator('.project-list')
      .getByRole('button')
      .filter({ hasText: fixture.projectTitle })
      .click();
    return projects;
  }
  async function openAnalysis() {
    const projects = await openProject(manager);
    await projects.getByRole('tab', { name: words.title, exact: true }).click();
    return page.locator('.dossier-analysis');
  }
  async function openCase(next: Identity) {
    const projects = await openProject(next);
    await projects
      .getByRole('tab', { name: copy('title'), exact: true })
      .click();
    await page
      .getByRole('button', { name: fixture.orderReference, exact: true })
      .click();
    return page.getByRole('article', {
      name: formatMessage(copy('caseHeading'), {
        reference: fixture.orderReference,
      }),
      exact: true,
    });
  }
  async function save(form: Locator, label: string, path: string) {
    const pending = page.waitForResponse(
      (reply) =>
        reply.request().method() === 'POST' &&
        new URL(reply.url()).pathname === `/api${fixture.base}${path}`,
    );
    await form.getByRole('button', { name: label, exact: true }).click();
    const response = await pending;
    expect(response.status(), await response.text()).toBe(201);
    return record(await response.json());
  }
  const beforeAnalysis = await fixture.read(manager, fixture.base);
  const canonicalClientBefore = await fixture.read(
    manager,
    `/clients/${fixture.clientId}`,
  );
  const canonicalEntitiesBefore = await fixture.read(
    manager,
    `/clients/${fixture.clientId}/legal-entities`,
  );
  const timelineBefore = await fixture.read(
    manager,
    `${fixture.base}/timeline`,
  );
  let analysis = await openAnalysis();
  if (input.kind === 'pilot') {
    await expect(
      analysis.getByRole('button', { name: words.importFiles, exact: true }),
    ).toBeVisible();
    await fixture.read(manager, `${fixture.prefix}/intake-batches`);
  }
  const options = await openSelect(analysis.getByLabel(words.document));
  await options
    .getByRole('option', { name: /Fictional bilingual source.*evidence\.pdf/ })
    .click();
  const addingPdf = page.waitForRequest(
    (request) =>
      request.method() === 'POST' &&
      new URL(request.url()).pathname === `/api${fixture.prefix}/sources`,
  );
  await analysis
    .getByRole('button', { name: words.addPdf, exact: true })
    .click();
  expect(record((await addingPdf).postDataJSON())).toMatchObject(
    fixture.source,
  );
  await analysis.getByLabel(words.chooseFile, { exact: true }).setInputFiles({
    name: supplementaryFileName,
    mimeType:
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    buffer: fixture.docx,
  });
  await analysis
    .getByRole('button', { name: words.uploadDocx, exact: true })
    .click();
  await expect(analysis.getByText(supplementaryFileName)).toBeVisible();
  const runReply = page.waitForResponse(
    (reply) =>
      reply.request().method() === 'POST' &&
      new URL(reply.url()).pathname === `/api${fixture.prefix}/runs`,
  );
  await analysis
    .getByRole('button', { name: words.createRun, exact: true })
    .click();
  const createdRun = await runReply;
  expect(createdRun.status()).toBe(201);
  const runId = text(record(await createdRun.json()).id);
  await analysis
    .getByRole('button', { name: words.openRun, exact: true })
    .first()
    .click();
  await expect(
    analysis.getByRole('button', { name: words.context, exact: true }),
  ).toBeVisible();
  const run = await fixture.read(manager, `${fixture.prefix}/runs/${runId}`);
  const encoded = JSON.stringify(run);
  expect(encoded).toContain('Cod fiscal: RO12345678');
  expect(encoded).toContain('Налоговый код: RO12345678');
  expect(encoded).toContain('RO87654321');
  const pdfSource = records(run.sources).find((row) => row.kind === 'pdf');
  const exactVersion = {
    documentId: fixture.source.documentId,
    documentVersionId: fixture.source.documentVersionId,
    representationId: fixture.source.representationId,
  };
  expect(pdfSource).toMatchObject(exactVersion);
  expect(record(pdfSource?.extraction)).toMatchObject({
    state: 'partial',
    unitsTotal: 3,
    unitsReadable: 2,
  });
  const workspace = await fixture.read(manager, fixture.prefix);
  expect(
    records(workspace.sources).find((row) => row.kind === 'pdf'),
  ).toMatchObject(exactVersion);
  const nativeInventory = await fixture.read(
    manager,
    `${fixture.prefix}/inventory`,
  );
  expect(
    records(nativeInventory.items).find(
      (row) =>
        row.kind === 'pdf' && row.attachmentId === fixture.source.attachmentId,
    ),
  ).toMatchObject(fixture.source);
  // Exact independent byte oracles for the native and supplementary originals.
  for (const [quote, expected, name] of [
    ['Cod fiscal: RO12345678', fixture.pdf, 'analysis-native-original.pdf'],
    ['RO87654321', fixture.docx, 'analysis-supplement.docx'],
  ] as const) {
    const download = page.waitForEvent('download');
    await analysis
      .locator('blockquote')
      .filter({ hasText: quote })
      .first()
      .getByRole('button', { name: words.original, exact: true })
      .click();
    const path = info.outputPath(name);
    await (await download).saveAs(path);
    expect(await readFile(path)).toEqual(expected);
  }
  const manual = analysis.getByRole('group', {
    name: words.manual,
    exact: true,
  });
  await manual.getByLabel(words.value, { exact: true }).fill('RO12345678');
  await manual
    .getByLabel(words.rationale, { exact: true })
    .fill('Fictional human proposal; never canonical.');
  const passages = await openSelect(manual.getByLabel(words.citation));
  await passages.getByRole('option', { name: /page:1.*RO12345678/ }).click();
  await manual.getByRole('button', { name: words.submit, exact: true }).click();
  await expect(
    analysis.getByRole('button', { name: words.confirm, exact: true }),
  ).toBeVisible();
  const attempts: Array<{ body: string | null; key: string }> = [];
  const reviewPattern = `**/api${fixture.prefix}/suggestions/*/reviews`;
  const loseReviewReceipt = async (route: Route) => {
    attempts.push({
      body: route.request().postData(),
      key: route.request().headers()['idempotency-key'] ?? '',
    });
    if (attempts.length !== 1) return route.fallback();
    const reply = await route.fetch({
      headers: { ...route.request().headers(), ...manager },
    });
    expect(reply.status()).toBe(201);
    await route.abort('failed');
  };
  await page.route(reviewPattern, loseReviewReceipt);
  const retriedReview = page.waitForResponse(
    (reply) =>
      reply.request().method() === 'POST' &&
      new URL(reply.url()).pathname.endsWith('/reviews'),
  );
  await analysis
    .getByRole('button', { name: words.confirm, exact: true })
    .click();
  await expect(
    analysis.getByRole('button', { name: words.retry, exact: true }),
  ).toBeVisible();
  await analysis
    .getByRole('button', { name: words.retry, exact: true })
    .click();
  expect((await retriedReview).status()).toBe(201);
  await expect.poll(() => attempts.length).toBe(2);
  expect(attempts[1]).toEqual(attempts[0]);
  await removeRoute(page, reviewPattern, loseReviewReceipt);
  const reviewed = await fixture.read(
    manager,
    `${fixture.prefix}/runs/${runId}`,
  );
  const suggestion = records(reviewed.suggestions)[0];
  if (!suggestion) throw new Error('Missing cited human suggestion');
  expect(records(suggestion.reviews)).toHaveLength(1);
  expect(records(suggestion.reviews)[0]).toMatchObject({
    revision: 1,
    decision: 'confirm',
    actorMembershipId: membership,
  });
  expect(suggestion).toMatchObject({
    proposal: { field: 'taxId', value: 'RO12345678' },
  });
  expect(records(record(suggestion.proposal).citations)).toContainEqual(
    expect.objectContaining({ sourceId: pdfSource?.id, locator: 'page:1' }),
  );
  expect(await fixture.read(manager, fixture.base)).toEqual(beforeAnalysis);
  expect(await fixture.read(manager, `/clients/${fixture.clientId}`)).toEqual(
    canonicalClientBefore,
  );
  expect(
    await fixture.read(manager, `/clients/${fixture.clientId}/legal-entities`),
  ).toEqual(canonicalEntitiesBefore);
  expect(await fixture.read(manager, `${fixture.base}/timeline`)).toEqual(
    timelineBefore,
  );
  // Command recovery refreshes the workspace; reopen the exact retained run
  // before capturing its coverage, citations and attributed human review.
  await analysis
    .getByRole('button', { name: words.openRun, exact: true })
    .first()
    .click();
  await expect(
    analysis.getByRole('button', { name: words.context, exact: true }),
  ).toBeVisible();
  await expect(
    analysis.getByRole('paragraph').filter({
      hasText: 'Fictional human proposal; never canonical.',
    }),
  ).toBeVisible();
  await analysis.screenshot({
    path: info.outputPath(`combined-analysis-reviewed-${locale}.png`),
  });

  // Native Version freshness is checked while the Case revision is unchanged.
  const document = await fixture.read(
    manager,
    `/documents/${fixture.source.documentId}`,
  );
  const version = await fixture.command(
    manager,
    `/documents/${fixture.source.documentId}/versions`,
    { expectedRevision: document.workingRevision },
  );
  const newVersionId = text(version.versionId);
  expect(newVersionId).not.toBe(fixture.source.documentVersionId);
  const newerPdf = await combinedAuditPdf('RO11111111');
  const upload = await page.request.post(
    `http://127.0.0.1:4174/api/documents/${fixture.source.documentId}/versions/${newVersionId}/content?expectedRevision=${String(version.workingRevision)}&fileName=newer-source.pdf`,
    {
      headers: {
        ...fixture.headers(manager),
        'idempotency-key': randomUUID(),
        'content-type': 'application/pdf',
      },
      data: newerPdf,
    },
  );
  expect(upload.status(), await upload.text()).toBe(201);
  const uploaded = record(await upload.json());
  const designated = await fixture.post(
    manager,
    `/documents/${fixture.source.documentId}/versions/${newVersionId}/official-designation`,
    { expectedRevision: uploaded.workingRevision },
  );
  expect(designated.status()).toBe(200);
  expect((await fixture.read(manager, fixture.base)).revision).toBe(
    beforeAnalysis.revision,
  );
  const historical = await fixture.read(
    manager,
    `${fixture.prefix}/runs/${runId}`,
  );
  expect(historical.stale).toBe(true);
  expect(
    records(historical.sources).find((row) => row.kind === 'pdf'),
  ).toMatchObject(exactVersion);
  expect(records(records(historical.suggestions)[0]?.reviews)).toHaveLength(1);
  const staleReview = await fixture.post(
    manager,
    `${fixture.prefix}/suggestions/${text(suggestion.id)}/reviews`,
    { expectedRevision: 1, decision: 'confirm' },
  );
  expect(staleReview.status()).toBe(409);
  // A separate Case change rejects the captured Case command without a mutation.
  const staleCaseRevision = beforeAnalysis.revision;
  await fixture.attach('plan', 'Fictional attachment advances Case revision');
  const staleCase = await fixture.post(manager, `${fixture.base}/team`, {
    expectedRevision: staleCaseRevision,
    members: [
      {
        name: 'Ion Popa',
        role: 'team_leader',
        workspaceMembershipId: fixture.auditorMembership,
        holdsCategory: true,
        competenceNote: 'Fictional category C auditor',
        conflictNote: null,
        declarations: {
          noConsultancy: 'confirmed',
          noEmployment: 'confirmed',
          noManagementInvolvement: 'confirmed',
          confidentiality: 'confirmed',
        },
      },
    ],
  });
  expect(staleCase.status()).toBe(409);
  expect((await fixture.read(manager, fixture.base)).team).toBeNull();
  const exact = await page.request.get(
    `http://127.0.0.1:4174/api/documents/${fixture.source.documentId}/versions/${fixture.source.documentVersionId}/content`,
    { headers: fixture.headers(manager) },
  );
  expect(exact.status()).toBe(200);
  expect(await exact.body()).toEqual(fixture.pdf);
  analysis = await openAnalysis();
  await analysis
    .getByRole('button', { name: words.openRun, exact: true })
    .first()
    .click();
  await expect(
    analysis.getByText(words.stale, { exact: false }).first(),
  ).toBeVisible();
  await expect(
    analysis.getByRole('button', { name: words.confirm, exact: true }),
  ).toHaveCount(0);
  await analysis.screenshot({
    path: info.outputPath(`combined-analysis-historical-${locale}.png`),
  });
  const freshReply = page.waitForResponse(
    (reply) =>
      reply.request().method() === 'POST' &&
      new URL(reply.url()).pathname === `/api${fixture.prefix}/runs`,
  );
  await analysis
    .getByRole('button', { name: words.createRun, exact: true })
    .click();
  const freshResponse = await freshReply;
  expect(freshResponse.status()).toBe(201);
  const freshRunId = text(record(await freshResponse.json()).id);
  expect(freshRunId).not.toBe(runId);
  const freshRun = await fixture.read(
    manager,
    `${fixture.prefix}/runs/${freshRunId}`,
  );
  expect(freshRun.stale).toBe(false);
  expect(freshRun.suggestions).toEqual([]);

  // First team links the previously uninvolved Ion; his approver bundle cannot
  // override his own team membership. The other member approves explicitly.
  let article = await openCase(manager);
  const team = article.getByRole('form', {
    name: copy('proposeTeam'),
    exact: true,
  });
  await team
    .getByLabel(copy('teamMemberName'), { exact: true })
    .fill('Ion Popa');
  await selectOption(team.getByLabel(copy('teamMemberRole'), { exact: true }), {
    value: 'team_leader',
  });
  const candidates = await openSelect(
    team.getByLabel(copy('teamMemberLink'), { exact: true }),
  );
  await candidates
    .locator(`[role="option"][data-value="${fixture.auditorMembership}"]`)
    .click();
  await team
    .getByRole('checkbox', { name: copy('holdsCategory'), exact: true })
    .check();
  await team
    .getByLabel(copy('competenceNote'), { exact: true })
    .fill('Fictional ISO 22000 auditor, category C.');
  for (const radio of await team
    .locator('input[type="radio"][value="confirmed"]')
    .all())
    await radio.check();
  await save(team, copy('proposeTeam'), '/team');
  article = await openCase(auditor);
  if (input.kind === 'pilot') await fixture.read(auditor, fixture.prefix);
  await expect(
    article.getByRole('form', { name: copy('recordDecision'), exact: true }),
  ).toHaveCount(0);
  const selfApproval = await fixture.post(
    auditor,
    `${fixture.base}/team-decision`,
    {
      expectedRevision: (await fixture.read(auditor, fixture.base)).revision,
      teamVersion: 1,
      decision: 'approved',
      independenceAttested: true,
    },
  );
  expect(selfApproval.status()).toBe(409);
  article = await openCase(approver);
  const approval = article.getByRole('form', {
    name: copy('recordDecision'),
    exact: true,
  });
  await approval
    .getByRole('radio', { name: copy('decisionApprove'), exact: true })
    .check();
  await approval
    .getByRole('checkbox', {
      name: copy('teamDecisionAttestation'),
      exact: true,
    })
    .check();
  await save(approval, copy('recordDecision'), '/team-decision');
  await fixture.conductAudit();
  const audited = await fixture.read(auditor, fixture.base);
  for (const step of ['stage_1_report', 'stage_2_report'])
    expect(
      records(audited.stages).find((row) => row.step === step)?.recordedBy,
    ).toMatchObject({ workspaceMembershipId: fixture.auditorMembership });

  // Native human audit commands above precede the visible release circuit.
  const certificateNumber = `QUAL-${fixture.caseId.slice(0, 8)}`;
  const validity = record(record(audited.release).validity);
  const certificatePdf = await combinedCertificatePdf({
    number: certificateNumber,
    ...CERTIFICATE_TEXT,
    validFrom: text(validity.validFrom),
    validUntil: text(validity.validUntil),
  });
  const certificateText = compactPdfText(
    (await inspectCommercialPdf(new Uint8Array(certificatePdf)))
      .map((entry) => entry.text)
      .join('\n'),
  );
  for (const literal of [
    certificateNumber,
    CERTIFICATE_TEXT.holderName,
    CERTIFICATE_TEXT.address,
    CERTIFICATE_TEXT.scope,
    text(validity.validFrom),
    text(validity.validUntil),
  ])
    expect(certificateText).toContain(compactPdfText(literal));
  const draftId = await fixture.attach(
    'certificate_draft',
    'Fictional Certificate draft',
    certificatePdf,
  );
  article = await openCase(manager);
  let release = article.getByRole('region', {
    name: releaseCopy('title'),
    exact: true,
  });
  const draft = release.getByRole('form', {
    name: releaseCopy('recordDraft'),
    exact: true,
  });
  await draft
    .getByLabel(releaseCopy('draftPdf'), { exact: true })
    .selectOption(draftId);
  await draft
    .getByLabel(releaseCopy('number'), { exact: true })
    .fill(certificateNumber);
  await draft
    .getByLabel(releaseCopy('draftDate'), { exact: true })
    .fill(fixture.today);
  await save(draft, releaseCopy('recordDraft'), '/certificate-draft');
  const opinion = release.getByRole('form', {
    name: releaseCopy('recordOpinion'),
    exact: true,
  });
  await opinion
    .getByLabel(releaseCopy('opinionDate'), { exact: true })
    .fill(fixture.today);
  await opinion
    .getByLabel(releaseCopy('outcome'), { exact: true })
    .selectOption('skipped');
  await opinion
    .getByLabel(releaseCopy('skipReason'), { exact: true })
    .selectOption('texts_already_agreed');
  await save(opinion, releaseCopy('recordOpinion'), '/client-opinion');
  const issuedId = await fixture.attach(
    'certificate',
    'Fictional issued Certificate',
    certificatePdf,
  );
  article = await openCase(approver);
  release = article.getByRole('region', {
    name: releaseCopy('title'),
    exact: true,
  });
  const draftApproval = release.getByRole('form', {
    name: releaseCopy('approve'),
    exact: true,
  });
  await expect(
    draftApproval.getByRole('checkbox', { checked: true }),
  ).toHaveCount(0);
  await draftApproval
    .getByLabel(releaseCopy('approvalDate'), { exact: true })
    .fill(fixture.today);
  for (const key of [
    'textsConfirmation',
    'numberConfirmation',
    'validityConfirmation',
    'independence',
  ] as const)
    await draftApproval
      .getByRole('checkbox', { name: releaseCopy(key), exact: true })
      .check();
  await save(
    draftApproval,
    releaseCopy('approve'),
    '/certificate-draft-approval',
  );
  const issue = release.getByRole('form', {
    name: copy('recordCertificate'),
    exact: true,
  });
  await issue
    .getByLabel(copy('certificateIssuedOn'), { exact: true })
    .fill(fixture.today);
  await selectOption(
    issue.getByLabel(copy('certificatePdf'), { exact: true }),
    { value: issuedId },
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
  await save(issue, copy('certificateSubmit'), '/certificate');
  await fixture.step(manager, `${fixture.base}/exchanges`, {
    direction: 'sent',
    itemKind: 'certificate',
    attachmentIds: [issuedId],
    counterpart: { kind: 'client', name: 'Fictional client representative' },
    businessDate: fixture.today,
    channel: 'courier',
    reference: null,
    note: null,
  });
  const final = await fixture.read(approver, fixture.base);
  expect(final).toMatchObject({
    status: 'certified',
    certificate: { number: certificateNumber },
  });
  article = await openCase(reader);
  await expect(article.getByRole('form')).toHaveCount(0);
  release = article.getByRole('region', {
    name: releaseCopy('title'),
    exact: true,
  });
  await release.screenshot({
    path: info.outputPath(`combined-certificate-release-${locale}.png`),
  });
  const registerDownload = page.waitForEvent('download');
  await article
    .getByRole('button', { name: copy('registerPdfDownload'), exact: true })
    .click();
  const registerPath = info.outputPath(
    `combined-dossier-register-${locale}.pdf`,
  );
  await (await registerDownload).saveAs(registerPath);
  const register = await readFile(registerPath);
  const registerText = compactPdfText(
    (await inspectCommercialPdf(new Uint8Array(register)))
      .map((entry) => entry.text)
      .join('\n'),
  );
  expect(registerText).toContain(certificateNumber);
  expect(registerText).toContain(compactPdfText('Lactis Demo SRL'));
  const nativeAttachment = records(
    (await fixture.read(manager, `${fixture.base}/documents`)).items,
  ).find((row) => row.id === fixture.source.attachmentId);
  expect(nativeAttachment).toMatchObject({
    documentId: fixture.source.documentId,
    versionId: fixture.source.documentVersionId,
    representationId: fixture.source.representationId,
  });
  const issuedAttachment = records(
    (await fixture.read(reader, `${fixture.base}/documents`)).items,
  ).find((row) => row.id === issuedId);
  if (!issuedAttachment)
    throw new Error('Missing exact issued Certificate attachment');
  const issuedBytes = await fixture.download(
    reader,
    `/documents/${text(issuedAttachment.documentId)}/versions/${text(issuedAttachment.versionId)}/content`,
  );
  expect(issuedBytes).toEqual(certificatePdf);
  await writeFile(
    info.outputPath(`combined-issued-certificate-${locale}.pdf`),
    issuedBytes,
  );

  const assignment = `/company-certification-reader-assignments/${membership}/${fixture.companyId}`;
  const revoked = await page.request.delete(
    `http://127.0.0.1:4174/api${assignment}`,
    { headers: { ...approver, 'idempotency-key': randomUUID() } },
  );
  expect(revoked.status()).toBe(200);
  const denials: Array<{ status: number; body: string }> = [];
  for (const path of [
    `${fixture.prefix}/runs/${runId}/context`,
    `${fixture.prefix}/runs/${randomUUID()}/context`,
  ]) {
    const denied = await page.request.get(`http://127.0.0.1:4174/api${path}`, {
      headers: fixture.headers(manager),
    });
    expect([403, 404]).toContain(denied.status());
    const body = await denied.text();
    expect(body).not.toContain('RO12345678');
    denials.push({ status: denied.status(), body });
  }
  expect(denials[0]).toEqual(denials[1]);
  analysis = await openAnalysis();
  await expect(
    analysis.getByRole('button', { name: words.context, exact: true }),
  ).toHaveCount(0);
  await expect(
    analysis.getByText('Cod fiscal: RO12345678', { exact: false }),
  ).toHaveCount(0);
  await fixture.command(approver, '/company-certification-reader-assignments', {
    companyId: fixture.companyId,
    workspaceMembershipId: membership,
  });
  const restored = await fixture.read(
    manager,
    `${fixture.prefix}/runs/${runId}/context`,
  );
  expect(JSON.stringify(restored)).toContain(fixture.source.documentVersionId);
  await writeFile(
    info.outputPath('combined-native-outcome.json'),
    JSON.stringify(
      {
        schema: 'prisma-prim-combined-audit-outcome/v1',
        locale,
        fixture: 'fictional',
        caseId: fixture.caseId,
        runId,
        freshRunId,
        exactSource: fixture.source,
        originalSha256: createHash('sha256').update(fixture.pdf).digest('hex'),
        supplementarySha256: createHash('sha256')
          .update(fixture.docx)
          .digest('hex'),
        registerSha256: createHash('sha256').update(register).digest('hex'),
        certificateSha256: createHash('sha256')
          .update(issuedBytes)
          .digest('hex'),
        certificateNumber,
        status: final.status,
        boundaries: [
          'local-demo identities',
          'synthetic malware scanner',
          'lost review receipt',
        ],
        modelCalls: 0,
        privatePilotQualified: false,
        productionQualified: false,
      },
      null,
      2,
    ),
  );
}
