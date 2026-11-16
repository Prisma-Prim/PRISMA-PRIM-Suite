import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '../test/render-with-interface-locale';
import { afterEach, expect, it, vi } from 'vitest';
import { startTransition, Suspense, useState } from 'react';
import { deterministicBrowserIdentity } from '../access-composition';
import {
  withCompanyGrants,
  withoutCompanyGrants,
} from '../access/company-grants.test-fixture';
import {
  contractLocaleActor,
  contractLocaleIds,
  contractLocaleLiteral,
  contractLocaleRecord,
  readContractLocaleFixture,
} from '../test/contract-localization-fixture';
import { ContractPanel } from './ContractPanel';
import { ProjectContracts } from './ProjectContracts';

afterEach(() => vi.restoreAllMocks());

it('retires an older Actor recovery without restarting an independently live Contract read', async () => {
  const currentActor = contractLocaleActor();
  const company = currentActor.activeCompany;
  if (!company) throw new Error('Expected the synthetic Contract Company.');
  const oldActor = {
    ...currentActor,
    activeCompany: {
      ...company,
      grants: withCompanyGrants(company.grants, {
        bundle: 'company_document_content_reader',
        version: 'v1',
        assignmentId: 'content-reader-ownership',
      }),
    },
  };
  const identity = deterministicBrowserIdentity({
    'x-test-external-subject': 'contract-ownership',
  });
  const onActorRevalidated = vi.fn();
  const onCompanyContextRejected = vi.fn();
  const onWorkspaceAccessRejected = vi.fn();
  const recoveries: ((response: Response) => void)[] = [];
  let contractReads = 0;
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
    const path = new URL(String(input), 'http://localhost').pathname;
    if (path === '/api/access/current-actor')
      return new Promise<Response>((resolve) => recoveries.push(resolve));
    if (
      path === `/api/contracts/opportunities/${contractLocaleIds.opportunity}`
    ) {
      contractReads += 1;
      return Response.json({}, { status: 403 });
    }
    throw new Error(`Unexpected native HTTP path: ${path}`);
  });
  const props = {
    identity,
    opportunityId: contractLocaleIds.opportunity,
    onActorRevalidated,
    onCompanyContextRejected,
    onWorkspaceAccessRejected,
  };
  const view = render(<ContractPanel {...props} actor={oldActor} />);
  await waitFor(() => expect(recoveries).toHaveLength(1));
  view.rerender(<ContractPanel {...props} actor={currentActor} />);
  await act(async () => recoveries[0]?.(Response.json(oldActor)));
  await screen.findByRole('alert');
  expect(contractReads).toBe(1);
  expect(onActorRevalidated).not.toHaveBeenCalled();
  expect(onCompanyContextRejected).not.toHaveBeenCalled();
  expect(onWorkspaceAccessRejected).not.toHaveBeenCalled();

  fireEvent.click(screen.getByRole('button', { name: 'Reload Contract' }));
  await waitFor(() => expect(recoveries).toHaveLength(2));
  await act(async () => recoveries[1]?.(Response.json(currentActor)));
  await waitFor(() =>
    expect(onActorRevalidated).toHaveBeenCalledExactlyOnceWith(currentActor),
  );
});

it('keeps the independent linked Contract read when unrelated content authority changes', async () => {
  const base = contractLocaleActor();
  const company = base.activeCompany;
  if (!company) throw new Error('Expected the synthetic Contract Company.');
  const actor = {
    ...base,
    activeCompany: {
      ...company,
      grants: withCompanyGrants(company.grants, {
        bundle: 'company_project_access',
        version: 'v1',
        assignmentId: 'project-contract-read',
      }),
    },
  };
  const replacement = {
    ...actor,
    activeCompany: {
      ...actor.activeCompany,
      grants: withCompanyGrants(actor.activeCompany.grants, {
        bundle: 'company_document_content_reader',
        version: 'v1',
        assignmentId: 'unrelated-content-read',
      }),
    },
  };
  const identity = deterministicBrowserIdentity({
    'x-test-external-subject': 'linked-contract-owner',
  });
  const onOpenContract = vi.fn();
  const reads: {
    signal: AbortSignal | null | undefined;
    resolve: (value: Response) => void;
  }[] = [];
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    if (
      new URL(String(input), 'http://localhost').pathname !==
      '/api/contracts/projects/90000000-0000-4000-8000-000000000657'
    )
      throw new Error('Unexpected linked Contract HTTP path.');
    return new Promise<Response>((resolve) =>
      reads.push({ signal: init?.signal, resolve }),
    );
  });
  const props = {
    identity,
    projectId: '90000000-0000-4000-8000-000000000657',
    onOpenContract,
  };
  const view = render(<ProjectContracts {...props} actor={actor} />);
  await waitFor(() => expect(reads).toHaveLength(1));
  const original = reads[0];
  if (!original?.signal)
    throw new Error('Expected the native linked Contract read.');
  view.rerender(<ProjectContracts {...props} actor={replacement} />);
  expect(original.signal.aborted).toBe(false);
  expect(reads).toHaveLength(1);
  await act(async () =>
    original.resolve(
      Response.json({
        items: [
          {
            id: contractLocaleIds.contract,
            opportunityId: contractLocaleIds.opportunity,
            clientRequestId: contractLocaleIds.request,
            illustrativeReference: 1,
            kind: 'CONTRACT',
            provisional: true,
            linkedAt: '2026-10-01T10:00:00.000Z',
          },
        ],
      }),
    ),
  );
  fireEvent.click(await screen.findByRole('button', { name: 'Open Contract' }));
  expect(onOpenContract).toHaveBeenCalledExactlyOnceWith(
    contractLocaleIds.request,
  );
});

it('permanently retires held Contract entry replies across captured read grant A-to-B-to-A', async () => {
  const actor = contractLocaleActor();
  const company = actor.activeCompany;
  if (!company) throw new Error('Expected the synthetic Contract Company.');
  const replacement = {
    ...actor,
    activeCompany: {
      ...company,
      grants: withCompanyGrants(company.grants, {
        bundle: 'company_contract_preparer',
        version: 'v1',
        assignmentId: 'replaced-contract-reader',
      }),
    },
  };
  const identity = deterministicBrowserIdentity({
    'x-test-external-subject': 'contract-reader-aba',
  });
  const reads: {
    signal: AbortSignal | null | undefined;
    resolve: (value: Response) => void;
  }[] = [];
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const path = new URL(String(input), 'http://localhost').pathname;
    if (
      path === `/api/contracts/opportunities/${contractLocaleIds.opportunity}`
    )
      return new Promise<Response>((resolve) =>
        reads.push({ signal: init?.signal, resolve }),
      );
    return Response.json(
      readContractLocaleFixture({ path, hasCompany: true, recorded: false }),
    );
  });
  const props = {
    identity,
    opportunityId: contractLocaleIds.opportunity,
    onCompanyContextRejected: () => undefined,
  };
  const view = render(<ContractPanel {...props} actor={actor} />);
  await waitFor(() => expect(reads).toHaveLength(1));
  const original = reads[0];
  if (!original?.signal)
    throw new Error('Expected a native owned Contract read.');
  view.rerender(<ContractPanel {...props} actor={replacement} />);
  await act(async () => {
    await Promise.resolve();
  });
  view.rerender(<ContractPanel {...props} actor={actor} />);
  await act(async () =>
    original.resolve(Response.json({ contract: null, precontract: null })),
  );
  expect(original.signal.aborted).toBe(true);
  expect(
    screen.queryByRole('textbox', { name: 'Special conditions' }),
  ).not.toBeInTheDocument();
  await waitFor(() => expect(reads).toHaveLength(3));
  const intermediate = reads[1];
  const current = reads[2];
  if (!intermediate?.signal || !current?.signal)
    throw new Error('Expected both later native read owners.');
  expect(intermediate.signal.aborted).toBe(true);
  expect(current.signal.aborted).toBe(false);
  await act(async () =>
    intermediate.resolve(Response.json({ contract: null, precontract: null })),
  );
  expect(
    screen.queryByRole('textbox', { name: 'Special conditions' }),
  ).not.toBeInTheDocument();
  await act(async () =>
    current.resolve(Response.json({ contract: null, precontract: null })),
  );
  expect(
    await screen.findByRole('textbox', { name: 'Special conditions' }),
  ).toHaveValue('');
});

it('keeps an uncertain accepted-Offer Contract intent when unrelated pricing authority changes', async () => {
  const actor = contractLocaleActor();
  const company = actor.activeCompany;
  if (!company) throw new Error('Expected the synthetic Contract Company.');
  const nextActor = {
    ...actor,
    activeCompany: {
      ...company,
      grants: withoutCompanyGrants(company.grants, 'company_pricing_user'),
    },
  };
  const identity = deterministicBrowserIdentity({
    'x-test-external-subject': 'contract-independent-authority',
  });
  const calls: string[] = [];
  const posts: {
    body: BodyInit | null | undefined;
    key: string | null;
    path: string;
  }[] = [];
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const path = new URL(String(input), 'http://localhost').pathname;
    calls.push(path);
    if (init?.method === 'POST') {
      posts.push({
        path,
        body: init.body,
        key: new Headers(init.headers).get('idempotency-key'),
      });
      return posts.length === 1
        ? Response.json({}, { status: 503 })
        : Response.json(contractLocaleRecord(), { status: 201 });
    }
    return Response.json(
      readContractLocaleFixture({
        path,
        hasCompany: true,
        recorded: posts.length > 1,
      }),
    );
  });
  const props = {
    identity,
    opportunityId: contractLocaleIds.opportunity,
    onCompanyContextRejected: () => undefined,
  };
  const view = render(<ContractPanel {...props} actor={actor} />);
  const field = await screen.findByRole('textbox', {
    name: 'Special conditions',
  });
  fireEvent.change(field, { target: { value: contractLocaleLiteral } });
  fireEvent.change(screen.getByLabelText('Term start'), {
    target: { value: '2028-02-29' },
  });
  fireEvent.change(screen.getByLabelText('Term end'), {
    target: { value: '2028-03-01' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Create Contract' }));
  await screen.findByText(
    'The result is uncertain. Retry the same Contract command.',
  );
  const before = calls.length;
  view.rerender(<ContractPanel {...props} actor={nextActor} />);
  expect(
    await screen.findByRole('textbox', { name: 'Special conditions' }),
  ).toBe(field);
  expect(field).toHaveValue(contractLocaleLiteral);
  expect(field).toBeDisabled();
  expect(calls).toHaveLength(before);
  fireEvent.click(
    screen.getByRole('button', { name: 'Retry the same Contract command' }),
  );
  await screen.findByText('Contract created.');
  expect(posts).toHaveLength(2);
  expect(posts[1]).toEqual(posts[0]);
});

it('retains the displayed Contract draft when an uncommitted session replacement is abandoned', async () => {
  const actor = contractLocaleActor();
  const identity = deterministicBrowserIdentity({
    'x-test-external-subject': 'committed-contract',
  });
  const replacement = deterministicBrowserIdentity({
    'x-test-external-subject': 'uncommitted-contract',
  });
  let attemptedReplacement = false;
  const pending = new Promise<never>(() => undefined);
  function PendingReplacement(): never {
    attemptedReplacement = true;
    throw pending;
  }
  const calls: string[] = [];
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
    const path = new URL(String(input), 'http://localhost').pathname;
    calls.push(path);
    return Response.json(
      readContractLocaleFixture({ path, hasCompany: true, recorded: false }),
    );
  });
  function Frame() {
    const [selection, setSelection] = useState({ identity, suspended: false });
    return (
      <>
        <button
          onClick={() =>
            startTransition(() =>
              setSelection({ identity: replacement, suspended: true }),
            )
          }
        >
          Consider another session
        </button>
        <button onClick={() => setSelection({ identity, suspended: false })}>
          Keep the displayed session
        </button>
        <Suspense fallback={<p>Pending session</p>}>
          <ContractPanel
            actor={actor}
            identity={selection.identity}
            opportunityId={contractLocaleIds.opportunity}
            onCompanyContextRejected={() => undefined}
          />
          {selection.suspended && <PendingReplacement />}
        </Suspense>
      </>
    );
  }
  render(<Frame />);
  const field = await screen.findByRole('textbox', {
    name: 'Special conditions',
  });
  const literal = '  Keep this exact draft — șț {source}\nSecond line  ';
  fireEvent.change(field, { target: { value: literal } });
  const before = calls.length;
  fireEvent.click(
    screen.getByRole('button', { name: 'Consider another session' }),
  );
  await waitFor(() => expect(attemptedReplacement).toBe(true));
  expect(field).toBeVisible();
  fireEvent.click(
    screen.getByRole('button', { name: 'Keep the displayed session' }),
  );
  expect(
    await screen.findByRole('textbox', { name: 'Special conditions' }),
  ).toBe(field);
  expect(field).toHaveValue(literal);
  expect(calls).toHaveLength(before);
});

it('admits one exact Contract decision when its displayed control is activated twice before token acquisition completes', async () => {
  const actor = contractLocaleActor();
  const company = actor.activeCompany;
  if (!company) throw new Error('Expected the synthetic Contract Company.');
  actor.activeCompany = {
    ...company,
    grants: withCompanyGrants(company.grants, {
      bundle: 'company_contract_approver',
      version: 'v1',
      assignmentId: 'contract-approver-ownership',
    }),
  };
  let holdToken = false;
  const tokens: ((token: string | null) => void)[] = [];
  const identity = {
    ...deterministicBrowserIdentity(),
    getToken: async () =>
      holdToken
        ? new Promise<string | null>((resolve) => tokens.push(resolve))
        : null,
  };
  const posts: {
    path: string;
    body: BodyInit | null | undefined;
    key: string | null;
  }[] = [];
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const path = new URL(String(input), 'http://localhost').pathname;
    if (init?.method === 'POST') {
      posts.push({
        path,
        body: init.body,
        key: new Headers(init.headers).get('idempotency-key'),
      });
      return Response.json({}, { status: 503 });
    }
    if (path.endsWith('/quality-checks'))
      return Response.json({ items: [], nextCursor: null });
    return Response.json(
      readContractLocaleFixture({ path, hasCompany: true, recorded: true }),
    );
  });
  render(
    <ContractPanel
      actor={actor}
      identity={identity}
      opportunityId={contractLocaleIds.opportunity}
      onCompanyContextRejected={() => undefined}
    />,
  );
  const approve = await screen.findByRole('button', {
    name: 'Approve exact Contract Version',
  });
  expect(approve).toBeEnabled();
  holdToken = true;
  act(() => {
    approve.click();
    approve.click();
  });
  await waitFor(() => expect(tokens.length).toBeGreaterThan(0));
  holdToken = false;
  await act(async () => {
    for (const resolve of tokens) resolve(null);
  });
  await screen.findByText(
    'The outcome is uncertain. Retry sends exactly the same decision and key.',
  );
  expect(posts).toHaveLength(1);
  expect(posts[0]).toEqual({
    path: `/api/contracts/opportunities/${contractLocaleIds.opportunity}/versions/${contractLocaleIds.version}/approve`,
    body: JSON.stringify({
      expectedContractRevision: 1,
      acknowledgedWarningCodes: [],
    }),
    key: expect.any(String),
  });
});

it('permanently retires the entry Offer source across its consumed grant A-to-B-to-A', async () => {
  const actor = contractLocaleActor();
  const company = actor.activeCompany;
  if (!company) throw new Error('Expected the source Company.');
  const replacement = {
    ...actor,
    activeCompany: {
      ...company,
      grants: withCompanyGrants(company.grants, {
        bundle: 'company_offer_preparer',
        version: 'v1',
        assignmentId: 'entry-offer-replacement',
      }),
    },
  };
  const identity = deterministicBrowserIdentity();
  const sources: {
    signal: AbortSignal | null | undefined;
    resolve: (value: Response) => void;
  }[] = [];
  const path = `/api/offers/opportunities/${contractLocaleIds.opportunity}`;
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const requested = new URL(String(input), 'http://localhost').pathname;
    if (requested === path)
      return new Promise<Response>((resolve) =>
        sources.push({ signal: init?.signal, resolve }),
      );
    if (
      requested ===
      `/api/contracts/opportunities/${contractLocaleIds.opportunity}`
    )
      return Response.json({ contract: null, precontract: null });
    return Response.json(
      readContractLocaleFixture({
        path: requested,
        hasCompany: true,
        recorded: false,
      }),
    );
  });
  const props = {
    identity,
    opportunityId: contractLocaleIds.opportunity,
    onCompanyContextRejected: () => undefined,
  };
  const view = render(<ContractPanel {...props} actor={actor} />);
  await waitFor(() => expect(sources).toHaveLength(1));
  const original = sources[0];
  if (!original?.signal)
    throw new Error('Missing the first Offer source read.');
  view.rerender(<ContractPanel {...props} actor={replacement} />);
  expect(original.signal.aborted).toBe(true);
  await waitFor(() => expect(sources).toHaveLength(2));
  view.rerender(<ContractPanel {...props} actor={actor} />);
  await waitFor(() => expect(sources).toHaveLength(3));
  const intermediate = sources[1],
    current = sources[2];
  if (!intermediate?.signal || !current?.signal)
    throw new Error('Missing replacement source owners.');
  expect(intermediate.signal.aborted).toBe(true);
  expect(current.signal.aborted).toBe(false);
  const source = () =>
    Response.json(
      readContractLocaleFixture({ path, hasCompany: true, recorded: false }),
    );
  await act(async () => {
    original.resolve(source());
    intermediate.resolve(source());
  });
  expect(
    screen.queryByRole('textbox', { name: 'Special conditions' }),
  ).not.toBeInTheDocument();
  await act(async () => current.resolve(source()));
  expect(
    await screen.findByRole('textbox', { name: 'Special conditions' }),
  ).toHaveValue('');
});
