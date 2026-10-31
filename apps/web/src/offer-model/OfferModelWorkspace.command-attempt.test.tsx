import { afterEach, expect, it, vi } from 'vitest';
import { act, fireEvent, waitFor } from '@testing-library/react';
import { render, screen } from '../test/render-with-interface-locale';
import { deterministicBrowserIdentity } from '../access-composition';
import { OfferModelWorkspace } from './OfferModelWorkspace';
import {
  syntheticApprover,
  syntheticAttribution,
  syntheticModel,
} from './offer-model.fixture';

afterEach(() => vi.unstubAllGlobals());

function deferred<T>() {
  let settle: ((value: T) => void) | undefined;
  const promise = new Promise<T>((resolve) => {
    settle = resolve;
  });
  return {
    promise,
    resolve(value: T) {
      if (!settle) throw new Error('Deferred was not initialized.');
      settle(value);
    },
  };
}

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
    predecessorVersionId: approved.id,
  },
  activeVersion: {
    id: approved.id,
    versionNumber: 1,
    sourceKind: 'ILLUSTRATIVE',
    serviceTitle: approved.content.serviceTitle,
  },
};
const reason = ' Exact literal older withdrawal\n with spaces ';
const confirmedDetail = {
  version: {
    ...approved,
    withdrawal: {
      id: '71000000-0000-4000-8000-000000000847',
      reason,
      ...syntheticAttribution,
    },
  },
  currentSelection: { activeVersionId: null },
};

function holdOlderWithdrawal(holdPost = false) {
  const post = deferred<Response>();
  let postSignal: AbortSignal | null | undefined;
  const confirmation = deferred<Response>();
  const recovery = deferred<Response>();
  const requests: { path: string; init: RequestInit | undefined }[] = [];
  let confirmationSignal: AbortSignal | null | undefined;
  let detailReads = 0;
  let withdrawn = false;
  vi.stubGlobal(
    'fetch',
    vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const path = new URL(input.toString(), window.location.origin).pathname;
      requests.push({ path, init });
      if (init?.method === 'POST') {
        postSignal = init.signal;
        withdrawn = true;
        return holdPost
          ? post.promise
          : Promise.resolve(
              Response.json({
                model: { ...pending, revision: 4, activeVersion: null },
              }),
            );
      }
      if (path === `/api/offer-models/consulting-ro/versions/${approved.id}`) {
        confirmationSignal = init?.signal;
        detailReads += 1;
        return detailReads === 1
          ? confirmation.promise
          : Promise.resolve(Response.json(confirmedDetail));
      }
      if (path === '/api/access/current-actor') return recovery.promise;
      if (path === '/api/offer-models/consulting-ro') {
        const company = new Headers(init?.headers).get('x-company-context-id');
        return Promise.resolve(
          Response.json({
            model:
              company !== pending.companyId
                ? null
                : withdrawn
                  ? { ...pending, revision: 4, activeVersion: null }
                  : pending,
          }),
        );
      }
      if (path === '/api/offer-models/consulting-ro/versions')
        return Promise.resolve(
          Response.json({ versions: [], nextCursor: null }),
        );
      throw new Error('Unexpected Offer command route.');
    }),
  );
  return {
    confirmation,
    recovery,
    post,
    postSignal: () => postSignal,
    requests,
    signal: () => confirmationSignal,
  };
}

async function withdraw() {
  fireEvent.change(await screen.findByLabelText('Withdrawal reason'), {
    target: { value: reason },
  });
  fireEvent.click(
    screen.getByRole('button', { name: 'Withdraw the active version' }),
  );
  await screen.findByText('Recording the model command…');
}

it('keeps sibling decisions blocked until the older Offer withdrawal is completely confirmed', async () => {
  const held = holdOlderWithdrawal();
  render(
    <OfferModelWorkspace
      actor={syntheticApprover}
      identity={deterministicBrowserIdentity()}
    />,
  );
  await withdraw();
  await waitFor(() => expect(held.signal()).toBeDefined());
  expect(
    screen.getByRole('button', { name: 'Approve this exact version' }),
  ).toBeDisabled();
  expect(
    screen.getByRole('button', { name: 'Withdraw the active version' }),
  ).toBeDisabled();
  expect(screen.queryByText('Withdrawal of version 1 recorded.')).toBeNull();
  fireEvent.click(
    screen.getByRole('button', { name: 'Approve this exact version' }),
  );
  expect(
    held.requests.filter(({ init }) => init?.method === 'POST'),
  ).toHaveLength(1);
  await act(async () =>
    held.confirmation.resolve(Response.json(confirmedDetail)),
  );
  expect(
    await screen.findByText('Withdrawal of version 1 recorded.'),
  ).toBeVisible();
  expect(
    await screen.findByRole('button', { name: 'Approve this exact version' }),
  ).toBeEnabled();
});

it.each(['unavailable', 'malformed'])(
  'retries the literal older withdrawal after %s exact confirmation',
  async (failure) => {
    const held = holdOlderWithdrawal();
    render(
      <OfferModelWorkspace
        actor={syntheticApprover}
        identity={deterministicBrowserIdentity()}
      />,
    );
    await withdraw();
    await act(async () =>
      held.confirmation.resolve(
        failure === 'unavailable'
          ? new Response(null, { status: 404 })
          : Response.json({ version: {} }),
      ),
    );
    fireEvent.click(
      await screen.findByRole('button', { name: 'Retry identical command' }),
    );
    expect(
      await screen.findByText('Withdrawal of version 1 recorded.'),
    ).toBeVisible();
    const posts = held.requests.filter(({ init }) => init?.method === 'POST');
    expect(posts).toHaveLength(2);
    expect(posts[0]?.path).toBe(
      `/api/offer-models/consulting-ro/versions/${approved.id}/withdrawal`,
    );
    expect(posts[0]?.init?.body).toBe(
      JSON.stringify({ expectedModelRevision: 3, versionNumber: 1, reason }),
    );
    expect(posts[1]?.path).toBe(posts[0]?.path);
    expect(posts[1]?.init?.body).toBe(posts[0]?.init?.body);
    expect(new Headers(posts[1]?.init?.headers).get('idempotency-key')).toBe(
      new Headers(posts[0]?.init?.headers).get('idempotency-key'),
    );
    expect(
      new Headers(posts[1]?.init?.headers).get('x-company-context-id'),
    ).toBe(pending.companyId);
  },
);

it('hands exact confirmation denial to independent parent recovery after removing protected content', async () => {
  const held = holdOlderWithdrawal();
  const onActorRevalidated = vi.fn();
  render(
    <OfferModelWorkspace
      actor={syntheticApprover}
      identity={deterministicBrowserIdentity()}
      onActorRevalidated={onActorRevalidated}
    />,
  );
  await withdraw();
  await act(async () =>
    held.confirmation.resolve(new Response(null, { status: 403 })),
  );
  await screen.findByRole('button', { name: 'Reload the current model' });
  expect(screen.queryByLabelText('Withdrawal reason')).toBeNull();
  expect(
    screen.queryByRole('heading', {
      name: 'Version 2: Consultanță demonstrativă',
    }),
  ).toBeNull();
  await waitFor(() =>
    expect(
      held.requests.filter(({ path }) => path === '/api/access/current-actor'),
    ).toHaveLength(1),
  );
  await act(async () =>
    held.recovery.resolve(Response.json(syntheticApprover)),
  );
  expect(onActorRevalidated).toHaveBeenCalledExactlyOnceWith(syntheticApprover);
});

it.each([200, 403])(
  'suppresses late HTTP %s confirmation after Company A→B→A retirement',
  async (status) => {
    const held = holdOlderWithdrawal();
    const identity = deterministicBrowserIdentity();
    const onActorRevalidated = vi.fn();
    const onCompanyContextRejected = vi.fn();
    const props = { identity, onActorRevalidated, onCompanyContextRejected };
    const view = render(
      <OfferModelWorkspace {...props} actor={syntheticApprover} />,
    );
    await withdraw();
    await waitFor(() => expect(held.signal()).toBeDefined());
    view.rerender(
      <OfferModelWorkspace
        {...props}
        actor={{
          ...syntheticApprover,
          activeCompany: {
            ...syntheticApprover.activeCompany,
            id: '11000000-0000-4000-8000-000000000847',
            displayName: 'Company B',
          },
        }}
      />,
    );
    await screen.findByText('No consulting Offer model has been configured.');
    view.rerender(<OfferModelWorkspace {...props} actor={syntheticApprover} />);
    await screen.findByRole('heading', {
      name: 'Version 2: Consultanță demonstrativă',
    });
    expect(held.signal()?.aborted).toBe(true);
    const readsBeforeLateReply = held.requests.length;
    await act(async () =>
      held.confirmation.resolve(Response.json(confirmedDetail, { status })),
    );
    expect(held.requests).toHaveLength(readsBeforeLateReply);
    expect(screen.queryByText('Withdrawal of version 1 recorded.')).toBeNull();
    expect(
      screen.queryByRole('button', { name: 'Retry identical command' }),
    ).toBeNull();
    expect(onActorRevalidated).not.toHaveBeenCalled();
    expect(onCompanyContextRejected).not.toHaveBeenCalled();
  },
);

it.each(['identity', 'POST'])(
  'retires the actual command owner while %s is held',
  async (stage) => {
    const held = holdOlderWithdrawal(stage === 'POST');
    const token = deferred<string>();
    let holdToken = false;
    const identity = {
      ...deterministicBrowserIdentity(),
      requestHeaders: undefined,
      getToken: () =>
        holdToken ? token.promise : Promise.resolve('synthetic-token'),
    };
    const onActorRevalidated = vi.fn();
    const view = render(
      <OfferModelWorkspace
        actor={syntheticApprover}
        identity={identity}
        onActorRevalidated={onActorRevalidated}
      />,
    );
    await screen.findByLabelText('Withdrawal reason');
    holdToken = stage === 'identity';
    await withdraw();
    if (stage === 'POST')
      await waitFor(() => expect(held.postSignal()).toBeDefined());
    const replacementActor =
      stage === 'identity'
        ? syntheticApprover
        : {
            ...syntheticApprover,
            activeCompany: {
              ...syntheticApprover.activeCompany,
              id: pending.companyId,
              displayName: 'Synthetic Company',
              offerModelGrants: [
                {
                  bundle: 'company_offer_model_approver',
                  assignmentId: '41000000-0000-4000-8000-000000000848',
                  permissionSetVersion: 'v1',
                  permissions: [
                    'commercial.offer.model.read',
                    'commercial.offer.model.decide',
                    'commercial.offer.model.withdraw',
                  ],
                },
              ],
            },
          };
    holdToken = false;
    view.rerender(
      <OfferModelWorkspace
        actor={replacementActor}
        identity={
          stage === 'identity' ? deterministicBrowserIdentity() : identity
        }
        onActorRevalidated={onActorRevalidated}
      />,
    );
    await screen.findByRole('heading', {
      name: 'Version 2: Consultanță demonstrativă',
    });
    if (stage === 'POST') expect(held.postSignal()?.aborted).toBe(true);
    const requestsBeforeLateReply = held.requests.length;
    await act(async () => {
      token.resolve('retired-token');
      held.post.resolve(
        Response.json({
          model: { ...pending, revision: 4, activeVersion: null },
        }),
      );
    });
    expect(held.requests).toHaveLength(requestsBeforeLateReply);
    expect(
      held.requests.filter(({ init }) => init?.method === 'POST'),
    ).toHaveLength(stage === 'identity' ? 0 : 1);
    expect(screen.queryByText('Withdrawal of version 1 recorded.')).toBeNull();
    expect(
      screen.queryByRole('button', { name: 'Retry identical command' }),
    ).toBeNull();
    expect(onActorRevalidated).not.toHaveBeenCalled();
  },
);
