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
