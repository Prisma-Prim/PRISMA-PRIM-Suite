import { grantOf } from './access/company-grants';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  fireEvent,
  screen,
  waitFor,
  within,
} from './test/render-with-interface-locale';
import { appInterfaces, renderInInterface } from './test/app-interface';
import { selectOptionByLabel } from './test/select-option';
import { App } from './App';
import { deterministicBrowserIdentity } from './access-composition';
import {
  actor,
  clientId,
  companyId,
  installParentServer,
  project,
  projectId,
} from './test/mission-applicability-app-fixture';
import {
  FakeCertificationServer,
  certificationActor as workflowActor,
  certificationIds,
  CERTIFICATE_TEXTS,
  dossierReview,
  certificationDecision,
} from './certification/certification.test-fixture';
import {
  seedCapacityDiscrepancy,
  seedReportedCase,
} from './certification/certification-workflow.test-fixture';
import { caseProjectPdf } from './certification/case-project-pdf.test-fixture';

// The Certification screens read only the grants list.
const projectGrant = {
  bundle: 'company_project_access',
  assignmentId: grantOf(actor.activeCompany, 'company_project_access')
    ?.assignmentId,
  permissionSetVersion: 'v2',
  permissions: ['project.read', 'project.create', 'project.update'],
};
const reader = {
  bundle: 'company_certification_reader',
  assignmentId: 'certification-reader-grant',
  permissionSetVersion: 'v1',
  permissions: ['certification.read'],
};
const manager = {
  bundle: 'company_certification_programme_manager',
  assignmentId: 'certification-manager-grant',
  permissionSetVersion: 'v1',
  permissions: ['certification.programme.manage'],
};

function certificationActor(grants: 'none' | 'reader' | 'manager') {
  return {
    ...actor,
    activeCompany: {
      ...actor.activeCompany,
      grants: [
        projectGrant,
        ...(grants === 'none' ? [] : [reader]),
        ...(grants === 'manager' ? [manager] : []),
      ],
    },
  };
}

function serve(grants: 'none' | 'reader' | 'manager') {
  const current = () => certificationActor(grants);
  const server = new FakeCertificationServer({
    actor: current,
    projectId,
    companyId,
  });
  installParentServer(current, async (path, init, url) =>
    path.includes('certification') ? server.fetch(url.href, init) : undefined,
  );
  return server;
}

function serveWorkflow(
  options: Parameters<typeof workflowActor>[0],
  projectRequest?: Parameters<typeof installParentServer>[1],
) {
  const workflow = workflowActor(options);
  const current = () => ({
    ...actor,
    workspaceMembershipId: certificationIds.member,
    activeCompany: {
      ...workflow.activeCompany,
      ...actor.activeCompany,
      grants: [
        projectGrant,
        ...(workflow.activeCompany?.grants.filter(
          (grant) => grant.bundle !== 'company_project_access',
        ) ?? []),
        ...actor.activeCompany.grants.filter(
          (grant) => grant.bundle === 'company_mission_deliverable_access',
        ),
      ],
    },
  });
  const server = new FakeCertificationServer({
    actor: current,
    projectId,
    companyId,
  });
  installParentServer(current, async (path, init, url) =>
    path.includes('certification')
      ? server.fetch(url.href, init)
      : projectRequest?.(path, init, url),
  );
  return server;
}

async function openProject() {
  const projects = await screen.findByRole('region', { name: 'Projects' });
  fireEvent.click(
    await within(projects).findByRole('button', {
      name: new RegExp(project.title),
    }),
  );
  return screen.findByRole('tablist');
}

async function openCasePanel(reference: string) {
  const tabs = await openProject();
  fireEvent.click(within(tabs).getByRole('tab', { name: 'Certification' }));
  const panel = within(screen.getByRole('tabpanel', { name: 'Certification' }));
  fireEvent.click(await panel.findByRole('button', { name: reference }));
  await panel.findByRole('heading', {
    name: `Certification Case ${reference}`,
  });
  return panel;
}

function changeField(container: HTMLElement, label: string, value: string) {
  fireEvent.change(within(container).getByLabelText(label, { exact: true }), {
    target: { value },
  });
}

function clickButton(container: HTMLElement, name: string) {
  fireEvent.click(within(container).getByRole('button', { name }));
}

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  window.history.replaceState(null, '', '/#projects');
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  window.history.replaceState(null, '', '/');
});

describe.each(appInterfaces)(
  'Certification tab through the real App composition in the %s interface',
  (appInterface) => {
    it('is absent from the Project detail without the Certification Reader grant', async () => {
      const server = serve('none');
      renderInInterface(
        appInterface,
        <App identity={deterministicBrowserIdentity()} />,
      );
      const tabs = await openProject();
      expect(
        within(tabs).queryByRole('tab', { name: 'Certification' }),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole('region', { name: 'Certification' }),
      ).not.toBeInTheDocument();
      expect(server.requests).toEqual([]);
    });

    it('shows a reader the Cases by keyboard tab navigation without any mutation form', async () => {
      const server = serve('reader');
      const caseId = server.seed({
        orderReference: 'CERT-0001/01',
        application: true,
      });
      renderInInterface(
        appInterface,
        <App identity={deterministicBrowserIdentity()} />,
      );
      const tabs = await openProject();
      const certificationTab = within(tabs).getByRole('tab', {
        name: 'Certification',
      });
      expect(certificationTab).toHaveAttribute('aria-selected', 'false');
      const lastTab = within(tabs).getAllByRole('tab').at(-1);
      expect(lastTab).toBe(certificationTab);
      const firstTab = within(tabs).getAllByRole('tab')[0];
      if (!firstTab) throw new Error('Missing first Project tab.');
      firstTab.focus();
      fireEvent.keyDown(firstTab, { key: 'End' });
      await waitFor(() =>
        expect(certificationTab).toHaveAttribute('aria-selected', 'true'),
      );
      expect(certificationTab).toHaveFocus();
      const panel = screen.getByRole('tabpanel', { name: 'Certification' });
      expect(panel).toBeVisible();
      fireEvent.click(
        await within(panel).findByRole('button', { name: 'CERT-0001/01' }),
      );
      expect(
        await within(panel).findByRole('heading', {
          name: 'Certification Case CERT-0001/01',
        }),
      ).toBeVisible();
      expect(
        within(panel).getByText(
          'You can consult this Case. Recording a step requires Company Certification Programme Manager.',
        ),
      ).toBeVisible();
      for (const name of [
        'Open a Certification Case',
        'Correct the application',
        'Record the review',
        'Record the application',
      ])
        expect(
          within(panel).queryByRole('button', { name }),
        ).not.toBeInTheDocument();
      expect(within(panel).queryByRole('form')).not.toBeInTheDocument();
      expect(
        server.requests.filter((request) => request.method !== 'GET'),
      ).toEqual([]);
      expect(
        server.requests.find(
          (request) => request.path === `/api/certification-cases/${caseId}`,
        )?.company,
      ).toBe(companyId);

      fireEvent.keyDown(certificationTab, { key: 'ArrowRight' });
      await waitFor(() => expect(firstTab).toHaveFocus());
      expect(panel).not.toBeVisible();
    });

    it('offers a programme manager the Case opening form in the tab', async () => {
      serve('manager');
      renderInInterface(
        appInterface,
        <App identity={deterministicBrowserIdentity()} />,
      );
      const tabs = await openProject();
      fireEvent.click(within(tabs).getByRole('tab', { name: 'Certification' }));
      const panel = screen.getByRole('tabpanel', { name: 'Certification' });
      expect(
        await within(panel).findByText(
          'No Certification Case is open in this Project.',
        ),
      ).toBeVisible();
      fireEvent.click(
        within(panel).getByRole('button', {
          name: 'Open a Certification Case',
        }),
      );
      expect(
        await within(panel).findByRole('form', {
          name: 'Open a Certification Case',
        }),
      ).toBeVisible();
    });

    it('records a major Finding, verifies the response and opens its full history', async () => {
      const server = serveWorkflow({ manager: false, auditor: true });
      const reference = 'CERT-FINDING-TEST';
      seedReportedCase(server, {
        reference,
        leader: certificationIds.member,
      });
      renderInInterface(
        appInterface,
        <App identity={deterministicBrowserIdentity()} />,
      );
      const panel = await openCasePanel(reference);
      if (appInterface === 'clarte')
        fireEvent.click(panel.getByRole('button', { name: /Stage 2 audit/u }));
      const stage = within(
        await panel.findByRole('region', { name: 'Stage 2 Findings' }),
      );
      fireEvent.click(
        stage.getByRole('button', { name: 'Record a Stage 2 Finding' }),
      );

      async function submit(
        title: string,
        fields: Record<string, string>,
        options: string[],
        action: string,
      ) {
        const form = within(await panel.findByRole('form', { name: title }));
        for (const [label, value] of Object.entries(fields))
          fireEvent.change(form.getByLabelText(label), { target: { value } });
        for (const name of options) fireEvent.click(form.getByLabelText(name));
        fireEvent.click(form.getByRole('button', { name: action }));
        await waitFor(() =>
          expect(
            panel.queryByRole('form', { name: title }),
          ).not.toBeInTheDocument(),
        );
      }

      await submit(
        'Record a Stage 2 Finding',
        {
          'Requirement clause': '8.5.1',
          'Process or area': 'Receiving',
          Statement: 'Receiving records lack a second check.',
        },
        [
          'Major nonconformity',
          'Receiving records — version 1 (receiving-records.pdf)',
        ],
        'Record the Finding',
      );
      expect(
        await stage.findByRole('listitem', {
          name: 'Finding 1 — Major nonconformity',
        }),
      ).toBeVisible();
      const correction = 'Correct the statement of Finding 1';
      fireEvent.click(stage.getByRole('button', { name: correction }));
      await submit(
        correction,
        {
          Statement: 'Receiving records lack the required second check.',
          'Correction reason': 'Clarify the audit requirement.',
        },
        [],
        'Record the correction',
      );
      expect(
        stage
          .getAllByText('Receiving records lack the required second check.')
          .find((entry) => !entry.closest('details')),
      ).toBeVisible();
      if (appInterface === 'clarte')
        fireEvent.click(
          panel.getByRole('button', { name: /Nonconformity follow-up/u }),
        );
      const followUp = within(
        panel.getByRole('region', { name: 'Stage 2 Findings' }),
      );
      const response = 'Record the client’s response to Finding 1';
      fireEvent.click(followUp.getByRole('button', { name: response }));
      await submit(
        response,
        {
          Correction: 'Receiving records checked.',
          Cause: 'The second check was omitted from the instructions.',
          'Corrective action': 'Update instructions and train the team.',
          'Received on': '2026-11-23',
        },
        [],
        'Record the response',
      );
      const judgment = 'Judge the plan of Finding 1';
      fireEvent.click(followUp.getByRole('button', { name: judgment }));
      await submit(
        judgment,
        { 'Basis of the judgment': 'Instructions address the cause.' },
        ['Adequate'],
        'Record the judgment',
      );
      const verification = 'Verify the implementation of Finding 1';
      fireEvent.click(followUp.getByRole('button', { name: verification }));
      await submit(
        verification,
        {
          'Verified on': '2026-11-25',
          'Verification note':
            'Checked the new instructions and training record.',
        },
        ['Document review', 'Effective'],
        'Record the verification',
      );
      expect(followUp.getByText('Verified effective')).toBeVisible();
      const history = 'History of Finding 1';
      if (appInterface === 'clarte') {
        fireEvent.click(followUp.getByRole('button', { name: history }));
        const drawer = within(
          await screen.findByRole('dialog', { name: history }),
        );
        expect(
          drawer.getByText('Verification — Effective (version 1)'),
        ).toBeVisible();
        expect(
          drawer.getByText('Receiving records lack a second check.'),
        ).toBeVisible();
      } else {
        fireEvent.click(followUp.getByText(history));
        expect(
          followUp.getByText('Verification — Effective (version 1)'),
        ).toBeVisible();
      }
      expect(server.mutations()).toHaveLength(5);
    });

    it('lets the independent approver reclassify a Finding with a reason', async () => {
      const server = serveWorkflow({ manager: false, approver: true });
      const reference = 'CERT-RECLASSIFY-TEST';
      const { caseId, evidence } = seedReportedCase(server, {
        reference,
        leader: certificationIds.colleague,
      });
      server.recordFindingAsColleague(caseId, {
        stage: 'stage_2',
        classification: 'minor_nonconformity',
        statement: {
          clause: '8.5.1',
          area: 'Receiving',
          statement: 'Receiving checks have a gap.',
          evidenceAttachmentIds: [evidence],
        },
      });
      renderInInterface(
        appInterface,
        <App identity={deterministicBrowserIdentity()} />,
      );
      const panel = await openCasePanel(reference);
      if (appInterface === 'clarte')
        fireEvent.click(panel.getByRole('button', { name: /Stage 2 audit/u }));
      const findings = panel.getByRole('region', { name: 'Stage 2 Findings' });
      clickButton(findings, 'Reclassify Finding 1');
      const form = within(findings).getByRole('form', {
        name: 'Reclassify Finding 1',
      });
      fireEvent.click(
        within(form).getByRole('radio', { name: 'Major nonconformity' }),
      );
      changeField(
        form,
        'Reason for the new classification',
        'The gap is systemic.',
      );
      clickButton(form, 'Record the classification');
      expect(
        await within(findings).findByRole('listitem', {
          name: 'Finding 1 — Major nonconformity',
        }),
      ).toBeVisible();
      expect(server.mutations()[0]?.body).toMatchObject({
        classification: 'major_nonconformity',
        reason: 'The gap is systemic.',
      });
    });

    it('attaches an exact received PDF with a role and shows its fingerprint in the archive', async () => {
      const server = serveWorkflow({ manager: true, documents: true });
      const reference = 'CERT-ATTACH-TEST';
      const caseId = server.seed({ orderReference: reference });
      const source = server.addSource('Fictional inspection original');
      renderInInterface(
        appInterface,
        <App identity={deterministicBrowserIdentity()} />,
      );
      const panel = await openCasePanel(reference);
      if (appInterface === 'clarte')
        fireEvent.click(
          panel.getByRole('button', { name: 'Document archive' }),
        );
      const archive = await panel.findByRole('region', {
        name: 'Document archive',
      });
      clickButton(archive, 'Attach a document');
      const attach = await within(archive).findByRole('form', {
        name: 'Attach a document',
      });
      await waitFor(() =>
        expect(within(attach).getByLabelText('Received PDF')).toBeEnabled(),
      );
      selectOptionByLabel(
        within(attach).getByLabelText('Received PDF'),
        'Fictional inspection original — version 1',
      );
      selectOptionByLabel(
        within(attach).getByLabelText('Role'),
        'Certification agreement',
      );
      clickButton(attach, 'Attach the document');
      const download = await within(archive).findByRole('button', {
        name: 'Download Fictional inspection original — version 1',
      });
      expect(
        within(archive).getByText('Fictional inspection original — version 1'),
      ).toBeVisible();
      expect(
        within(archive).getByText('Certification agreement'),
      ).toBeVisible();
      expect(within(archive).getByText(source.sha256)).toBeInTheDocument();
      const clicked = vi
        .spyOn(HTMLAnchorElement.prototype, 'click')
        .mockImplementation(() => {});
      fireEvent.click(download);
      await waitFor(() => expect(clicked).toHaveBeenCalledTimes(1));
      expect(clicked.mock.instances[0]).toHaveAttribute(
        'download',
        'fictional-inspection-original.pdf',
      );
      expect(server.mutations().at(-1)).toMatchObject({
        path: `/api/certification-cases/${caseId}/documents`,
        body: {
          documentId: source.documentId,
          versionId: source.versionId,
          role: 'agreement',
        },
      });
      if (appInterface === 'clarte')
        expect(
          panel.getByRole('region', { name: 'Selected Project PDFs' }),
        ).toBeVisible();
    });

    it('views a mission deliverable and requests a ZIP for the selected exact Project PDF', async () => {
      const source = caseProjectPdf(companyId, clientId);
      const downloads: unknown[] = [];
      const server = serveWorkflow(
        { manager: true, documents: true },
        async (path, init) => {
          if (path === `/api/projects/${projectId}/documents`)
            return Response.json(source.listing);
          if (path === `/api/documents/${source.documentId}/versions`)
            return Response.json(source.versions);
          if (path === `/api/projects/${projectId}/pdf-bundle`) {
            downloads.push(JSON.parse(String(init?.body)));
            return new Response(new Uint8Array([80, 75, 3, 4, 1]), {
              headers: { 'content-type': 'application/zip' },
            });
          }
        },
      );
      const reference = 'CERT-PROJECT-PDF-TEST';
      server.seed({ orderReference: reference });
      renderInInterface(
        appInterface,
        <App identity={deterministicBrowserIdentity()} />,
      );
      const panel = await openCasePanel(reference);
      if (appInterface === 'clarte')
        fireEvent.click(
          panel.getByRole('button', { name: 'Document archive' }),
        );
      else
        fireEvent.click(screen.getByRole('tab', { name: 'Working Documents' }));
      expect(
        await screen.findByRole('heading', { name: source.title }),
      ).toBeVisible();
      const bundle = screen.getByRole('region', {
        name: 'Selected Project PDFs',
      });
      clickButton(bundle, 'Choose PDFs');
      fireEvent.click(
        await within(bundle).findByRole('button', {
          name: `Load PDF Versions — ${source.title}`,
        }),
      );
      fireEvent.click(
        await within(bundle).findByRole('button', {
          name: `Select ${source.title} — Version 1 — ${source.fileName}`,
        }),
      );
      const clicked = vi
        .spyOn(HTMLAnchorElement.prototype, 'click')
        .mockImplementation(() => {});
      clickButton(bundle, 'Download selected PDFs');
      await waitFor(() => expect(clicked).toHaveBeenCalledTimes(1));
      expect(clicked.mock.instances[0]).toHaveAttribute(
        'download',
        'selected-project-pdfs.zip',
      );
      expect(downloads).toEqual([
        {
          items: [
            {
              documentId: source.documentId,
              versionId: source.versionId,
              representationId: source.representationId,
              expectedProjectRevision: 1,
            },
          ],
        },
      ]);
    });

    it('filters and corrects an exchange while the other registers show deadlines and let a manager withdraw an item', async () => {
      const server = serveWorkflow({ manager: true });
      const reference = 'CERT-REGISTERS-TEST';
      const { caseId, evidence } = seedReportedCase(server, {
        reference,
        leader: certificationIds.colleague,
      });
      server.recordFindingAsColleague(caseId, {
        stage: 'stage_2',
        classification: 'major_nonconformity',
        statement: {
          clause: '8.5.1',
          area: 'Receiving',
          statement: 'A required approval is missing.',
          evidenceAttachmentIds: [evidence],
        },
      });
      seedCapacityDiscrepancy(server, caseId);
      server.seedDeadlineSet({
        stage_plan_sent: 10,
        audit_dossier_transmitted: 20,
        stage_2_report_released: 0,
      });
      server.seedDeadlineStates(caseId, [
        {
          kind: 'audit_dossier_transmitted',
          stage: null,
          direction: 'after',
          days: 20,
          anchor: '2026-10-01',
          dueDate: '2026-10-21',
          state: 'overdue',
          record: null,
        },
      ]);
      renderInInterface(
        appInterface,
        <App identity={deterministicBrowserIdentity()} />,
      );
      const panel = await openCasePanel(reference);
      const openRegister = (name: string) => {
        if (appInterface === 'clarte')
          fireEvent.click(panel.getByRole('button', { name }));
      };
      const exchangesRegion = () =>
        panel.getByRole('region', {
          name:
            appInterface === 'clarte'
              ? 'Exchange register'
              : /Exchanges and deadlines/u,
        });
      openRegister('Exchange register');
      const exchanges = exchangesRegion();
      clickButton(exchanges, 'Record an exchange');
      const record = within(exchanges).getByRole('form', {
        name: 'New Exchange Record',
      });
      for (const [label, value] of [
        ['Direction', 'Sent'],
        ['Item kind', 'Stage plan'],
        ['Counterpart kind', 'Client'],
        ['Channel', 'E-mail'],
      ])
        selectOptionByLabel(within(record).getByLabelText(label), value);
      fireEvent.click(
        within(record).getByRole('checkbox', {
          name: 'First audit plan, version 1',
        }),
      );
      changeField(record, 'Counterpart name', 'Fictional quality contact');
      changeField(record, 'Date of the exchange', '2026-11-06');
      clickButton(record, 'Record the exchange');
      const entry = await within(exchanges).findByRole('listitem', {
        name: 'Exchange Record 1 — Sent — Stage plan',
      });
      const filters = within(exchanges).getByRole('group', {
        name: 'Filter the register',
      });
      selectOptionByLabel(
        within(filters).getByLabelText('Direction'),
        'Received',
      );
      expect(entry).not.toBeInTheDocument();
      selectOptionByLabel(within(filters).getByLabelText('Direction'), 'Sent');
      selectOptionByLabel(within(filters).getByLabelText('Item kind'), 'Other');
      expect(
        within(exchanges).queryByRole('listitem', {
          name: 'Exchange Record 1 — Sent — Stage plan',
        }),
      ).not.toBeInTheDocument();
      selectOptionByLabel(
        within(filters).getByLabelText('Item kind'),
        'Stage plan',
      );
      clickButton(
        within(exchanges).getByRole('listitem', {
          name: 'Exchange Record 1 — Sent — Stage plan',
        }),
        'Correct Exchange Record 1',
      );
      const correction = within(exchanges).getByRole('form', {
        name: 'Correction of Exchange Record 1',
      });
      changeField(correction, 'Reference (optional)', 'TEST-52');
      changeField(
        correction,
        'Reason for the correction',
        'Record the exact message reference.',
      );
      clickButton(correction, 'Record the correction');
      expect(
        await within(exchanges).findByText('TEST-52', { exact: true }),
      ).toBeVisible();

      openRegister('Procedure deadlines');
      expect(panel.getByText(/Response to Finding 1 due on/u)).toBeVisible();
      expect(panel.getByText('Due date: 2026-10-21')).toBeVisible();
      openRegister('Re-verification Items');
      const items =
        appInterface === 'clarte'
          ? panel.getByRole('region', { name: 'Re-verification Items' })
          : exchangesRegion();
      clickButton(items, 'Add an item to re-verify');
      const add = within(items).getByRole('form', {
        name: 'Item to re-verify',
      });
      changeField(
        add,
        'What to verify',
        'Review the updated receiving instructions.',
      );
      selectOptionByLabel(
        within(add).getByLabelText('Source (optional)'),
        'Receiving records, version 1',
      );
      clickButton(add, 'Add the item');
      const item = await within(items).findByRole('listitem', {
        name: /^Item 1: Review/u,
      });
      expect(item).toHaveTextContent('Source: Receiving records, version 1');
      clickButton(item, 'Withdraw item 1');
      const withdrawal = within(item).getByRole('form', {
        name: 'Withdrawal of item 1',
      });
      changeField(
        withdrawal,
        'Reason for the withdrawal',
        'Already covered by the next audit.',
      );
      clickButton(withdrawal, 'Record the withdrawal');
      expect(
        await within(items).findByText(
          /^Withdrawn by .*Already covered by the next audit/u,
        ),
      ).toBeVisible();

      openRegister('Dossier consistency');
      const consistency = panel.getByRole('region', {
        name: 'Dossier consistency',
      });
      const discrepancy = within(consistency).getByRole('listitem', {
        name: /^R04 — /u,
      });
      clickButton(discrepancy, 'Accept this Discrepancy');
      const accept = within(discrepancy).getByRole('form', {
        name: 'Accept the Discrepancy',
      });
      changeField(
        accept,
        'Reason',
        'The reported audit schedule explains the difference.',
      );
      clickButton(accept, 'Record the acceptance');
      expect(
        await within(consistency).findByRole('heading', {
          name: 'Resolved Discrepancies',
        }),
      ).toBeVisible();
    });

    it('loads the earlier exchange page within the selected direction and kind', async () => {
      const server = serveWorkflow({ manager: false });
      const reference = 'CERT-EXCHANGE-PAGES-TEST';
      const { caseId, evidence } = seedReportedCase(server, {
        reference,
        leader: certificationIds.colleague,
      });
      for (let sequence = 1; sequence <= 201; sequence += 1)
        server.seedExchangeRecord(caseId, sequence, [
          {
            id: `fictional-exchange-${sequence}`,
            sequence,
            version: 1,
            caseRevision: 15,
            direction: sequence === 1 ? 'sent' : 'received',
            itemKind: 'other',
            counterpart: { kind: 'client', name: 'Fictional quality contact' },
            businessDate: '2026-10-29',
            channel: 'email',
            reference: `PAGE-${sequence}`,
            note: null,
            reason: null,
            attachmentIds: [evidence],
            recordedBy: {
              workspaceMembershipId: certificationIds.colleague,
              displayName: 'Programme Manager Demo',
            },
            recordedAt: '2026-10-30T12:00:00.000Z',
          },
        ]);
      renderInInterface(
        appInterface,
        <App identity={deterministicBrowserIdentity()} />,
      );
      const panel = await openCasePanel(reference);
      if (appInterface === 'clarte')
        fireEvent.click(
          panel.getByRole('button', { name: 'Exchange register' }),
        );
      const exchanges = panel.getByRole('region', {
        name:
          appInterface === 'clarte'
            ? 'Exchange register'
            : 'Exchanges and deadlines',
      });
      const filters = within(exchanges).getByRole('group', {
        name: 'Filter the register',
      });
      selectOptionByLabel(within(filters).getByLabelText('Direction'), 'Sent');
      selectOptionByLabel(within(filters).getByLabelText('Item kind'), 'Other');
      expect(
        within(exchanges).queryByText('PAGE-1', { exact: true }),
      ).not.toBeInTheDocument();
      clickButton(exchanges, 'Load earlier exchanges');
      expect(
        await within(exchanges).findByText('PAGE-1', { exact: true }),
      ).toBeVisible();
      expect(
        within(exchanges).queryByText('PAGE-201', { exact: true }),
      ).not.toBeInTheDocument();
    });

    it('shows the itemized review and corrects the agreed data and decision texts after issuance', async () => {
      const server = serveWorkflow({ manager: true, approver: true });
      const reference = 'CERT-DECISION-TEST';
      const { caseId } = seedReportedCase(server, {
        reference,
        leader: certificationIds.colleague,
      });
      server.recordStepAsColleague(caseId, 'recommendation', {
        recommendation: 'grant',
        basis: 'The audit evidence supports certification.',
      });
      const agreementAttachmentId = server.attachAsColleague(
        caseId,
        server.addSource('Signed data'),
        'certificate_data',
      );
      server.recordStepAsColleague(caseId, 'certificate_data', {
        texts: CERTIFICATE_TEXTS,
        agreedOn: '2026-11-05',
        agreementAttachmentId,
      });
      server.recordStepAsColleague(caseId, 'dossier_review', dossierReview());
      server.recordStepAsColleague(caseId, 'decision', certificationDecision());
      const attachmentId = server.attachAsColleague(
        caseId,
        server.addSource('Issued Certificate'),
        'certificate',
      );
      server.recordCertificateAsColleague(caseId, {
        number: 'DEMO-1539-ISSUED',
        attachmentId,
      });
      renderInInterface(
        appInterface,
        <App identity={deterministicBrowserIdentity()} />,
      );
      const panel = await openCasePanel(reference);
      if (appInterface === 'clarte')
        fireEvent.click(panel.getByRole('button', { name: /Dossier review/u }));
      const review = panel.getByRole('region', {
        name: 'Dossier review',
      });
      expect(
        within(review).getByText('Complete — no item missing'),
      ).toBeVisible();
      if (appInterface === 'clarte') {
        expect(
          within(review).getByRole('row', {
            name: /Stage 2 audit report Present/u,
          }),
        ).toBeVisible();
      }
      if (appInterface === 'clarte')
        fireEvent.click(
          panel.getByRole('button', { name: /^Certificate data/u }),
        );
      const data = panel.getByRole('region', {
        name: 'Certificate data agreed with the client',
      });
      clickButton(data, 'Correct the Certificate data');
      const correction = within(data).getByRole('form', {
        name: 'Correct the Certificate data',
      });
      const correctedScope =
        'Production and packing of pasteurised milk (example)';
      changeField(
        within(correction).getByRole('group', { name: 'Certificate text 2' }),
        'Scope',
        correctedScope,
      );
      changeField(
        correction,
        'Correction reason',
        'Record the client’s confirmed wording.',
      );
      clickButton(correction, 'Record the Certificate data');
      await waitFor(() =>
        expect(
          within(data).queryByRole('form', {
            name: 'Correct the Certificate data',
          }),
        ).not.toBeInTheDocument(),
      );
      expect(within(data).getByText(correctedScope)).toBeVisible();

      if (appInterface === 'clarte')
        fireEvent.click(
          panel.getByRole('button', { name: /Certification Decision/u }),
        );
      const decision = panel.getByRole('region', {
        name: 'Certification Decision',
      });
      expect(
        within(decision).getByText(CERTIFICATE_TEXTS[1].holderName),
      ).toBeVisible();
      clickButton(decision, 'Correct the decision texts');
      const texts = within(decision).getByRole('form', { name: /Correct/u });
      expect(
        within(texts).queryByLabelText('Decision date'),
      ).not.toBeInTheDocument();
      changeField(
        within(texts).getByRole('group', { name: 'Certificate text 2' }),
        'Scope',
        correctedScope,
      );
      changeField(
        texts,
        'Correction reason',
        'Apply the confirmed certificate wording.',
      );
      fireEvent.click(
        within(texts).getByRole('checkbox', {
          name: 'I attest that the decision maker is not a member of the audit team.',
        }),
      );
      clickButton(texts, 'Record the correction');
      await waitFor(() =>
        expect(
          within(decision).queryByRole('form', { name: /Correct/u }),
        ).not.toBeInTheDocument(),
      );
      expect(within(decision).getByText(correctedScope)).toBeVisible();
      expect(
        server.mutations().map(({ path }) => path.split('/').at(-1)),
      ).toEqual(['certificate-data', 'decision']);
    });
  },
);

describe('Certification Case page in the Clarté interface', () => {
  it('opens a Case of the Project on its page with the ordered steps and their status', async () => {
    const server = serve('manager');
    server.seed({ orderReference: 'CERT-0002/01', accepted: true });
    renderInInterface(
      'clarte',
      <App identity={deterministicBrowserIdentity()} />,
    );
    const tabs = await openProject();
    fireEvent.click(within(tabs).getByRole('tab', { name: 'Certification' }));
    const panel = screen.getByRole('tabpanel', { name: 'Certification' });
    fireEvent.click(
      await within(panel).findByRole('button', { name: 'CERT-0002/01' }),
    );
    expect(
      await within(panel).findByRole('heading', {
        name: 'Certification Case CERT-0002/01',
      }),
    ).toBeVisible();
    // The header names the Client legal entity, the standard and the Project.
    expect(
      within(panel).getByText(
        `Lactis Demo SRL · ISO 22000:2018 · Initial certification · Project: ${project.title}`,
      ),
    ).toBeVisible();
    const steps = within(
      within(panel).getByRole('navigation', {
        name: 'Steps of the Certification Case',
      }),
    ).getByRole('list', { name: 'Steps' });
    const items = within(steps).getAllByRole('button');
    expect(items).toHaveLength(13);
    expect(items.map((item) => item.textContent)).toEqual([
      expect.stringMatching(/^Application[^ ].*Done$/u),
      expect.stringMatching(/^Application review.*Done$/u),
      expect.stringMatching(/^3Audit duration.*Current step$/u),
      ...items.slice(3).map(() => expect.stringMatching(/Upcoming$/u)),
    ]);
    // Only the current step is open: the duration inputs, not the application.
    expect(
      within(panel).getByRole('form', { name: 'Duration inputs' }),
    ).toBeVisible();
    expect(
      within(panel).queryByRole('region', { name: 'Application' }),
    ).not.toBeInTheDocument();
  });
});
