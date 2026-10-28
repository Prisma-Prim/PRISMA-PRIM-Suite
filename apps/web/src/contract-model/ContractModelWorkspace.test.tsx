import { afterEach, expect, it, vi } from 'vitest';
import { act, fireEvent, waitFor } from '@testing-library/react';
import { render, screen } from '../test/render-with-interface-locale';
import { deterministicBrowserIdentity } from '../access-composition';
import { useInterfaceLocale } from '../localization/interface-locale';
import { ContractModelWorkspace } from './ContractModelWorkspace';
import {
  syntheticActor,
  syntheticContent,
  syntheticModel,
  syntheticApprover,
  syntheticAttribution,
} from './contract-model.fixture';

afterEach(() => vi.unstubAllGlobals());

it('submits complete literal human-entered content and reloads the current pending version', async () => {
  let created = false;
  const commands: RequestInit[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = new URL(input.toString(), window.location.origin).pathname;
      if (
        path === '/api/contract-models/consulting-ro/versions' &&
        init?.method === 'POST'
      ) {
        commands.push(init);
        created = true;
        return Response.json({ model: syntheticModel }, { status: 201 });
      }
      if (path === '/api/contract-models/consulting-ro')
        return Response.json({ model: created ? syntheticModel : null });
      if (path === '/api/contract-models/consulting-ro/versions')
        return Response.json({ versions: [], nextCursor: null });
      throw new Error('Unexpected model route.');
    }),
  );
  render(
    <ContractModelWorkspace
      actor={syntheticActor}
      identity={deterministicBrowserIdentity()}
    />,
  );
  fireEvent.click(
    await screen.findByRole('button', { name: 'New model version' }),
  );
  fireEvent.click(screen.getByLabelText('Source kind', { exact: true }));
  fireEvent.click(
    await screen.findByRole('option', { name: 'Illustrative content' }),
  );
  const fields: Record<string, string> = {
    'Source description': syntheticContent.sourceDescription,
    'Contract title': syntheticContent.title,
    'Romanian service title': syntheticContent.serviceTitle,
    'Intended place wording': syntheticContent.place,
    'Issuer legal name': syntheticContent.issuer.legalName,
    'Issuer tax identifier': syntheticContent.issuer.taxId,
    'Issuer legal address': syntheticContent.issuer.legalAddress,
    'Full provider requisites wording': syntheticContent.providerDetails,
    'Client requisites introduction':
      syntheticContent.clientDetailsIntroduction,
    'Framework name 1': 'Cadru sintetic',
    'Framework edition 1': 'Ediție sintetică 1',
    'I. Subject': syntheticContent.sections.subject,
    'II. Execution term': syntheticContent.sections.executionTerm,
    'III. Rights and obligations':
      syntheticContent.sections.rightsAndObligations,
    'IV. Confidentiality': syntheticContent.sections.confidentiality,
    'V. Price and payment wording': syntheticContent.sections.priceAndPayment,
    'VI. Liability': syntheticContent.sections.liability,
    'VII. Termination': syntheticContent.sections.termination,
    'VIII. Final provisions': syntheticContent.sections.finalProvisions,
    'IX. Parties and signatures wording':
      syntheticContent.sections.partiesAndSignatures,
    'Blank provider signature area': syntheticContent.signatureAreas.provider,
    'Blank Client signature area': syntheticContent.signatureAreas.client,
    'Blank annex provider signature area':
      syntheticContent.signatureAreas.annexProvider,
    'Blank annex Client signature area':
      syntheticContent.signatureAreas.annexClient,
    'Annex title': syntheticContent.annex.title,
    'Annex reference wording': syntheticContent.annex.referenceWording,
  };
  for (const [label, value] of Object.entries(fields))
    fireEvent.change(screen.getByLabelText(label, { exact: true }), {
      target: { value },
    });
  for (let number = 1; number <= 13; number++) {
    for (const [label, value] of [
      ['Activity title', `Activitate demonstrativă ${number}`],
      ['Planned activity', `Lucrare planificată demonstrativă ${number}`],
      ['Intended result', `Rezultat intenționat demonstrativ ${number}`],
    ])
      fireEvent.change(
        screen.getByLabelText(`${label} ${number}`, { exact: true }),
        { target: { value } },
      );
  }
  fireEvent.click(
    screen.getByRole('button', { name: 'Submit complete version' }),
  );
  await waitFor(() => expect(commands).toHaveLength(1));
  expect(commands[0]?.body).toBe(
    JSON.stringify({ expectedModelRevision: 0, content: syntheticContent }),
  );
  expect(new Headers(commands[0]?.headers).get('idempotency-key')).toBeTruthy();
  expect(await screen.findByText('Version 1 saved.')).toBeVisible();
  expect(await screen.findByText('Awaiting model approval')).toBeVisible();
  expect(
    screen.getByRole('heading', { name: 'I. Subject' }).nextElementSibling
      ?.textContent,
  ).toBe(syntheticContent.sections.subject);
  for (const [, value] of Object.entries(fields).filter(
    ([label]) =>
      label !== 'Framework name 1' && label !== 'Framework edition 1',
  ))
    expect(
      screen.getAllByText((_, element) => element?.textContent === value)
        .length,
    ).toBeGreaterThan(0);
  expect(screen.getByText('Cadru sintetic — Ediție sintetică 1')).toBeVisible();
  for (const row of syntheticContent.annex.activities)
    for (const value of [row.title, row.plannedActivity, row.intendedResult])
      expect(screen.getByText(value, { exact: true })).toBeVisible();
  expect(document.querySelector('script')).toBeNull();
});

it.each(['APPROVE', 'REJECT'] as const)(
  'records an explicit %s decision for the reviewed exact version without editor authority',
  async (outcome) => {
    let decided = false;
    const commands: RequestInit[] = [];
    const decision = {
      id: '70000000-0000-4000-8000-000000000864',
      outcome,
      basis: ' Exact complete content reviewed ',
      ...syntheticAttribution,
    };
    const result = {
      ...syntheticModel,
      revision: 2,
      head: { ...syntheticModel.head, decision },
      activeVersion:
        outcome === 'APPROVE'
          ? {
              id: syntheticModel.head.id,
              versionNumber: 1,
              sourceKind: 'ILLUSTRATIVE',
              serviceTitle: syntheticContent.serviceTitle,
            }
          : null,
    };
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const path = new URL(input.toString(), window.location.origin).pathname;
        if (path.endsWith('/decision') && init?.method === 'POST') {
          commands.push(init);
          decided = true;
          return Response.json({ model: result }, { status: 201 });
        }
        if (path === '/api/contract-models/consulting-ro')
          return Response.json({ model: decided ? result : syntheticModel });
        if (path === '/api/contract-models/consulting-ro/versions')
          return Response.json({ versions: [], nextCursor: null });
        throw new Error('Unexpected route.');
      }),
    );
    render(
      <ContractModelWorkspace
        actor={syntheticApprover}
        identity={deterministicBrowserIdentity()}
      />,
    );
    fireEvent.change(await screen.findByLabelText('Decision basis'), {
      target: { value: decision.basis },
    });
    fireEvent.click(
      screen.getByRole('button', {
        name:
          outcome === 'APPROVE'
            ? 'Approve this exact version'
            : 'Reject this exact version',
      }),
    );
    expect(
      await screen.findByText('Decision for version 1 recorded.'),
    ).toBeVisible();
    expect(commands).toHaveLength(1);
    expect(commands[0]?.body).toBe(
      JSON.stringify({
        expectedModelRevision: 1,
        versionNumber: 1,
        outcome,
        basis: decision.basis,
      }),
    );
    expect(
      await screen.findByText(
        outcome === 'APPROVE'
          ? 'Available approved version: 1'
          : 'No approved version is currently available for new use.',
      ),
    ).toBeVisible();
    expect(
      screen.queryByRole('button', { name: 'New model version' }),
    ).toBeNull();
  },
);

it.each([false, true])(
  'withdraws the exact older active approval and preserves confirmation when later reads fail (%s)',
  async (refreshFailure) => {
    const approved = {
      ...syntheticModel.head,
      decision: {
        id: '70000000-0000-4000-8000-000000000864',
        outcome: 'APPROVE',
        basis: 'Reviewed original content',
        ...syntheticAttribution,
      },
    };
    const pending = {
      ...syntheticModel,
      revision: 3,
      head: {
        ...syntheticModel.head,
        id: '61000000-0000-4000-8000-000000000864',
        versionNumber: 2,
        predecessorVersionId: syntheticModel.head.id,
      },
      activeVersion: {
        id: approved.id,
        versionNumber: 1,
        sourceKind: 'ILLUSTRATIVE',
        serviceTitle: syntheticContent.serviceTitle,
      },
    };
    const reason = ' Exact older version withdrawn ';
    let withdrawn = false;
    const commands: { path: string; init: RequestInit }[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const path = new URL(input.toString(), window.location.origin).pathname;
        if (path.endsWith('/withdrawal') && init?.method === 'POST') {
          commands.push({ path, init });
          withdrawn = true;
          return Response.json(
            { model: { ...pending, revision: 4, activeVersion: null } },
            { status: 201 },
          );
        }
        if (
          path === `/api/contract-models/consulting-ro/versions/${approved.id}`
        ) {
          if (refreshFailure) return new Response(null, { status: 503 });
          return Response.json({
            version: {
              ...approved,
              withdrawal: withdrawn
                ? {
                    id: '71000000-0000-4000-8000-000000000864',
                    reason,
                    ...syntheticAttribution,
                  }
                : null,
            },
            currentSelection: {
              activeVersionId: withdrawn ? null : approved.id,
            },
          });
        }
        if (path === '/api/contract-models/consulting-ro') {
          if (withdrawn && refreshFailure)
            return new Response(null, { status: 503 });
          return Response.json({
            model: withdrawn
              ? { ...pending, revision: 4, activeVersion: null }
              : pending,
          });
        }
        if (path === '/api/contract-models/consulting-ro/versions')
          return Response.json({ versions: [], nextCursor: null });
        throw new Error('Unexpected route.');
      }),
    );
    render(
      <ContractModelWorkspace
        actor={syntheticApprover}
        identity={deterministicBrowserIdentity()}
      />,
    );
    fireEvent.change(await screen.findByLabelText('Withdrawal reason'), {
      target: { value: reason },
    });
    fireEvent.click(
      screen.getByRole('button', { name: 'Withdraw the active version' }),
    );
    expect(
      await screen.findByText('Withdrawal of version 1 recorded.'),
    ).toBeVisible();
    if (refreshFailure) {
      expect(
        await screen.findByText('The model could not be loaded. Try again.'),
      ).toBeVisible();
      expect(
        screen.queryByRole('button', { name: 'Retry identical command' }),
      ).toBeNull();
    } else {
      expect(
        await screen.findByText(
          'No approved version is currently available for new use.',
        ),
      ).toBeVisible();
      expect(
        screen.getByRole('heading', {
          name: 'Version 2: Serviciu sintetic de consultanță',
        }),
      ).toBeVisible();
    }
    expect(commands).toHaveLength(1);
    expect(commands[0]?.path).toBe(
      `/api/contract-models/consulting-ro/versions/${approved.id}/withdrawal`,
    );
    expect(commands[0]?.init.body).toBe(
      JSON.stringify({ expectedModelRevision: 3, versionNumber: 1, reason }),
    );
  },
);

it.each([true, false])(
  'opens exact history and only an editor copies it against the current root revision (%s)',
  async (canEdit) => {
    let created = false;
    const commands: RequestInit[] = [];
    const current = {
      ...syntheticModel,
      revision: 3,
      head: {
        ...syntheticModel.head,
        id: '61000000-0000-4000-8000-000000000864',
        versionNumber: 2,
        predecessorVersionId: syntheticModel.head.id,
        content: {
          ...syntheticContent,
          serviceTitle: 'Succesor demonstrativ',
          sections: { ...syntheticContent.sections, subject: 'Clauză nouă' },
          annex: {
            ...syntheticContent.annex,
            activities: syntheticContent.annex.activities.map((activity) => ({
              ...activity,
              title: `Succesor ${activity.title}`,
            })),
          },
        },
      },
      activeVersion: {
        id: syntheticModel.head.id,
        versionNumber: 1,
        sourceKind: 'ILLUSTRATIVE',
        serviceTitle: syntheticContent.serviceTitle,
      },
    };
    const original = {
      ...syntheticModel.head,
      decision: {
        id: '70000000-0000-4000-8000-000000000864',
        outcome: 'APPROVE',
        basis: ' Original independent review basis ',
        ...syntheticAttribution,
      },
    };
    const successor = {
      ...current,
      revision: 4,
      head: {
        ...current.head,
        id: '62000000-0000-4000-8000-000000000864',
        versionNumber: 3,
        predecessorVersionId: current.head.id,
        content: original.content,
      },
    };
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const path = new URL(input.toString(), window.location.origin).pathname;
        if (
          path === '/api/contract-models/consulting-ro/versions' &&
          init?.method === 'POST'
        ) {
          commands.push(init);
          created = true;
          return Response.json({ model: successor }, { status: 201 });
        }
        if (path === '/api/contract-models/consulting-ro')
          return Response.json({ model: created ? successor : current });
        if (path === '/api/contract-models/consulting-ro/versions')
          return Response.json({
            versions: [
              {
                id: original.id,
                versionNumber: 1,
                predecessorVersionId: null,
                sourceKind: 'ILLUSTRATIVE',
                serviceTitle: syntheticContent.serviceTitle,
                ...syntheticAttribution,
                decision: {
                  outcome: 'APPROVE',
                  recordedAt: syntheticAttribution.recordedAt,
                },
              },
            ],
            nextCursor: null,
          });
        if (
          path === `/api/contract-models/consulting-ro/versions/${original.id}`
        )
          return Response.json({
            version: original,
            currentSelection: { activeVersionId: original.id },
          });
        throw new Error('Unexpected history route.');
      }),
    );
    render(
      <ContractModelWorkspace
        actor={canEdit ? syntheticActor : syntheticApprover}
        identity={deterministicBrowserIdentity()}
      />,
    );
    fireEvent.click(
      await screen.findByRole('button', { name: 'Version history' }),
    );
    fireEvent.click(
      await screen.findByRole('button', { name: 'Open version 1' }),
    );
    expect(
      await screen.findByRole('heading', {
        name: 'Version 1: Serviciu sintetic de consultanță',
      }),
    ).toBeVisible();
    expect(screen.getByText('Original independent review basis')).toBeVisible();
    expect(
      screen.getByText(
        'Historical content; availability is shown in the current model above.',
      ),
    ).toBeVisible();
    expect(
      screen.getByRole('heading', { name: 'Version 2: Succesor demonstrativ' }),
    ).toBeVisible();
    if (!canEdit) {
      expect(
        screen.queryByRole('button', {
          name: 'Copy this version into a new draft',
        }),
      ).toBeNull();
      return;
    }
    fireEvent.click(
      await screen.findByRole('button', {
        name: 'Copy this version into a new draft',
      }),
    );
    expect(
      screen.getByLabelText('Romanian service title', { exact: true }),
    ).toHaveValue(original.content.serviceTitle);
    expect(screen.getByLabelText('I. Subject', { exact: true })).toHaveValue(
      original.content.sections.subject,
    );
    for (let number = 1; number <= 13; number++)
      expect(
        screen.getByLabelText(`Activity title ${number}`, { exact: true }),
      ).toHaveValue(`Activitate demonstrativă ${number}`);
    fireEvent.click(
      screen.getByRole('button', { name: 'Submit complete version' }),
    );
    expect(await screen.findByText('Version 3 saved.')).toBeVisible();
    expect(commands).toHaveLength(1);
    expect(commands[0]?.body).toBe(
      JSON.stringify({ expectedModelRevision: 3, content: original.content }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Version history' }));
    fireEvent.click(
      await screen.findByRole('button', { name: 'Open version 1' }),
    );
    expect(
      await screen.findByText('Original independent review basis'),
    ).toBeVisible();
  },
);

it('retries a malformed successful decision reply literally and then rereads current selection instead of displaying the historical receipt as current', async () => {
  const decision = {
    id: '70000000-0000-4000-8000-000000000864',
    outcome: 'APPROVE',
    basis: ' Exact literal uncertain decision ',
    ...syntheticAttribution,
  };
  const activeVersion = {
    id: syntheticModel.head.id,
    versionNumber: 1,
    sourceKind: 'ILLUSTRATIVE',
    serviceTitle: syntheticContent.serviceTitle,
  };
  const receipt = {
    ...syntheticModel,
    revision: 2,
    head: { ...syntheticModel.head, decision },
    activeVersion,
  };
  const later = {
    ...syntheticModel,
    revision: 3,
    head: {
      ...syntheticModel.head,
      id: '61000000-0000-4000-8000-000000000864',
      versionNumber: 2,
      predecessorVersionId: syntheticModel.head.id,
      content: { ...syntheticContent, serviceTitle: 'Succesor ulterior' },
    },
    activeVersion,
  };
  const commands: RequestInit[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = new URL(input.toString(), window.location.origin).pathname;
      if (path.endsWith('/decision') && init?.method === 'POST') {
        commands.push(init);
        return Response.json(
          commands.length === 1
            ? {
                model: {
                  ...receipt,
                  companyId: '19000000-0000-4000-8000-000000000864',
                },
              }
            : { model: receipt },
          { status: 201 },
        );
      }
      if (path === '/api/contract-models/consulting-ro')
        return Response.json({
          model: commands.length ? later : syntheticModel,
        });
      throw new Error('Unexpected route.');
    }),
  );
  render(
    <ContractModelWorkspace
      actor={syntheticApprover}
      identity={deterministicBrowserIdentity()}
    />,
  );
  fireEvent.change(await screen.findByLabelText('Decision basis'), {
    target: { value: decision.basis },
  });
  fireEvent.click(
    screen.getByRole('button', { name: 'Approve this exact version' }),
  );
  expect(
    await screen.findByText(
      'The result is uncertain. Retry the identical command before making another change.',
    ),
  ).toBeVisible();
  expect(
    screen.getByRole('button', { name: 'Reject this exact version' }),
  ).toBeDisabled();
  expect(screen.getByLabelText('Decision basis')).toHaveValue(decision.basis);
  fireEvent.click(
    screen.getByRole('button', { name: 'Retry identical command' }),
  );
  expect(
    await screen.findByText('Decision for version 1 recorded.'),
  ).toBeVisible();
  expect(
    await screen.findByRole('heading', {
      name: 'Version 2: Succesor ulterior',
    }),
  ).toBeVisible();
  expect(commands).toHaveLength(2);
  expect(commands[0]?.body).toBe(commands[1]?.body);
  expect(new Headers(commands[0]?.headers).get('idempotency-key')).toBe(
    new Headers(commands[1]?.headers).get('idempotency-key'),
  );
});

it('retires protected draft and content when a current model read loses authority', async () => {
  let reads = 0;
  const onActorRevalidated = vi.fn();
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const path = new URL(input.toString(), window.location.origin).pathname;
      if (path === '/api/contract-models/consulting-ro')
        return ++reads === 1
          ? Response.json({ model: syntheticModel })
          : new Response(null, { status: 403 });
      if (path === '/api/access/current-actor')
        return Response.json({
          ...syntheticActor,
          activeCompany: {
            ...syntheticActor.activeCompany,
            contractModelGrants: [],
          },
        });
      throw new Error('Unexpected retirement route.');
    }),
  );
  render(
    <ContractModelWorkspace
      actor={syntheticActor}
      identity={deterministicBrowserIdentity()}
      onActorRevalidated={onActorRevalidated}
    />,
  );
  fireEvent.click(
    await screen.findByRole('button', {
      name: 'Copy current version into a new draft',
    }),
  );
  expect(screen.getByLabelText('Romanian service title')).toHaveValue(
    syntheticContent.serviceTitle,
  );
  fireEvent.click(
    screen.getByRole('button', { name: 'Reload the current model' }),
  );
  expect(
    await screen.findByText('Model access is no longer available.'),
  ).toBeVisible();
  expect(screen.queryByLabelText('Romanian service title')).toBeNull();
  expect(screen.queryByText('Furnizor sintetic')).toBeNull();
  await waitFor(() => expect(onActorRevalidated).toHaveBeenCalledOnce());
});

function LocaleSwitch() {
  const { changeLocale } = useInterfaceLocale();
  return (
    <button type="button" onClick={() => changeLocale('fr')}>
      Switch interface locale
    </button>
  );
}

it('preserves an uncertain literal command across equal-authority Actor and interface locale changes and retires it when the captured grant changes', async () => {
  let writes = 0;
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = new URL(input.toString(), window.location.origin).pathname;
      if (init?.method === 'POST') {
        writes += 1;
        return new Response(null, { status: 503 });
      }
      if (path === '/api/contract-models/consulting-ro')
        return Response.json({ model: syntheticModel });
      throw new Error('Unexpected route.');
    }),
  );
  const identity = deterministicBrowserIdentity();
  const view = render(
    <>
      <LocaleSwitch />
      <ContractModelWorkspace actor={syntheticApprover} identity={identity} />
    </>,
  );
  fireEvent.change(await screen.findByLabelText('Decision basis'), {
    target: { value: ' Literal Romanian decision ' },
  });
  fireEvent.click(
    screen.getByRole('button', { name: 'Approve this exact version' }),
  );
  await screen.findByRole('button', { name: 'Retry identical command' });
  const requestsBeforeActor = vi.mocked(fetch).mock.calls.length;
  view.rerender(
    <>
      <LocaleSwitch />
      <ContractModelWorkspace
        actor={{ ...syntheticApprover }}
        identity={identity}
      />
    </>,
  );
  expect(screen.getByLabelText('Decision basis')).toHaveValue(
    ' Literal Romanian decision ',
  );
  expect(
    screen.getByRole('button', { name: 'Retry identical command' }),
  ).toBeEnabled();
  expect(vi.mocked(fetch).mock.calls).toHaveLength(requestsBeforeActor);
  fireEvent.click(
    screen.getByRole('button', { name: 'Switch interface locale' }),
  );
  expect(screen.getByLabelText('Motif de la décision')).toHaveValue(
    ' Literal Romanian decision ',
  );
  expect(
    screen.getByRole('button', { name: 'Réessayer la commande identique' }),
  ).toBeEnabled();
  expect(writes).toBe(1);
  view.rerender(
    <>
      <LocaleSwitch />
      <ContractModelWorkspace
        actor={{
          ...syntheticApprover,
          activeCompany: {
            ...syntheticApprover.activeCompany,
            id: syntheticModel.companyId,
            displayName: 'Synthetic Company',
            contractModelGrants: [],
          },
        }}
        identity={identity}
      />
    </>,
  );
  expect(screen.queryByText(' Literal Romanian decision ')).toBeNull();
  expect(
    screen.queryByRole('button', { name: 'Réessayer la commande identique' }),
  ).toBeNull();
});

it.each(['Company', 'session', 'grant'] as const)(
  'discards a late protected root after the %s epoch changes',
  async (change) => {
    let release: ((response: Response) => void) | undefined;
    let reads = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        if (++reads === 1)
          return new Promise<Response>((resolve) => {
            release = resolve;
          });
        return Response.json({ model: null });
      }),
    );
    const identity = deterministicBrowserIdentity();
    const view = render(
      <ContractModelWorkspace actor={syntheticApprover} identity={identity} />,
    );
    await waitFor(() => expect(release).toBeDefined());
    const actor =
      change === 'Company'
        ? {
            ...syntheticApprover,
            activeCompany: {
              ...syntheticApprover.activeCompany,
              id: '11000000-0000-4000-8000-000000000864',
              displayName: 'Other synthetic Company',
            },
          }
        : change === 'grant'
          ? {
              ...syntheticApprover,
              activeCompany: {
                ...syntheticApprover.activeCompany,
                id: syntheticModel.companyId,
                displayName: 'Synthetic Company',
                contractModelGrants: [
                  {
                    bundle: 'company_contract_model_approver',
                    assignmentId: '42000000-0000-4000-8000-000000000864',
                    permissionSetVersion: 'v1',
                    permissions: [
                      'commercial.contract.model.read',
                      'commercial.contract.model.decide',
                      'commercial.contract.model.withdraw',
                    ],
                  },
                ],
              },
            }
          : syntheticApprover;
    view.rerender(
      <ContractModelWorkspace
        actor={actor}
        identity={
          change === 'session' ? deterministicBrowserIdentity() : identity
        }
      />,
    );
    await screen.findByText(
      'No consulting Contract model has been configured.',
    );
    await act(async () => {
      release?.(Response.json({ model: syntheticModel }));
    });
    expect(screen.queryByText('Furnizor sintetic')).toBeNull();
    expect(screen.queryByLabelText('Decision basis')).toBeNull();
  },
);

it.each([
  undefined,
  null,
  [],
  'v1',
  [
    {
      bundle: 'company_contract_model_editor',
      assignmentId: '40000000-0000-4000-8000-000000000864',
      permissionSetVersion: 'v2',
      permissions: [
        'commercial.contract.model.read',
        'commercial.contract.model.version.create',
      ],
    },
  ],
  [
    {
      bundle: 'company_contract_model_editor',
      assignmentId: '40000000-0000-4000-8000-000000000864',
      permissionSetVersion: 'v1',
      permissions: ['commercial.contract.model.read'],
    },
  ],
])(
  'fails closed before reading protected content for an absent or unsupported captured grant (%j)',
  (grants) => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    render(
      <ContractModelWorkspace
        actor={{
          ...syntheticActor,
          activeCompany: {
            id: syntheticModel.companyId,
            displayName: 'Synthetic Company',
            contractModelGrants: grants,
          },
        }}
        identity={deterministicBrowserIdentity()}
      />,
    );
    expect(
      screen.queryByRole('heading', { name: 'Consulting Contract model' }),
    ).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  },
);

it.each(['history', 'exact'] as const)(
  'clears a denied %s read immediately and completes shell actor revalidation after its child unmounts',
  async (mode) => {
    let releaseActor: ((response: Response) => void) | undefined;
    const actorReply = new Promise<Response>((resolve) => {
      releaseActor = resolve;
    });
    const onActorRevalidated = vi.fn();
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const path = new URL(input.toString(), window.location.origin).pathname;
        if (path === '/api/contract-models/consulting-ro')
          return Response.json({ model: syntheticModel });
        if (path === '/api/contract-models/consulting-ro/versions')
          return mode === 'history'
            ? new Response(null, { status: 403 })
            : Response.json({
                versions: [
                  {
                    id: syntheticModel.head.id,
                    versionNumber: 1,
                    predecessorVersionId: null,
                    sourceKind: 'ILLUSTRATIVE',
                    serviceTitle: syntheticContent.serviceTitle,
                    ...syntheticAttribution,
                    decision: null,
                  },
                ],
                nextCursor: null,
              });
        if (path.endsWith(syntheticModel.head.id))
          return new Response(null, { status: 403 });
        if (path === '/api/access/current-actor') return actorReply;
        throw new Error('Unexpected revalidation route.');
      }),
    );
    render(
      <ContractModelWorkspace
        actor={syntheticActor}
        identity={deterministicBrowserIdentity()}
        onActorRevalidated={onActorRevalidated}
      />,
    );
    fireEvent.click(
      await screen.findByRole('button', { name: 'Version history' }),
    );
    if (mode === 'exact')
      fireEvent.click(
        await screen.findByRole('button', { name: 'Open version 1' }),
      );
    await screen.findByText('Model access is no longer available.');
    expect(screen.queryByText('Furnizor sintetic')).toBeNull();
    await act(async () => {
      releaseActor?.(
        Response.json({
          ...syntheticActor,
          activeCompany: {
            ...syntheticActor.activeCompany,
            contractModelGrants: [],
          },
        }),
      );
    });
    await waitFor(() => expect(onActorRevalidated).toHaveBeenCalledOnce());
  },
);

it.each(['Company', 'Workspace'] as const)(
  'completes %s rejection callbacks after a denied model-history child is retired',
  async (lost) => {
    let releaseWorkspace: ((response: Response) => void) | undefined;
    const workspaceReply = new Promise<Response>((resolve) => {
      releaseWorkspace = resolve;
    });
    const onActorRevalidated = vi.fn(),
      onCompanyContextRejected = vi.fn(),
      onWorkspaceAccessRejected = vi.fn();
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const path = new URL(input.toString(), window.location.origin).pathname;
        if (path === '/api/contract-models/consulting-ro')
          return Response.json({ model: syntheticModel });
        if (path === '/api/contract-models/consulting-ro/versions')
          return new Response(null, { status: 403 });
        if (path === '/api/access/current-actor')
          return new Headers(init?.headers).has('x-company-context-id')
            ? new Response(null, { status: 403 })
            : workspaceReply;
        throw new Error('Unexpected access callback route.');
      }),
    );
    render(
      <ContractModelWorkspace
        actor={syntheticActor}
        identity={deterministicBrowserIdentity()}
        onActorRevalidated={onActorRevalidated}
        onCompanyContextRejected={onCompanyContextRejected}
        onWorkspaceAccessRejected={onWorkspaceAccessRejected}
      />,
    );
    fireEvent.click(
      await screen.findByRole('button', { name: 'Version history' }),
    );
    await screen.findByText('Model access is no longer available.');
    await act(async () => {
      releaseWorkspace?.(
        lost === 'Workspace'
          ? new Response(null, { status: 403 })
          : Response.json({ ...syntheticActor, activeCompany: undefined }),
      );
    });
    await waitFor(() =>
      expect(
        lost === 'Workspace'
          ? onWorkspaceAccessRejected
          : onCompanyContextRejected,
      ).toHaveBeenCalledOnce(),
    );
    if (lost === 'Company') {
      expect(onCompanyContextRejected).toHaveBeenCalledWith(
        syntheticModel.companyId,
      );
      expect(onActorRevalidated).toHaveBeenCalledOnce();
    }
    expect(screen.queryByText('Furnizor sintetic')).toBeNull();
  },
);

it('retires the independent access revalidation when a denied history read is followed by a Company switch', async () => {
  let releaseActor: ((response: Response) => void) | undefined;
  const actorReply = new Promise<Response>((resolve) => {
    releaseActor = resolve;
  });
  const onActorRevalidated = vi.fn();
  const otherCompany = '11000000-0000-4000-8000-000000000864';
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = new URL(input.toString(), window.location.origin).pathname;
      if (path === '/api/contract-models/consulting-ro')
        return Response.json({
          model:
            new Headers(init?.headers).get('x-company-context-id') ===
            otherCompany
              ? null
              : syntheticModel,
        });
      if (path === '/api/contract-models/consulting-ro/versions')
        return new Response(null, { status: 403 });
      if (path === '/api/access/current-actor') return actorReply;
      throw new Error('Unexpected access retirement route.');
    }),
  );
  const identity = deterministicBrowserIdentity();
  const view = render(
    <ContractModelWorkspace
      actor={syntheticActor}
      identity={identity}
      onActorRevalidated={onActorRevalidated}
    />,
  );
  fireEvent.click(
    await screen.findByRole('button', { name: 'Version history' }),
  );
  await screen.findByText('Model access is no longer available.');
  view.rerender(
    <ContractModelWorkspace
      actor={{
        ...syntheticActor,
        activeCompany: {
          ...syntheticActor.activeCompany,
          id: otherCompany,
          displayName: 'Other synthetic Company',
        },
      }}
      identity={identity}
      onActorRevalidated={onActorRevalidated}
    />,
  );
  await screen.findByText('No consulting Contract model has been configured.');
  await act(async () => {
    releaseActor?.(Response.json(syntheticActor));
  });
  expect(onActorRevalidated).not.toHaveBeenCalled();
  expect(screen.queryByText('Furnizor sintetic')).toBeNull();
});

it('keeps the exact retry owner when a cancelled earlier history response arrives late and retires it on a current grant change', async () => {
  let releaseHistory: ((value: Response) => void) | undefined;
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = new URL(input.toString(), window.location.origin).pathname;
      if (path === '/api/contract-models/consulting-ro')
        return Response.json({ model: syntheticModel });
      if (path === '/api/contract-models/consulting-ro/versions')
        return new Promise<Response>((resolve) => {
          releaseHistory = resolve;
        });
      if (init?.method === 'POST') return Response.json({}, { status: 503 });
      if (path === '/api/access/current-actor')
        return Response.json({}, { status: 503 });
      throw new Error('Unexpected retirement route.');
    }),
  );
  const identity = deterministicBrowserIdentity();
  const { rerender } = render(
    <ContractModelWorkspace actor={syntheticApprover} identity={identity} />,
  );
  fireEvent.click(
    await screen.findByRole('button', { name: 'Version history' }),
  );
  await waitFor(() => expect(releaseHistory).toBeTypeOf('function'));
  fireEvent.change(screen.getByLabelText('Decision basis'), {
    target: { value: 'Private exact review basis' },
  });
  fireEvent.click(
    screen.getByRole('button', { name: 'Approve this exact version' }),
  );
  await screen.findByRole('button', { name: 'Retry identical command' });
  await act(async () => {
    releaseHistory?.(Response.json({}, { status: 403 }));
  });
  expect(
    screen.getByRole('button', { name: 'Retry identical command' }),
  ).toBeVisible();
  expect(
    screen.getByRole('button', { name: 'Version history' }),
  ).toBeDisabled();
  expect(
    screen.getByRole('button', { name: 'Approve this exact version' }),
  ).toBeDisabled();
  rerender(
    <ContractModelWorkspace
      actor={{
        ...syntheticApprover,
        activeCompany: {
          ...syntheticApprover.activeCompany,
          id: syntheticModel.companyId,
          displayName: 'Synthetic Company',
          contractModelGrants: [],
        },
      }}
      identity={identity}
    />,
  );
  expect(
    screen.queryByRole('button', { name: 'Retry identical command' }),
  ).toBeNull();
  expect(
    screen.queryByText(syntheticContent.providerDetails, { exact: true }),
  ).toBeNull();
});

it('retires delayed history recovery when a newer complete Actor keeps the same model authority', async () => {
  let releaseActor: ((response: Response) => void) | undefined;
  const actorReply = new Promise<Response>((resolve) => {
    releaseActor = resolve;
  });
  const onActorRevalidated = vi.fn();
  let recoverySignal: AbortSignal | null | undefined;
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = new URL(input.toString(), window.location.origin).pathname;
      if (path === '/api/contract-models/consulting-ro')
        return Response.json({ model: syntheticModel });
      if (path === '/api/contract-models/consulting-ro/versions')
        return new Response(null, { status: 403 });
      if (path === '/api/access/current-actor') {
        recoverySignal = init?.signal;
        return actorReply;
      }
      throw new Error('Unexpected Actor replacement route.');
    }),
  );
  const identity = deterministicBrowserIdentity();
  const view = render(
    <ContractModelWorkspace
      actor={syntheticActor}
      identity={identity}
      onActorRevalidated={onActorRevalidated}
    />,
  );
  fireEvent.click(
    await screen.findByRole('button', { name: 'Version history' }),
  );
  await screen.findByText('Model access is no longer available.');
  await waitFor(() => expect(recoverySignal).toBeDefined());
  view.rerender(
    <ContractModelWorkspace
      actor={{ ...syntheticActor }}
      identity={identity}
      onActorRevalidated={onActorRevalidated}
    />,
  );
  expect(recoverySignal?.aborted).toBe(true);
  await act(async () => {
    releaseActor?.(Response.json(syntheticActor));
  });
  expect(onActorRevalidated).not.toHaveBeenCalled();
  expect(screen.queryByText('Furnizor sintetic')).toBeNull();
  expect(
    screen.getByRole('button', { name: 'Reload the current model' }),
  ).toBeEnabled();
});

it.each(['root', 'history', 'command'] as const)(
  'Refresh retires independent recovery after a denied %s before starting a fresh root',
  async (mode) => {
    let releaseActor: ((response: Response) => void) | undefined;
    const actorReply = new Promise<Response>((resolve) => {
      releaseActor = resolve;
    });
    let recoverySignal: AbortSignal | null | undefined;
    let rootReads = 0;
    const onActorRevalidated = vi.fn();
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const path = new URL(input.toString(), window.location.origin).pathname;
        if (init?.method === 'POST') return new Response(null, { status: 403 });
        if (path === '/api/contract-models/consulting-ro') {
          rootReads += 1;
          return mode === 'root' && rootReads === 1
            ? new Response(null, { status: 403 })
            : Response.json({ model: syntheticModel });
        }
        if (path === '/api/contract-models/consulting-ro/versions')
          return new Response(null, { status: 403 });
        if (path === '/api/access/current-actor') {
          recoverySignal = init?.signal;
          return actorReply;
        }
        throw new Error('Unexpected denied Refresh route.');
      }),
    );
    render(
      <ContractModelWorkspace
        actor={syntheticApprover}
        identity={deterministicBrowserIdentity()}
        onActorRevalidated={onActorRevalidated}
      />,
    );
    if (mode === 'history')
      fireEvent.click(
        await screen.findByRole('button', { name: 'Version history' }),
      );
    if (mode === 'command') {
      fireEvent.change(await screen.findByLabelText('Decision basis'), {
        target: { value: 'Literal decision' },
      });
      fireEvent.click(
        screen.getByRole('button', { name: 'Approve this exact version' }),
      );
    }
    await screen.findByText('Model access is no longer available.');
    await waitFor(() => expect(recoverySignal).toBeDefined());
    expect(recoverySignal?.aborted).toBe(false);
    expect(screen.queryByLabelText('Decision basis')).toBeNull();
    fireEvent.click(
      screen.getByRole('button', { name: 'Reload the current model' }),
    );
    expect(recoverySignal?.aborted).toBe(true);
    expect(await screen.findByLabelText('Decision basis')).toHaveValue('');
    expect(rootReads).toBe(2);
    await act(async () => {
      releaseActor?.(Response.json(syntheticActor));
    });
    expect(onActorRevalidated).not.toHaveBeenCalled();
    expect(
      screen.queryByText('Model access is no longer available.'),
    ).toBeNull();
  },
);
