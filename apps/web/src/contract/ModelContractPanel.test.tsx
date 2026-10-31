import {
  source as planSource,
  userGrant,
} from '../mission-plan/mission-plan.fixture';
import {
  signingActor,
  approvedSigningContract,
  reportedSigningFixture,
} from './reported-signing.fixture';
import '@testing-library/jest-dom/vitest';
import {
  act,
  fireEvent,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render } from '../test/render-with-interface-locale';
import { selectOption } from '../test/select-option';
import { deterministicBrowserIdentity } from '../access-composition';
import { ContractPanel } from './ContractPanel';
import {
  modelContractActor,
  modelContractFixture,
  modelContractQualityFixture,
  modelContractApprovalFixture,
  modelContractSourceOfferFixture,
  selectedContractModelFixture,
} from './model-contract.fixture';
import { readModelOffer } from '../offer/model-offer-response';
import { assertMessageCoverage } from '../localization/messages';
import { modelContractMessages } from './model-contract.copy';

const identity = deterministicBrowserIdentity({
  'x-test-external-subject': 'model-contract-reader',
});
afterEach(() => vi.restoreAllMocks());
function response(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}
function panel(actor = modelContractActor) {
  return (
    <ContractPanel
      actor={actor}
      identity={identity}
      opportunityId={modelContractFixture().opportunityId}
      onCompanyContextRejected={() => undefined}
    />
  );
}
type Attempt = { body: RequestInit['body']; key: string | null };
function capture(init: RequestInit | undefined): Attempt {
  return {
    body: init?.body,
    key: new Headers(init?.headers).get('idempotency-key'),
  };
}

describe('Corresponding Contract component command ownership', () => {
  it.each(['client', 'offer', 'intake'] as const)(
    'retires a held preparation command and literal draft when its consumed %s capture changes, preserving ordinary Contract reads',
    async (kind) => {
      const source = modelContractFixture();
      const actor: typeof modelContractActor = {
        ...modelContractActor,
        workspacePermissions: [
          ...modelContractActor.workspacePermissions,
          'client.manage',
        ],
        activeCompany: {
          ...modelContractActor.activeCompany,
          id: source.companyId,
          displayName: 'Captured source Company',
          clientPermissions: ['client.read'],
          clientPermissionAssignmentId: 'source-client-v2',
          clientPermissionSetVersion: 'v2',
          offerPermissionAssignmentId: 'source-offer-v3',
          offerPermissionSetVersion: 'v3',
          offerApproverAssignmentId: 'source-offer-alternative-v2',
          offerApproverPermissionSetVersion: 'v2',
          commercialIntakePermissionAssignmentId: 'source-intake-v4',
          commercialIntakePermissionSetVersion: 'v4',
        },
      };
      let release: ((value: Response) => void) | undefined;
      let signal: AbortSignal | null | undefined;
      let releaseOffer: ((value: Response) => void) | undefined;
      let releaseModel: ((value: Response) => void) | undefined;
      vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
        if (init?.method === 'POST') {
          signal = init.signal;
          return new Promise<Response>((resolve) => {
            release = resolve;
          });
        }
        const path = input.toString();
        if (path.endsWith('/model-selection'))
          return new Promise<Response>((resolve) => {
            releaseModel = resolve;
          });
        if (path.includes('/offers/'))
          return new Promise<Response>((resolve) => {
            releaseOffer = resolve;
          });
        return response({ contract: source, precontract: null });
      });
      const view = render(panel(actor));
      const copyButton = await screen.findByRole('button', {
        name: 'Copy this Version into a successor draft',
      });
      await act(async () => {
        fireEvent.click(copyButton);
      });
      const form = await screen.findByRole('form', {
        name: 'Prepare a complete successor',
      });
      const prepareButton = within(form).getByRole('button', {
        name: 'Prepare full non-official Contract',
      });
      expect(prepareButton).toBeDisabled();
      if (!releaseOffer || !releaseModel)
        throw new Error('Expected both Contract source reads to begin.');
      const settleOffer = releaseOffer,
        settleModel = releaseModel;
      await act(async () => {
        settleOffer(response({ offer: modelContractSourceOfferFixture() }));
      });
      expect(prepareButton).toBeDisabled();
      await act(async () => {
        settleModel(response({ selection: selectedContractModelFixture }));
      });
      await waitFor(() =>
        expect(
          within(form).getByRole('button', {
            name: 'Prepare full non-official Contract',
          }),
        ).toBeEnabled(),
      );
      await selectOption(
        within(form).getByLabelText('Select the exact source Offer Version'),
        source.version.sourceOfferVersionId,
      );
      await selectOption(
        within(form).getByLabelText(
          'Select the approved Contract model Version',
        ),
        selectedContractModelFixture.versionId,
      );
      const label = 'Case Client requisites and representative wording';
      fireEvent.change(within(form).getByLabelText(label), {
        target: { value: 'Protected source-specific literal draft' },
      });
      fireEvent.click(within(form).getByRole('checkbox'));
      fireEvent.submit(form);
      await waitFor(() => expect(signal).toBeDefined());
      const c = actor.activeCompany;
      if (!c) throw new Error('Missing source Company.');
      const changed =
        kind === 'client'
          ? {
              ...c,
              clientPermissions: [],
              clientPermissionAssignmentId: undefined,
              clientPermissionSetVersion: undefined,
            }
          : kind === 'offer'
            ? {
                ...c,
                offerPermissionAssignmentId: undefined,
                offerPermissionSetVersion: undefined,
              }
            : {
                ...c,
                commercialIntakePermissionAssignmentId:
                  'fresh-source-intake-v4',
              };
      view.rerender(panel({ ...actor, activeCompany: changed }));
      await waitFor(() => expect(signal?.aborted).toBe(true));
      expect(
        screen.queryByDisplayValue('Protected source-specific literal draft'),
      ).not.toBeInTheDocument();
      await act(async () => {
        release?.(response({}, 503));
      });
      expect(
        screen.queryByRole('button', {
          name: 'Retry the same Contract command',
        }),
      ).not.toBeInTheDocument();
      expect(
        screen.getByRole('button', {
          name: 'Download exact non-official Contract HTML',
        }),
      ).toBeEnabled();
      view.rerender(panel(actor));
      expect(
        screen.queryByDisplayValue('Protected source-specific literal draft'),
      ).not.toBeInTheDocument();
    },
  );

  it('retires a successor draft when its independent Workspace Client authority is lost and does not restore it after a new grant', async () => {
    const source = modelContractFixture();
    const privileged: typeof modelContractActor = {
      ...modelContractActor,
      workspacePermissions: [
        ...modelContractActor.workspacePermissions,
        'client.manage',
      ],
      activeCompany: {
        ...modelContractActor.activeCompany,
        id: source.companyId,
        displayName: 'Synthetic Company',
        clientPermissions: [],
      },
    };
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const path = input.toString();
      if (path.endsWith('/model-selection'))
        return response({ selection: selectedContractModelFixture });
      if (path.includes('/offers/'))
        return response({ offer: modelContractSourceOfferFixture() });
      return response({ contract: source, precontract: null });
    });
    const view = render(panel(privileged));
    fireEvent.click(
      await screen.findByRole('button', {
        name: 'Copy this Version into a successor draft',
      }),
    );
    await screen.findByRole('form', { name: 'Prepare a complete successor' });
    fireEvent.change(
      screen.getByLabelText(
        'Case Client requisites and representative wording',
      ),
      {
        target: {
          value: 'Protected correctable draft after explicit Client authority',
        },
      },
    );
    view.rerender(
      panel({
        ...privileged,
        workspacePermissions: privileged.workspacePermissions.filter(
          (permission) => permission !== 'client.manage',
        ),
      }),
    );
    await waitFor(() =>
      expect(
        screen.queryByRole('form', { name: 'Prepare a complete successor' }),
      ).not.toBeInTheDocument(),
    );
    expect(
      await screen.findByText(
        source.version.modelGeneration.caseDetails.clientDetails.trim(),
      ),
    ).toBeVisible();
    view.rerender(panel(privileged));
    await screen.findByRole('button', {
      name: 'Copy this Version into a successor draft',
    });
    expect(
      screen.queryByRole('form', { name: 'Prepare a complete successor' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByDisplayValue(
        'Protected correctable draft after explicit Client authority',
      ),
    ).not.toBeInTheDocument();
  });

  it('has complete localized controls and a semantically valid selectable Offer fixture', () => {
    assertMessageCoverage('modelContract', modelContractMessages);
    expect(
      readModelOffer(modelContractSourceOfferFixture()).version
        .clientResponseState,
    ).toBe('PENDING');
  });

  it('keeps legacy v1 readers limited to the frozen complete copy', async () => {
    const source = modelContractFixture();
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      response({ contract: source, precontract: null }),
    );
    render(
      panel({
        ...modelContractActor,
        activeCompany: {
          ...modelContractActor.activeCompany,
          id: source.companyId,
          displayName: 'Synthetic Company',
          contractPermissionSetVersion: 'v1',
          contractApproverPermissionSetVersion: 'v1',
        },
      }),
    );
    await screen.findByText(
      source.version.modelGeneration.caseDetails.clientDetails.trim(),
    );
    expect(screen.getByText('Activitate demonstrativă 13')).toBeVisible();
    expect(
      screen.getByRole('button', {
        name: 'Download exact non-official Contract HTML',
      }),
    ).toBeEnabled();
    expect(
      screen.queryByRole('button', { name: 'Run Contract Quality Checks' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', {
        name: 'Copy this Version into a successor draft',
      }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByLabelText('Exact Contract and annex review basis'),
    ).not.toBeInTheDocument();
  });

  it('retains an exact first intent through pending, committed uncertainty and malformed success, and preserves confirmation after a failed refresh', async () => {
    const source = modelContractFixture(),
      attempts: Attempt[] = [];
    let committed = false,
      refreshFailure = false;
    let release: ((response: Response) => void) | undefined;
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const path = input.toString();
      if (init?.method === 'POST') {
        attempts.push(capture(init));
        committed = true;
        if (attempts.length === 1)
          return new Promise<Response>((resolve) => {
            release = resolve;
          });
        return attempts.length === 2
          ? response(
              {
                ...source,
                version: { ...source.version, modelGeneration: null },
              },
              201,
            )
          : response(source, 201);
      }
      if (path.endsWith('/model-selection'))
        return response({ selection: selectedContractModelFixture });
      if (path.includes('/offers/'))
        return response({ offer: modelContractSourceOfferFixture() });
      return refreshFailure
        ? response({}, 503)
        : response({ contract: committed ? source : null, precontract: null });
    });
    render(panel());
    const form = await screen.findByRole('form', {
      name: 'Prepare full non-official Contract',
    });
    const details = source.version.modelGeneration.caseDetails;
    expect(within(form).getByLabelText('Declared document date')).toHaveValue(
      '',
    );
    expect(within(form).getByRole('checkbox')).not.toBeChecked();
    await waitFor(() =>
      expect(
        within(form).getByRole('button', {
          name: 'Prepare full non-official Contract',
        }),
      ).toBeEnabled(),
    );
    selectOption(
      within(form).getByLabelText('Select the exact source Offer Version'),
      source.version.sourceOfferVersionId,
    );
    selectOption(
      within(form).getByLabelText('Select the approved Contract model Version'),
      selectedContractModelFixture.versionId,
    );
    fireEvent.change(within(form).getByLabelText('Declared document date'), {
      target: { value: details.documentDate },
    });
    fireEvent.change(
      within(form).getByLabelText(
        'Case Client requisites and representative wording',
      ),
      { target: { value: details.clientDetails } },
    );
    fireEvent.change(within(form).getByLabelText('Source concordance basis'), {
      target: { value: details.sourceConcordanceBasis },
    });
    fireEvent.click(within(form).getByRole('checkbox'));
    fireEvent.submit(form);
    await waitFor(() => expect(attempts).toHaveLength(1));
    expect(
      within(form).getByLabelText(
        'Case Client requisites and representative wording',
      ),
    ).toBeDisabled();
    expect(
      within(form).getByRole('button', { name: /Reload Contract/ }),
    ).toBeDisabled();
    await act(async () => release?.(response({}, 503)));
    fireEvent.click(
      await screen.findByRole('button', {
        name: 'Retry the same Contract command',
      }),
    );
    await waitFor(() => expect(attempts).toHaveLength(2));
    expect(
      within(form).getByLabelText(
        'Case Client requisites and representative wording',
      ),
    ).toHaveValue(details.clientDetails);
    fireEvent.click(
      await screen.findByRole('button', {
        name: 'Retry the same Contract command',
      }),
    );
    await screen.findByText('Contract Version preserved.');
    expect(attempts).toHaveLength(3);
    expect(attempts[0]).toEqual(attempts[1]);
    expect(attempts[1]).toEqual(attempts[2]);
    expect(attempts[0]?.key).toBeTruthy();
    refreshFailure = true;
    fireEvent.click(screen.getByRole('button', { name: 'Reload Contract' }));
    await screen.findByText(
      'The read failed. A previously confirmed command remains recorded.',
    );
    expect(screen.getByText('Contract Version preserved.')).toBeVisible();
    expect(screen.getByText(details.clientDetails.trim())).toBeVisible();
  });

  it('blocks all sibling actions around uncertain checks and decisions, then displays the exact internally approved, unexecuted Version', async () => {
    const source = modelContractFixture(),
      checks: Attempt[] = [],
      decisions: Attempt[] = [];
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const path = input.toString();
      if (init?.method === 'POST' && path.endsWith('/quality-checks')) {
        checks.push(capture(init));
        return checks.length === 1
          ? response({}, 503)
          : response(modelContractQualityFixture(), 201);
      }
      if (init?.method === 'POST' && path.endsWith('/approve')) {
        decisions.push(capture(init));
        return decisions.length === 1
          ? response(
              { ...modelContractApprovalFixture(), contractVersionId: 'other' },
              201,
            )
          : response(modelContractApprovalFixture(), 201);
      }
      return response({ contract: source, precontract: null });
    });
    render(panel());
    await screen.findByText(
      source.version.modelGeneration.caseDetails.clientDetails.trim(),
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'Run Contract Quality Checks' }),
    );
    const retry = await screen.findByRole('button', {
      name: 'Retry the same Contract command',
    });
    for (const name of [
      'Copy this Version into a successor draft',
      'Download exact non-official Contract HTML',
      'Reload Contract',
    ])
      expect(screen.getByRole('button', { name })).toBeDisabled();
    expect(
      screen.getByLabelText('Exact Contract and annex review basis'),
    ).toBeDisabled();
    fireEvent.click(retry);
    await screen.findByText('Contract checks recorded.');
    expect(checks[0]).toEqual(checks[1]);
    const acknowledgements = screen.getAllByRole('checkbox', {
      name: 'I acknowledge this warning',
    });
    expect(acknowledgements).toHaveLength(2);
    for (const checkbox of acknowledgements) {
      expect(checkbox).not.toBeChecked();
      fireEvent.click(checkbox);
    }
    fireEvent.change(
      screen.getByLabelText('Exact Contract and annex review basis'),
      { target: { value: modelContractApprovalFixture().reviewBasis } },
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'Approve exact Contract Version' }),
    );
    fireEvent.click(
      await screen.findByRole('button', {
        name: 'Retry the same Contract command',
      }),
    );
    await screen.findByText('Internal Contract decision recorded.');
    expect(decisions[0]).toEqual(decisions[1]);
    expect(screen.getAllByText(/Approved internally/).length).toBeGreaterThan(
      0,
    );
    expect(screen.getByText(/This Contract remains unexecuted/)).toBeVisible();
    expect(
      screen.queryByLabelText('Exact Contract and annex review basis'),
    ).not.toBeInTheDocument();
  });
});

it('wires scoped plan rejection through the actual Company-model Contract parent and preserves native manual work', async () => {
  const contract = approvedSigningContract(),
    companyId = contract.companyId;
  const current = {
    ...signingActor,
    activeCompany: {
      ...signingActor.activeCompany,
      id: companyId,
      displayName: 'Synthetic Company',
      projectPermissions: ['project.read', 'project.create'],
      taskPermissions: ['task.read', 'task.manage'],
      missionPlanGrants: [userGrant],
    },
  } satisfies typeof signingActor;
  const revised = {
      ...current,
      activeCompany: { ...current.activeCompany, missionPlanGrants: [] },
    },
    revalidated = vi.fn();
  const source = { ...planSource, companyId, workspaceId: current.workspaceId },
    catalogue = {
      items: [
        { ...source, createdAt: '2026-10-27T12:00:00.000000Z', head: source },
      ],
    };
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const path = String(input);
    if (path.endsWith('/access/current-actor')) return response(revised);
    if (init?.method === 'POST' && path.endsWith('/create-from-mission-plan'))
      return response({}, 403);
    if (path.endsWith('/project-candidates')) return response({ items: [] });
    if (path.endsWith('/versions/' + source.id))
      return response({ version: source });
    if (path.endsWith('/mission-plans')) return response(catalogue);
    if (path.endsWith('/versions'))
      return response({ items: [], nextCursor: null });
    return response({
      contract: {
        ...contract,
        revision: 3,
        version: {
          ...contract.version,
          executionState: 'EXECUTED',
          signature: reportedSigningFixture(),
        },
      },
    });
  });
  const component = (value: typeof current) => (
    <ContractPanel
      actor={value}
      identity={identity}
      opportunityId={contract.opportunityId}
      onCompanyContextRejected={() => undefined}
      onActorRevalidated={revalidated}
    />
  );
  const view = render(component(current));
  const manual = await screen.findByRole('region', {
      name: 'Create a preparatory Project',
    }),
    field = within(manual).getByRole('textbox');
  fireEvent.change(field, {
    target: { value: 'Independent native model work' },
  });
  fireEvent.click(
    await screen.findByRole('button', {
      name: 'Open Version: Synthetic reusable plan',
    }),
  );
  fireEvent.click(
    await screen.findByRole('button', {
      name: 'Open Version: Synthetic reusable plan · Version 1',
    }),
  );
  const planned = screen.getByRole('region', {
    name: 'Create a mission from a plan',
  });
  fireEvent.change(within(planned).getByRole('textbox'), {
    target: { value: 'Configured model mission' },
  });
  fireEvent.click(within(planned).getByRole('checkbox'));
  fireEvent.click(
    within(planned).getByRole('button', { name: 'Create and link mission' }),
  );
  await waitFor(() => expect(revalidated).toHaveBeenCalledWith(revised));
  view.rerender(component(revised));
  expect(
    screen.queryByRole('region', { name: 'Create a mission from a plan' }),
  ).not.toBeInTheDocument();
  expect(within(manual).getByRole('textbox')).toBe(field);
  expect(field).toHaveValue('Independent native model work');
  expect(field).toBeEnabled();
});
