import { expect, test, type Locator, type Page } from '@playwright/test';
import {
  CERTIFICATE_TEXTS,
  FakeCertificationServer,
  certificationActor,
  certificationIds,
} from '../src/certification/certification-fake-server';
import {
  dossierReviewItems,
  seedCapacityDiscrepancy,
  seedReportedCase,
} from '../src/certification/certification-workflow.test-fixture';
import {
  preparatoryLifecycle,
  unassignedResponsibility,
} from './actor-context.fixture';
import { isPhoneLayout, openClarte } from './clarte.fixture';
import { selectOption } from './select-option';

const reference = 'CERT-SYNTHETIC-1539';
test.use({ actionTimeout: 15_000 });
const project = {
  id: certificationIds.project,
  companyId: certificationIds.company,
  clientAccountId: certificationIds.client,
  clientDisplayName: 'Fictional Dairy',
  title: 'Fictional dairy audit',
  status: 'preparatory',
  createdAt: '2026-11-02T08:00:00.000Z',
};

async function serve(page: Page) {
  const auditor = certificationActor({ manager: false, auditor: true });
  const independent = {
    ...certificationActor({ manager: true, approver: true, documents: true }),
    workspaceMembershipId: certificationIds.colleague,
    displayName: 'Independent Approver Demo',
  };
  let actor = auditor;
  const server = new FakeCertificationServer({
    actor: () => actor,
    member: () => ({
      workspaceMembershipId: actor.workspaceMembershipId,
      displayName: actor.displayName,
    }),
  });
  const { caseId } = seedReportedCase(server, {
    reference,
    leader: certificationIds.member,
  });
  const dataForm = server.attachAsColleague(
    caseId,
    server.addSource('Certificate agreement'),
    'certificate_data',
  );
  const decisionForm = server.attachAsColleague(
    caseId,
    server.addSource('Signed decision'),
    'decision_form',
  );
  const draft = server.attachAsColleague(
    caseId,
    server.addSource('Draft proof'),
    'certificate_draft',
  );
  const updatedDraft = server.attachAsColleague(
    caseId,
    server.addSource('Updated draft proof'),
    'certificate_draft',
  );
  const issued = server.attachAsColleague(
    caseId,
    server.addSource('Issued proof'),
    'certificate',
  );
  const revision = server.attachAsColleague(
    caseId,
    server.addSource('Corrected proof'),
    'certificate',
  );
  seedCapacityDiscrepancy(server, caseId);
  await page.route(
    (url) => url.pathname.startsWith('/api/'),
    async (route) => {
      const request = route.request();
      const url = new URL(request.url());
      const path = url.pathname;
      const json = (value: unknown) => route.fulfill({ json: value });
      if (
        path.includes('certification') ||
        path === '/api/access/current-actor'
      ) {
        const body = request.postData();
        const reply = await server.fetch(url.href, {
          method: request.method(),
          headers: request.headers(),
          ...(body === null ? {} : { body }),
        });
        return route.fulfill({
          status: reply.status,
          headers: Object.fromEntries(reply.headers),
          body: Buffer.from(await reply.arrayBuffer()),
        });
      }
      if (path === '/api/companies')
        return json([
          {
            id: project.companyId,
            displayName: 'Synthetic Certification Body',
          },
        ]);
      if (path === '/api/activity-log') return json({ events: [] });
      if (path === '/api/operational-home')
        return json({
          companyId: project.companyId,
          today: '2026-11-28',
          summaries: [],
        });
      if (path === '/api/clients')
        return json([
          {
            id: project.clientAccountId,
            displayName: project.clientDisplayName,
            relatedToActiveCompany: true,
          },
        ]);
      if (path === '/api/client-duplicate-reviews')
        return json({ items: [], next_cursor: null });
      if (path === '/api/assigned-tasks') return json([]);
      if (path === '/api/projects') return json([project]);
      if (path === `/api/projects/${project.id}`) return json(project);
      if (path.endsWith('/lifecycle')) return json(preparatoryLifecycle);
      if (path.endsWith('/responsible')) return json(unassignedResponsibility);
      if (path.endsWith('/tasks')) return json({ mutable: true, tasks: [] });
      if (path.endsWith('/eligible-task-assignees'))
        return json({ members: [] });
      if (path === `/api/projects/${project.id}/documents`)
        return json({ mutable: false, documents: [] });
      return route.fulfill({ status: 404, json: {} });
    },
  );
  return {
    dataForm,
    decisionForm,
    draft,
    updatedDraft,
    issued,
    revision,
    becomeApprover: () => {
      actor = independent;
    },
  };
}

async function openCase(page: Page) {
  await openClarte(page, '/#projects');
  await page
    .getByRole('region', { name: 'Projects' })
    .getByRole('button', { name: new RegExp(project.title, 'u') })
    .click();
  await page.getByRole('tab', { name: 'Certification', exact: true }).click();
  const panel = page.getByRole('tabpanel', { name: 'Certification' });
  await panel.getByRole('button', { name: reference, exact: true }).click();
  const casePage = panel.getByRole('article', {
    name: `Certification Case ${reference}`,
  });
  await expect(casePage).toBeVisible();
  return casePage;
}

async function show(casePage: Locator, label: RegExp | string) {
  await casePage
    .getByRole('navigation', { name: 'Steps of the Certification Case' })
    .getByRole('button', { name: label, exact: typeof label === 'string' })
    .click();
}

async function screenshot(page: Page, name: string, top: Locator) {
  await top.evaluate((element) => {
    element.scrollIntoView({ block: 'start' });
    if (element.getAttribute('role') !== 'dialog') window.scrollBy(0, -88);
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: test
      .info()
      .outputPath(`${name}-${isPhoneLayout(page) ? 390 : 1440}.png`),
  });
}

async function fill(form: Locator, values: Record<string, string>) {
  for (const [label, value] of Object.entries(values))
    await form.getByLabel(label, { exact: true }).fill(value);
}

function choose(form: Locator, label: string, value: string) {
  return selectOption(
    form.getByRole('combobox', { name: label, exact: true }),
    value,
  );
}

async function submit(form: Locator, label: string) {
  await form.getByRole('button', { name: label, exact: true }).click();
}

test('follows a major Finding through certification and records the Case registers', async ({
  page,
}) => {
  test.setTimeout(180_000);
  const proof = await serve(page);
  let casePage = await openCase(page);

  await test.step('Record the major Finding and verify it', async () => {
    await show(casePage, /Stage 2 audit/u);
    await casePage
      .getByRole('button', { name: 'Record a Stage 2 Finding' })
      .click();
    const record = page.getByRole('form', { name: 'Record a Stage 2 Finding' });
    await record
      .getByRole('radio', { name: 'Major nonconformity', exact: true })
      .check();
    await fill(record, {
      'Requirement clause': '8.5.1',
      'Process or area': 'Receiving',
      Statement: 'Receiving records lack the required approval.',
    });
    await record.getByRole('checkbox', { name: /Receiving records/u }).check();
    await submit(record, 'Record the Finding');
    await expect(
      casePage.getByRole('listitem', {
        name: 'Finding 1 — Major nonconformity',
      }),
    ).toBeVisible();
    await screenshot(
      page,
      'stage-two-findings',
      casePage.getByRole('region', { name: 'Stage 2 Findings' }),
    );
    await show(casePage, /Nonconformity follow-up/u);
    const followUp = casePage.getByRole('region', { name: 'Stage 2 Findings' });
    const responseTitle = 'Record the client’s response to Finding 1';
    await followUp.getByRole('button', { name: responseTitle }).click();
    const response = page.getByRole('form', { name: responseTitle });
    await fill(response, {
      Correction: 'Receiving records checked.',
      Cause: 'The instruction omitted the approval.',
      'Corrective action': 'Publish revised instructions and train staff.',
      'Received on': '2026-11-23',
    });
    await submit(response, 'Record the response');
    const judgmentTitle = 'Judge the plan of Finding 1';
    await followUp.getByRole('button', { name: judgmentTitle }).click();
    const judgment = page.getByRole('form', { name: judgmentTitle });
    await judgment
      .getByRole('radio', { name: 'Adequate', exact: true })
      .check();
    await fill(judgment, {
      'Basis of the judgment': 'The training addresses the cause.',
    });
    await submit(judgment, 'Record the judgment');
    const verificationTitle = 'Verify the implementation of Finding 1';
    await followUp.getByRole('button', { name: verificationTitle }).click();
    const verification = page.getByRole('form', { name: verificationTitle });
    await fill(verification, {
      'Verified on': '2026-11-25',
      'Verification note': 'Verified the revised records and the training log.',
    });
    await verification
      .getByRole('radio', { name: 'Document review', exact: true })
      .check();
    await verification
      .getByRole('radio', { name: 'Effective', exact: true })
      .check();
    await submit(verification, 'Record the verification');
    await expect(
      followUp.getByText('Verified effective', { exact: true }),
    ).toBeVisible();
    await followUp
      .getByRole('button', { name: 'History of Finding 1' })
      .click();
    const history = page.getByRole('dialog', { name: 'History of Finding 1' });
    await expect(
      history.getByText('Verification — Effective (version 1)'),
    ).toBeVisible();
    await screenshot(page, 'finding-history', history);
    await history.getByRole('button', { name: 'Close', exact: true }).click();
    await show(casePage, /Team recommendation/u);
    const recommendation = casePage.getByRole('form', {
      name: 'Record the team recommendation',
    });
    await recommendation
      .getByRole('radio', { name: 'Grant certification', exact: true })
      .check();
    await fill(recommendation, {
      'Basis of the recommendation':
        'The audit team verified the corrective action.',
    });
    await submit(recommendation, 'Record the recommendation');
    await expect(
      casePage.getByText('The audit team verified the corrective action.', {
        exact: true,
      }),
    ).toBeVisible();
    const correctionTitle = 'Correct the team recommendation';
    await casePage.getByRole('button', { name: correctionTitle }).click();
    const correction = casePage.getByRole('form', { name: correctionTitle });
    await fill(correction, {
      'Basis of the recommendation':
        'Verification and the updated receiving records support the grant.',
      'Correction reason': 'Cite the revised records explicitly.',
    });
    await submit(correction, 'Record the recommendation');
    await expect(
      casePage.getByText(
        'Verification and the updated receiving records support the grant.',
        { exact: true },
      ),
    ).toBeVisible();
    await screenshot(
      page,
      'recommendation',
      casePage.getByRole('region', {
        name: 'Team recommendation',
        exact: true,
      }),
    );
  });

  proof.becomeApprover();
  casePage = await openCase(page);

  await test.step('Agree the Certificate data, review the dossier and decide', async () => {
    await show(casePage, /Certificate data/u);
    const data = casePage.getByRole('form', {
      name: 'Record the Certificate data',
    });
    for (const [index, text] of CERTIFICATE_TEXTS.entries()) {
      if (index > 0)
        await data
          .getByRole('button', { name: 'Add a Certificate language' })
          .click();
      await fill(
        data.getByRole('group', { name: `Certificate text ${index + 1}` }),
        {
          Language: text.language,
          'Holder name': text.holderName,
          Address: text.address,
          Scope: text.scope,
        },
      );
    }
    await fill(data, { 'Agreed on': '2026-11-05' });
    await choose(data, 'Signed Certificate data form', proof.dataForm);
    await submit(data, 'Record the Certificate data');
    await expect(
      casePage.getByRole('button', { name: 'Correct the Certificate data' }),
    ).toBeVisible();
    await screenshot(
      page,
      'certificate-data',
      casePage.getByRole('table', { name: 'Certificate texts agreed' }),
    );

    await show(casePage, /Dossier review/u);
    const review = casePage.getByRole('form', {
      name: 'Record the dossier review',
    });
    for (const name of dossierReviewItems)
      await review
        .getByRole('group', { name, exact: true })
        .getByRole('radio', { name: 'Present', exact: true })
        .check();
    await fill(review, {
      'Conclusion of the review': 'The Case supports the team recommendation.',
    });
    await review.getByRole('checkbox', { name: /I attest/u }).check();
    await submit(review, 'Record the review');
    const reviewTable = casePage.getByRole('table', { name: 'Dossier review' });
    await expect(
      reviewTable.getByRole('row', { name: /Stage 2 audit report Present/u }),
    ).toBeVisible();
    await screenshot(page, 'dossier-review', reviewTable);

    await show(casePage, /Certification Decision/u);
    const decision = casePage.getByRole('form', {
      name: 'Record the Certification Decision',
    });
    await decision
      .getByRole('radio', { name: 'Certification granted', exact: true })
      .check();
    await fill(decision, {
      'Decision date': '2026-11-06',
      'Decision maker': 'Independent Approver Demo',
      'Function of the decision maker': 'Certification lead',
      Rationale: 'Audit and review records support the grant.',
    });
    await choose(decision, 'Signed decision form', proof.decisionForm);
    await decision.getByRole('checkbox', { name: /I attest/u }).check();
    await submit(decision, 'Record the decision');
    const granted = casePage.getByRole('table', {
      name: 'Certificate texts granted',
    });
    await expect(
      granted.getByText(CERTIFICATE_TEXTS[0].holderName, { exact: true }),
    ).toBeVisible();
    await screenshot(page, 'certification-decision', granted);
  });

  await test.step('Release and revise the issued Certificate', async () => {
    await show(casePage, /^\d*Certificate\b(?! data)/u);
    const draft = casePage.getByRole('form', {
      name: 'Record a Certificate draft',
    });
    await draft
      .getByLabel('Certificate draft PDF', { exact: true })
      .selectOption(proof.draft);
    await fill(draft, {
      'Certificate number shown on the draft': 'DEMO-1539',
      'Draft date': '2026-11-06',
    });
    await submit(draft, 'Record a Certificate draft');
    const release = casePage.getByRole('region', {
      name: 'Certificate release',
    });
    await expect(
      release.getByRole('paragraph').filter({
        hasText: /^Draft proof — version 1 \(draft-proof\.pdf\)$/u,
      }),
    ).toBeVisible();
    await draft
      .getByLabel('Certificate draft PDF', { exact: true })
      .selectOption(proof.updatedDraft);
    await fill(draft, {
      'Certificate number shown on the draft': 'DEMO-1539',
      'Draft date': '2026-11-06',
      'Reason for the new version': 'Use the corrected draft PDF for release.',
    });
    await submit(draft, 'Record a Certificate draft');
    await expect(
      release.getByRole('paragraph').filter({
        hasText:
          /^Updated draft proof — version 1 \(updated-draft-proof\.pdf\)$/u,
      }),
    ).toBeVisible();
    const opinion = casePage.getByRole('form', {
      name: 'Record the client opinion or skip',
    });
    await fill(opinion, { 'Opinion or skip date': '2026-11-06' });
    await opinion
      .getByLabel('Client opinion outcome', { exact: true })
      .selectOption('skipped');
    await opinion
      .getByLabel('Reason for skipping the opinion', { exact: true })
      .selectOption('texts_already_agreed');
    await submit(opinion, 'Record the client opinion or skip');
    const approval = casePage.getByRole('form', {
      name: 'Approve the Certificate draft',
    });
    await fill(approval, { 'Draft approval date': '2026-11-06' });
    for (const confirmation of (
      await approval.getByRole('checkbox').all()
    ).slice(0, 4))
      await confirmation.check();
    await submit(approval, 'Approve the Certificate draft');
    const issue = casePage.getByRole('form', {
      name: 'Record the issued Certificate',
    });
    await expect(
      issue.getByLabel('Certificate number', { exact: true }),
    ).toHaveValue('DEMO-1539');
    await fill(issue, {
      'Issue date': '2026-11-06',
      'Signed by': 'Independent Approver Demo',
      'Function of the signatory': 'Certification lead',
    });
    await choose(issue, 'Certificate PDF', proof.issued);
    await issue.getByRole('checkbox', { name: /I attest/u }).check();
    await submit(issue, 'Record the Certificate');
    const revisions = casePage.getByRole('region', {
      name: 'Certificate revisions',
    });
    await expect(
      revisions.getByRole('heading', { name: 'Issuance 0 — Current' }),
    ).toBeVisible();
    const revision = revisions.getByRole('form', {
      name: 'Record a Certificate revision',
    });
    await fill(revision, {
      'Revision date': '2026-11-07',
      'Revision reason': 'Correct the presentation of the recorded address.',
    });
    await choose(revision, 'Corrected Certificate PDF', proof.revision);
    await revision
      .getByRole('radio', { name: 'No, not marked', exact: true })
      .check();
    await revision.getByRole('checkbox', { name: /I attest/u }).check();
    await submit(revision, 'Record the revision');
    await expect(
      revisions.getByRole('heading', { name: 'Revision 1 — Current' }),
    ).toBeVisible();
    const downloaded = page.waitForEvent('download');
    await revisions
      .getByRole('button', { name: 'Open PDF for revision 1' })
      .click();
    expect((await downloaded).suggestedFilename()).toBe('corrected-proof.pdf');
    await screenshot(page, 'certificate-release', release);
  });

  await test.step('Open the registers and record an exchange and a follow-up item', async () => {
    await show(casePage, 'Document archive');
    const attachments = casePage.getByRole('table', {
      name: 'Document archive',
    });
    await expect(
      attachments.getByRole('row', { name: /Receiving records/u }),
    ).toBeVisible();
    await expect(
      casePage.getByRole('region', { name: 'Selected Project PDFs' }),
    ).toBeVisible();
    await screenshot(page, 'document-archive', attachments);

    await show(casePage, 'Procedure deadlines');
    const deadlines = casePage.getByRole('region', {
      name: 'Procedure deadlines',
    });
    await expect(
      deadlines.getByText(/Response to Finding 1 due on/u),
    ).toBeVisible();
    await screenshot(page, 'procedure-deadlines', deadlines);

    await show(casePage, 'Exchange register');
    const exchanges = casePage.getByRole('region', {
      name: 'Exchange register',
    });
    await exchanges.getByRole('button', { name: 'Record an exchange' }).click();
    const exchange = exchanges.getByRole('form', {
      name: 'New Exchange Record',
    });
    await choose(exchange, 'Direction', 'received');
    await choose(exchange, 'Item kind', 'other');
    await exchange
      .getByRole('checkbox', { name: /Receiving records/u })
      .check();
    await choose(exchange, 'Counterpart kind', 'client');
    await fill(exchange, {
      'Counterpart name': 'Fictional quality manager',
      'Date of the exchange': '2026-11-07',
      'Reference (optional)': 'DEMO-SOURCE-1',
    });
    await choose(exchange, 'Channel', 'email');
    await submit(exchange, 'Record the exchange');
    const recorded = exchanges.getByRole('listitem', {
      name: /Exchange Record 1 — Received/u,
    });
    await expect(
      recorded.getByText('DEMO-SOURCE-1', { exact: true }),
    ).toBeVisible();
    await screenshot(page, 'exchange-register', exchanges);

    await show(casePage, 'Re-verification Items');
    const items = casePage.getByRole('region', {
      name: 'Re-verification Items',
    });
    await items
      .getByRole('button', { name: 'Add an item to re-verify' })
      .click();
    const item = items.getByRole('form', { name: 'Item to re-verify' });
    await fill(item, {
      'What to verify': 'Review the next quarter of receiving records.',
    });
    await submit(item, 'Add the item');
    await expect(
      items.getByRole('listitem', { name: /Item 1: Review the next quarter/u }),
    ).toBeVisible();
    await screenshot(page, 'reverification-items', items);

    await show(casePage, 'Dossier consistency');
    const consistency = casePage.getByRole('region', {
      name: 'Dossier consistency',
    });
    await expect(consistency.getByText(/R04/u)).toBeVisible();
    await screenshot(page, 'dossier-consistency', consistency);
  });
});
