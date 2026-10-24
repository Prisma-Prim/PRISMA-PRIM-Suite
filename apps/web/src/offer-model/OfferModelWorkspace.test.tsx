import { afterEach, expect, it, vi } from 'vitest';
import { act, fireEvent, waitFor } from '@testing-library/react';
import { render, screen } from '../test/render-with-interface-locale';
import { deterministicBrowserIdentity } from '../access-composition';
import { useInterfaceLocale } from '../localization/interface-locale';
import { OfferModelWorkspace } from './OfferModelWorkspace';
import {
  syntheticActor,
  syntheticContent,
  syntheticModel,
  syntheticApprover,
  syntheticAttribution,
} from './offer-model.fixture';

afterEach(() => vi.unstubAllGlobals());

it('submits complete literal human-entered content and reloads the current pending version', async () => {
  let created = false;
  const commands: RequestInit[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = new URL(input.toString(), window.location.origin).pathname;
      if (
        path === '/api/offer-models/consulting-ro/versions' &&
        init?.method === 'POST'
      ) {
        commands.push(init);
        created = true;
        return Response.json({ model: syntheticModel }, { status: 201 });
      }
      if (path === '/api/offer-models/consulting-ro')
        return Response.json({ model: created ? syntheticModel : null });
      if (path === '/api/offer-models/consulting-ro/versions')
        return Response.json({ versions: [], nextCursor: null });
      throw new Error('Unexpected model route.');
    }),
  );
  render(
    <OfferModelWorkspace
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
    'Issuer legal name': syntheticContent.issuer.legalName,
    'Issuer tax identifier': syntheticContent.issuer.taxId,
    'Issuer legal address': syntheticContent.issuer.legalAddress,
    'Romanian service title': syntheticContent.serviceTitle,
    'Framework name 1': 'Cadru demonstrativ',
    'Framework edition 1': 'Ediția 1',
    Introduction: syntheticContent.sections.introduction,
    'Provider profile': syntheticContent.sections.providerProfile,
    Scope: syntheticContent.sections.scope,
    Objectives: syntheticContent.sections.objectives,
    'Assessment guidance': syntheticContent.sections.assessmentGuidance,
    Methodology: syntheticContent.sections.methodology,
    Deliverables: syntheticContent.sections.deliverables,
    'Realization conditions': syntheticContent.sections.realizationConditions,
    'Payment conditions': syntheticContent.sections.paymentConditions,
    'Closing rationale': syntheticContent.sections.closingRationale,
  };
  for (const [label, value] of Object.entries(fields))
    fireEvent.change(screen.getByLabelText(label, { exact: true }), {
      target: { value },
    });
  for (let number = 1; number <= 18; number++) {
    for (const [label, value] of [
      ['Stage title', `Etapă ${number}`],
      ['Planned activity', `Activitate ${number}`],
      ['Intended result', `Rezultat ${number}`],
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
    screen.getByRole('heading', { name: 'Introduction' }).nextElementSibling
      ?.textContent,
  ).toBe(syntheticContent.sections.introduction);
  expect(document.querySelector('script')).toBeNull();
});

it.each(['APPROVE', 'REJECT'] as const)(
  'records an explicit %s decision for the reviewed exact version without editor authority',
  async (outcome) => {
    let decided = false;
    const commands: RequestInit[] = [];
    const decision = {
      id: '70000000-0000-4000-8000-000000000847',
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
        if (path === '/api/offer-models/consulting-ro')
          return Response.json({ model: decided ? result : syntheticModel });
        if (path === '/api/offer-models/consulting-ro/versions')
          return Response.json({ versions: [], nextCursor: null });
        throw new Error('Unexpected route.');
      }),
    );
    render(
      <OfferModelWorkspace
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

it('withdraws the exact older active approval while preserving a pending successor and historical decision', async () => {
  const approved = {
    ...syntheticModel.head,
    decision: {
      id: '70000000-0000-4000-8000-000000000847',
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
      id: '61000000-0000-4000-8000-000000000847',
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
      if (path === `/api/offer-models/consulting-ro/versions/${approved.id}`)
        return Response.json({
          version: {
            ...approved,
            withdrawal: withdrawn
              ? {
                  id: '71000000-0000-4000-8000-000000000847',
                  reason,
                  ...syntheticAttribution,
                }
              : null,
          },
          currentSelection: { activeVersionId: withdrawn ? null : approved.id },
        });
      if (path === '/api/offer-models/consulting-ro')
        return Response.json({
          model: withdrawn
            ? { ...pending, revision: 4, activeVersion: null }
            : pending,
        });
      if (path === '/api/offer-models/consulting-ro/versions')
        return Response.json({ versions: [], nextCursor: null });
      throw new Error('Unexpected route.');
    }),
  );
  render(
    <OfferModelWorkspace
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
  expect(
    await screen.findByText(
      'No approved version is currently available for new use.',
    ),
  ).toBeVisible();
  expect(
    screen.getByRole('heading', {
      name: 'Version 2: Consultanță demonstrativă',
    }),
  ).toBeVisible();
  expect(commands).toHaveLength(1);
  expect(commands[0]?.path).toBe(
    `/api/offer-models/consulting-ro/versions/${approved.id}/withdrawal`,
  );
  expect(commands[0]?.init.body).toBe(
    JSON.stringify({ expectedModelRevision: 3, versionNumber: 1, reason }),
  );
});

it('opens exact historical content and its original approval separately from current selection', async () => {
  const current = {
    ...syntheticModel,
    revision: 3,
    head: {
      ...syntheticModel.head,
      id: '61000000-0000-4000-8000-000000000847',
      versionNumber: 2,
      predecessorVersionId: syntheticModel.head.id,
      content: { ...syntheticContent, serviceTitle: 'Succesor demonstrativ' },
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
      id: '70000000-0000-4000-8000-000000000847',
      outcome: 'APPROVE',
      basis: ' Original independent review basis ',
      ...syntheticAttribution,
    },
  };
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const path = new URL(input.toString(), window.location.origin).pathname;
      if (path === '/api/offer-models/consulting-ro')
        return Response.json({ model: current });
      if (path === '/api/offer-models/consulting-ro/versions')
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
      if (path === `/api/offer-models/consulting-ro/versions/${original.id}`)
        return Response.json({
          version: original,
          currentSelection: { activeVersionId: original.id },
        });
      throw new Error('Unexpected history route.');
    }),
  );
  render(
    <OfferModelWorkspace
      actor={syntheticActor}
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
      name: 'Version 1: Consultanță demonstrativă',
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
});

it('retries a malformed successful decision reply literally and then rereads current selection instead of displaying the historical receipt as current', async () => {
  const decision = {
    id: '70000000-0000-4000-8000-000000000847',
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
      id: '61000000-0000-4000-8000-000000000847',
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
                  companyId: '19000000-0000-4000-8000-000000000847',
                },
              }
            : { model: receipt },
          { status: 201 },
        );
      }
      if (path === '/api/offer-models/consulting-ro')
        return Response.json({
          model: commands.length ? later : syntheticModel,
        });
      throw new Error('Unexpected route.');
    }),
  );
  render(
    <OfferModelWorkspace
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
      if (path === '/api/offer-models/consulting-ro')
        return ++reads === 1
          ? Response.json({ model: syntheticModel })
          : new Response(null, { status: 403 });
      if (path === '/api/access/current-actor')
        return Response.json({
          ...syntheticActor,
          activeCompany: {
            ...syntheticActor.activeCompany,
            offerModelGrants: [],
          },
        });
      throw new Error('Unexpected retirement route.');
    }),
  );
  render(
    <OfferModelWorkspace
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
  expect(screen.queryByText('Furnizor demonstrativ')).toBeNull();
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

it('preserves an uncertain literal command across an interface locale change and retires it when the captured grant changes', async () => {
  let writes = 0;
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = new URL(input.toString(), window.location.origin).pathname;
      if (init?.method === 'POST') {
        writes += 1;
        return new Response(null, { status: 503 });
      }
      if (path === '/api/offer-models/consulting-ro')
        return Response.json({ model: syntheticModel });
      throw new Error('Unexpected route.');
    }),
  );
  const identity = deterministicBrowserIdentity();
  const view = render(
    <>
      <LocaleSwitch />
      <OfferModelWorkspace actor={syntheticApprover} identity={identity} />
    </>,
  );
  fireEvent.change(await screen.findByLabelText('Decision basis'), {
    target: { value: ' Literal Romanian decision ' },
  });
  fireEvent.click(
    screen.getByRole('button', { name: 'Approve this exact version' }),
  );
  await screen.findByRole('button', { name: 'Retry identical command' });
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
      <OfferModelWorkspace
        actor={{
          ...syntheticApprover,
          activeCompany: {
            ...syntheticApprover.activeCompany,
            id: syntheticModel.companyId,
            displayName: 'Synthetic Company',
            offerModelGrants: [],
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
      <OfferModelWorkspace actor={syntheticApprover} identity={identity} />,
    );
    await waitFor(() => expect(release).toBeDefined());
    const actor =
      change === 'Company'
        ? {
            ...syntheticApprover,
            activeCompany: {
              ...syntheticApprover.activeCompany,
              id: '11000000-0000-4000-8000-000000000847',
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
                offerModelGrants: [
                  {
                    bundle: 'company_offer_model_approver',
                    assignmentId: '42000000-0000-4000-8000-000000000847',
                    permissionSetVersion: 'v1',
                    permissions: [
                      'commercial.offer.model.read',
                      'commercial.offer.model.decide',
                      'commercial.offer.model.withdraw',
                    ],
                  },
                ],
              },
            }
          : syntheticApprover;
    view.rerender(
      <OfferModelWorkspace
        actor={actor}
        identity={
          change === 'session' ? deterministicBrowserIdentity() : identity
        }
      />,
    );
    await screen.findByText('No consulting Offer model has been configured.');
    await act(async () => {
      release?.(Response.json({ model: syntheticModel }));
    });
    expect(screen.queryByText('Furnizor demonstrativ')).toBeNull();
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
      bundle: 'company_offer_model_editor',
      assignmentId: '40000000-0000-4000-8000-000000000847',
      permissionSetVersion: 'v2',
      permissions: [
        'commercial.offer.model.read',
        'commercial.offer.model.version.create',
      ],
    },
  ],
  [
    {
      bundle: 'company_offer_model_editor',
      assignmentId: '40000000-0000-4000-8000-000000000847',
      permissionSetVersion: 'v1',
      permissions: ['commercial.offer.model.read'],
    },
  ],
])(
  'fails closed before reading protected content for an absent or unsupported captured grant (%j)',
  (grants) => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    render(
      <OfferModelWorkspace
        actor={{
          ...syntheticActor,
          activeCompany: {
            id: syntheticModel.companyId,
            displayName: 'Synthetic Company',
            offerModelGrants: grants,
          },
        }}
        identity={deterministicBrowserIdentity()}
      />,
    );
    expect(
      screen.queryByRole('heading', { name: 'Consulting Offer model' }),
    ).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  },
);
