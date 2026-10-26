import {
  act,
  fireEvent,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { render } from '../test/render-with-interface-locale';
import { selectOption } from '../test/select-option';
import { deterministicBrowserIdentity } from '../access-composition';
import { ContractPanel } from './ContractPanel';
import {
  approvedSigningContract,
  reportedSigningFixture,
  signingActor,
  signingIntent,
  signingPdf,
} from './reported-signing.fixture';
import { readModelContract } from './model-contract-response';
import { assertMessageCoverage } from '../localization/messages';
import { reportedSigningMessages } from './reported-signing.copy';

const identity = deterministicBrowserIdentity();
afterEach(() => vi.restoreAllMocks());
const response = (value: unknown, status = 200) =>
  Response.json(value, { status });
function panel(actor = signingActor) {
  return (
    <ContractPanel
      actor={actor}
      identity={identity}
      opportunityId={approvedSigningContract().opportunityId}
      onCompanyContextRejected={() => undefined}
    />
  );
}
async function fill() {
  fireEvent.click(
    await screen.findByRole('button', { name: 'Load eligible received PDFs' }),
  );
  const choice = await screen.findByLabelText(
    'Select the exact preserved received Contract PDF',
  );
  await selectOption(choice, signingPdf.representationId);
  for (const [legend, value] of [
    ['Reported provider signatory', signingIntent.providerSignatory],
    ['Reported Client signatory', signingIntent.clientSignatory],
  ] as const) {
    const region = screen.getByRole('group', { name: legend });
    fireEvent.change(within(region).getByLabelText('Literal signatory label'), {
      target: { value: value.label },
    });
    if (value.signedOn !== null)
      fireEvent.change(
        within(region).getByLabelText(
          'Reported signing date (blank = unknown)',
        ),
        { target: { value: value.signedOn } },
      );
    if (value.mandate.kind === 'DECLARED_UNVERIFIED') {
      await selectOption(
        within(region).getByLabelText('Reported mandate'),
        'DECLARED_UNVERIFIED',
      );
      if (!('basis' in value.mandate))
        throw new Error('Missing literal fixture mandate.');
      fireEvent.change(within(region).getByLabelText('Literal mandate basis'), {
        target: { value: value.mandate.basis },
      });
    }
  }
  fireEvent.change(
    screen.getByLabelText(
      'Basis for comparing this exact PDF, approved Contract and Offer',
    ),
    { target: { value: signingIntent.concordanceBasis } },
  );
  fireEvent.change(
    screen.getByLabelText(
      'Basis for this case accepting the exact Offer through both reported signatures',
    ),
    { target: { value: signingIntent.acceptanceBasis } },
  );
  for (const checkbox of within(
    screen.getByRole('group', {
      name: 'Acknowledge the complete current warning set again',
    }),
  ).getAllByRole('checkbox'))
    fireEvent.click(checkbox);
}
it('keeps complete four-locale copy and admits only the new model evidence variant with independently denied PDF projection', () => {
  assertMessageCoverage('reportedSigning', reportedSigningMessages);
  const contract = approvedSigningContract(),
    signature = reportedSigningFixture();
  const value = {
    ...contract,
    revision: 3,
    version: { ...contract.version, executionState: 'EXECUTED', signature },
  };
  expect(readModelContract(value).version.signature).toMatchObject({
    evidenceKind: 'DECLARED_RECEIVED_PDF',
  });
  expect(
    readModelContract({
      ...value,
      version: {
        ...value.version,
        signature: { ...signature, pdf: { access: 'denied' } },
      },
    }).version.signature?.pdf,
  ).toEqual({ access: 'denied' });
  expect(() =>
    readModelContract({
      ...value,
      version: {
        ...value.version,
        signature: {
          ...signature,
          pdf: { access: 'denied', documentId: signingPdf.documentId },
        },
      },
    }),
  ).toThrow();
});
it('locks sibling revision writes and retries the exact unchanged body/key after unavailable and mismatched successful responses', async () => {
  const attempts: { body: RequestInit['body']; key: string | null }[] = [];
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const path = input.toString();
    if (path.endsWith('/pdf-candidates'))
      return response({
        items: [signingPdf],
        nextCursor: null,
        warningCodes: signingIntent.acknowledgedWarningCodes,
      });
    if (path.endsWith('/signing-declarations')) {
      attempts.push({
        body: init?.body,
        key: new Headers(init?.headers).get('idempotency-key'),
      });
      return attempts.length === 1
        ? response({}, 503)
        : attempts.length === 2
          ? response(
              {
                ...reportedSigningFixture(),
                acceptanceBasis: 'Mismatched success',
              },
              201,
            )
          : response(reportedSigningFixture(), 201);
    }
    return response({ contract: approvedSigningContract(), precontract: null });
  });
  render(panel());
  await fill();
  fireEvent.click(
    screen.getByRole('button', {
      name: 'Declare both reported signatures, concordance and case acceptance',
    }),
  );
  const retry = await screen.findByRole('button', {
    name: 'Retry the identical declaration',
  });
  expect(
    screen.getByRole('button', {
      name: 'Copy this Version into a successor draft',
    }),
  ).toBeDisabled();
  expect(
    screen.getByRole('button', {
      name: 'Download exact non-official Contract HTML',
    }),
  ).toBeEnabled();
  expect(screen.getAllByLabelText('Literal signatory label')[0]).toBeDisabled();
  fireEvent.click(retry);
  await waitFor(() => expect(attempts).toHaveLength(2));
  expect(
    await screen.findByRole('button', {
      name: 'Retry the identical declaration',
    }),
  ).toBeVisible();
  fireEvent.click(
    screen.getByRole('button', { name: 'Retry the identical declaration' }),
  );
  await screen.findByRole('heading', { name: 'Recorded declaration' });
  expect(attempts).toHaveLength(3);
  expect(attempts[1]).toEqual(attempts[0]);
  expect(attempts[2]).toEqual(attempts[0]);
  expect(JSON.parse(String(attempts[0]?.body))).toEqual(signingIntent);
  expect(screen.getAllByText('Unknown', { exact: true })).not.toHaveLength(0);
});
it('preserves the declaration draft on unrelated model and Mission grant loss but retires it on consumed PDF grant loss', async () => {
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) =>
    input.toString().endsWith('/pdf-candidates')
      ? response({
          items: [signingPdf],
          nextCursor: null,
          warningCodes: signingIntent.acknowledgedWarningCodes,
        })
      : response({ contract: approvedSigningContract(), precontract: null }),
  );
  const view = render(panel());
  await fill();
  const c = signingActor.activeCompany;
  if (!c) throw new Error('Missing fixture Company.');
  view.rerender(
    panel({
      ...signingActor,
      activeCompany: {
        ...c,
        contractModelGrants: [],
        missionDeliverableAccessAssignmentId: undefined,
        missionDeliverableAccessPermissionSetVersion: undefined,
      },
    }),
  );
  expect(screen.getAllByLabelText('Literal signatory label')[0]).toHaveValue(
    signingIntent.providerSignatory.label,
  );
  view.rerender(
    panel({
      ...signingActor,
      activeCompany: {
        ...c,
        documentContentReaderAssignmentId: undefined,
        documentContentReaderPermissionSetVersion: undefined,
        documentPermissions: [
          'document.read',
          'document.received_contract.access',
        ],
      },
    }),
  );
  expect(
    screen.queryByLabelText('Literal signatory label'),
  ).not.toBeInTheDocument();
  view.rerender(panel());
  expect(
    (await screen.findAllByLabelText('Literal signatory label'))[0],
  ).toHaveValue('');
});
it('suppresses a held selector reply after consumed declaration authority is retired', async () => {
  let release: ((value: Response) => void) | undefined;
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) =>
    input.toString().endsWith('/pdf-candidates')
      ? new Promise<Response>((resolve) => {
          release = resolve;
        })
      : response({ contract: approvedSigningContract(), precontract: null }),
  );
  const view = render(panel());
  fireEvent.click(
    await screen.findByRole('button', { name: 'Load eligible received PDFs' }),
  );
  await waitFor(() => expect(release).toBeTypeOf('function'));
  const c = signingActor.activeCompany;
  if (!c) throw new Error('Missing fixture Company.');
  view.rerender(
    panel({
      ...signingActor,
      activeCompany: {
        ...c,
        contractSignatureDeclarerAssignmentId: undefined,
        contractSignatureDeclarerPermissionSetVersion: undefined,
      },
    }),
  );
  await act(async () => {
    release?.(
      response({
        items: [signingPdf],
        nextCursor: null,
        warningCodes: signingIntent.acknowledgedWarningCodes,
      }),
    );
  });
  expect(
    screen.queryByText(signingPdf.fileName, { exact: false }),
  ).not.toBeInTheDocument();
});

it('keeps confirmed declaration history after a held pre-declaration Contract reload arrives', async () => {
  let rootReads = 0;
  let release: ((value: Response) => void) | undefined;
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
    const path = input.toString();
    if (path.endsWith('/pdf-candidates'))
      return response({
        items: [signingPdf],
        nextCursor: null,
        warningCodes: signingIntent.acknowledgedWarningCodes,
      });
    if (path.endsWith('/signing-declarations'))
      return response(reportedSigningFixture(), 201);
    if (++rootReads === 2)
      return new Promise<Response>((resolve) => {
        release = resolve;
      });
    return response({ contract: approvedSigningContract(), precontract: null });
  });
  render(panel());
  await fill();
  fireEvent.click(screen.getByRole('button', { name: 'Reload Contract' }));
  await waitFor(() => expect(release).toBeTypeOf('function'));
  fireEvent.click(
    screen.getByRole('button', {
      name: 'Declare both reported signatures, concordance and case acceptance',
    }),
  );
  await screen.findByRole('heading', { name: 'Recorded declaration' });
  await act(async () => {
    release?.(
      response({ contract: approvedSigningContract(), precontract: null }),
    );
  });
  expect(
    screen.getByRole('heading', { name: 'Recorded declaration' }),
  ).toBeVisible();
  expect(
    screen.getByText(signingIntent.acceptanceBasis.trim(), { exact: true }),
  ).toBeVisible();
});

it('preserves an independent selected PDF request on Declarer loss and retires it only on its own PDF authority loss', async () => {
  let downloadSignal: AbortSignal | null | undefined;
  let release: ((value: Response) => void) | undefined;
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const path = input.toString();
    if (path.endsWith('/pdf-candidates'))
      return response({
        items: [signingPdf],
        nextCursor: null,
        warningCodes: signingIntent.acknowledgedWarningCodes,
      });
    if (path.endsWith('/content/' + signingPdf.representationId)) {
      downloadSignal = init?.signal;
      return new Promise<Response>((resolve) => {
        release = resolve;
      });
    }
    return response({ contract: approvedSigningContract(), precontract: null });
  });
  const view = render(panel());
  await fill();
  fireEvent.click(
    screen.getByRole('button', { name: 'Download this exact PDF' }),
  );
  await waitFor(() => expect(downloadSignal).toBeDefined());
  const c = signingActor.activeCompany;
  if (!c) throw new Error('Missing fixture Company.');
  view.rerender(
    panel({
      ...signingActor,
      activeCompany: {
        ...c,
        contractSignatureDeclarerAssignmentId: undefined,
        contractSignatureDeclarerPermissionSetVersion: undefined,
      },
    }),
  );
  expect(downloadSignal?.aborted).toBe(false);
  expect(
    screen.getByRole('button', { name: 'Download this exact PDF' }),
  ).toBeVisible();
  view.rerender(
    panel({
      ...signingActor,
      activeCompany: {
        ...c,
        documentContentReaderAssignmentId: undefined,
        documentContentReaderPermissionSetVersion: undefined,
      },
    }),
  );
  expect(downloadSignal?.aborted).toBe(true);
  await act(async () => {
    release?.(response({}, 503));
  });
});

it('withholds cached and held linked-Project metadata across Project capture loss and requires a fresh read after restoration', async () => {
  const base = approvedSigningContract();
  const linked = {
    id: '60000000-0000-4000-8000-000000000877',
    title: 'Protected linked Project DEMO',
    status: 'active',
    createdAt: '2026-10-24T10:00:00.000Z',
    link: {
      id: '70000000-0000-4000-8000-000000000877',
      contractId: base.id,
      projectId: '60000000-0000-4000-8000-000000000877',
      revision: 4,
      created: false,
      actorWorkspaceMembershipId: signingActor.workspaceMembershipId,
      linkedAt: '2026-10-24T10:00:00.000Z',
    },
  };
  const contract = {
    ...base,
    revision: 4,
    version: {
      ...base.version,
      executionState: 'EXECUTED',
      signature: reportedSigningFixture(),
    },
    linkedProjects: [linked],
  };
  // Links belong to the Contract root; a superseded, unsigned Version must
  // remain readable after its successor is declared and linked.
  const historical = readModelContract({
    ...base,
    revision: 6,
    version: {
      ...base.version,
      supersededByVersionId: '10000000-0000-4000-8000-000000000879',
      supersededAt: '2026-10-24T09:00:00.000Z',
    },
    linkedProjects: [{ ...linked, link: { ...linked.link, revision: 6 } }],
  });
  expect(historical.version.signature).toBeNull();
  expect(historical.linkedProjects[0]?.id).toBe(linked.id);
  const c = signingActor.activeCompany;
  if (!c) throw new Error('Missing Company.');
  const actor = {
    ...signingActor,
    activeCompany: {
      ...c,
      projectPermissionAssignmentId: 'project-capture-1',
      projectPermissionSetVersion: 'v2',
      projectPermissions: ['project.read'],
    },
  } satisfies typeof signingActor;
  let reads = 0,
    release: ((value: Response) => void) | undefined;
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
    if (input.toString().endsWith('/project-candidates'))
      return response({ items: [] });
    if (++reads === 2)
      return new Promise<Response>((resolve) => {
        release = resolve;
      });
    return response({ contract, precontract: null });
  });
  const view = render(panel(actor));
  await screen.findByText(linked.title, { exact: true });
  fireEvent.click(screen.getByRole('button', { name: 'Reload Contract' }));
  await waitFor(() => expect(release).toBeTypeOf('function'));
  view.rerender(
    panel({
      ...actor,
      activeCompany: {
        ...actor.activeCompany,
        projectPermissionAssignmentId: undefined,
        projectPermissionSetVersion: undefined,
        projectPermissions: [],
      },
    }),
  );
  expect(
    screen.queryByText(linked.title, { exact: true }),
  ).not.toBeInTheDocument();
  await act(async () => {
    release?.(response({ contract, precontract: null }));
  });
  expect(
    screen.queryByText(linked.title, { exact: true }),
  ).not.toBeInTheDocument();
  view.rerender(
    panel({
      ...actor,
      activeCompany: {
        ...actor.activeCompany,
        projectPermissionAssignmentId: 'project-capture-2',
      },
    }),
  );
  expect(
    screen.queryByText(linked.title, { exact: true }),
  ).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Reload Contract' }));
  await screen.findByText(linked.title, { exact: true });
});

it('preserves an independently uncertain declaration key when only Project authority is lost', async () => {
  const attempts: AttemptCapture[] = [];
  type AttemptCapture = { body: RequestInit['body']; key: string | null };
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const path = input.toString();
    if (path.endsWith('/pdf-candidates'))
      return response({
        items: [signingPdf],
        nextCursor: null,
        warningCodes: signingIntent.acknowledgedWarningCodes,
      });
    if (path.endsWith('/signing-declarations')) {
      attempts.push({
        body: init?.body,
        key: new Headers(init?.headers).get('idempotency-key'),
      });
      return attempts.length === 1
        ? response({}, 503)
        : response(reportedSigningFixture(), 201);
    }
    return response({ contract: approvedSigningContract(), precontract: null });
  });
  const c = signingActor.activeCompany;
  if (!c) throw new Error('Missing Company.');
  const actor = {
    ...signingActor,
    activeCompany: {
      ...c,
      projectPermissionAssignmentId: 'project-capture-1',
      projectPermissionSetVersion: 'v2',
      projectPermissions: ['project.read'],
    },
  } satisfies typeof signingActor;
  const view = render(panel(actor));
  await fill();
  fireEvent.click(
    screen.getByRole('button', {
      name: 'Declare both reported signatures, concordance and case acceptance',
    }),
  );
  await screen.findByRole('button', {
    name: 'Retry the identical declaration',
  });
  view.rerender(
    panel({
      ...actor,
      activeCompany: {
        ...actor.activeCompany,
        projectPermissionAssignmentId: undefined,
        projectPermissionSetVersion: undefined,
        projectPermissions: [],
      },
    }),
  );
  fireEvent.click(
    screen.getByRole('button', { name: 'Retry the identical declaration' }),
  );
  await screen.findByRole('heading', { name: 'Recorded declaration' });
  expect(attempts).toHaveLength(2);
  expect(attempts[1]).toEqual(attempts[0]);
});
