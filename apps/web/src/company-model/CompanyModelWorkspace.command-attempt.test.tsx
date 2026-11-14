import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, waitFor } from '@testing-library/react';
import { render, screen } from '../test/render-with-interface-locale';
import { deterministicBrowserIdentity } from '../access-composition';
import {
  approverInCompany,
  actorWith,
  grant,
  modelKinds,
} from './company-model-kinds.test-fixture';

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

for (const kind of modelKinds)
  describe(`${kind.name} model command attempt`, () => {
    const { Workspace, root, model, attribution, approverActor } = kind;
    const approved = {
      ...model.head,
      decision: {
        id: '70000000-0000-4000-8000-000000000902',
        outcome: 'APPROVE',
        basis: 'Reviewed original content',
        ...attribution,
      },
    };
    const pending = {
      ...model,
      revision: 3,
      head: {
        ...model.head,
        id: '61000000-0000-4000-8000-000000000902',
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
    const withdrawnModel = { ...pending, revision: 4, activeVersion: null };
    const reason = ' Exact literal older withdrawal\n with spaces ';
    const successorHeading = `Version 2: ${approved.content.serviceTitle}`;

    function holdOlderWithdrawal() {
      const post = deferred<Response>();
      let postSignal: AbortSignal | null | undefined;
      const requests: { path: string; init: RequestInit | undefined }[] = [];
      let withdrawn = false;
      vi.stubGlobal(
        'fetch',
        vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
          const path = new URL(input.toString(), window.location.origin)
            .pathname;
          requests.push({ path, init });
          if (init?.method === 'POST') {
            postSignal = init.signal;
            withdrawn = true;
            return post.promise;
          }
          if (path === root) {
            const company = new Headers(init?.headers).get(
              'x-company-context-id',
            );
            return Promise.resolve(
              Response.json({
                model:
                  company !== pending.companyId
                    ? null
                    : withdrawn
                      ? withdrawnModel
                      : pending,
              }),
            );
          }
          if (path === `${root}/versions`)
            return Promise.resolve(
              Response.json({ versions: [], nextCursor: null }),
            );
          throw new Error('Unexpected model command route.');
        }),
      );
      return { post, postSignal: () => postSignal, requests };
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

    it('keeps sibling decisions blocked until the older withdrawal receipt is confirmed, without another read', async () => {
      const held = holdOlderWithdrawal();
      render(
        <Workspace
          actor={approverActor}
          identity={deterministicBrowserIdentity()}
        />,
      );
      await withdraw();
      await waitFor(() => expect(held.postSignal()).toBeDefined());
      expect(
        screen.getByRole('button', { name: 'Approve this exact version' }),
      ).toBeDisabled();
      expect(
        screen.getByRole('button', { name: 'Withdraw the active version' }),
      ).toBeDisabled();
      fireEvent.click(
        screen.getByRole('button', { name: 'Approve this exact version' }),
      );
      const posts = () =>
        held.requests.filter(({ init }) => init?.method === 'POST');
      expect(posts()).toHaveLength(1);
      const readsBeforeReceipt = held.requests.length;
      await act(async () =>
        held.post.resolve(Response.json({ model: withdrawnModel })),
      );
      expect(
        await screen.findByText('Withdrawal of version 1 recorded.'),
      ).toBeVisible();
      expect(
        await screen.findByRole('button', {
          name: 'Approve this exact version',
        }),
      ).toBeEnabled();
      expect(
        held.requests.slice(readsBeforeReceipt).map(({ path }) => path),
      ).toEqual([root]);
      expect(posts()[0]?.path).toBe(
        `${root}/versions/${approved.id}/withdrawal`,
      );
      expect(posts()[0]?.init?.body).toBe(
        JSON.stringify({ expectedModelRevision: 3, versionNumber: 1, reason }),
      );
    });

    it.each([200, 403])(
      'suppresses a late HTTP %s withdrawal reply after Company A→B→A retirement',
      async (status) => {
        const held = holdOlderWithdrawal();
        const identity = deterministicBrowserIdentity();
        const onActorRevalidated = vi.fn();
        const onCompanyContextRejected = vi.fn();
        const props = {
          identity,
          onActorRevalidated,
          onCompanyContextRejected,
        };
        const view = render(<Workspace {...props} actor={approverActor} />);
        await withdraw();
        await waitFor(() => expect(held.postSignal()).toBeDefined());
        view.rerender(
          <Workspace
            {...props}
            actor={approverInCompany(
              kind,
              '11000000-0000-4000-8000-000000000902',
              'Company B',
            )}
          />,
        );
        await screen.findByText(
          `No consulting ${kind.name} model has been configured.`,
        );
        view.rerender(<Workspace {...props} actor={approverActor} />);
        await screen.findByRole('heading', { name: successorHeading });
        expect(held.postSignal()?.aborted).toBe(true);
        const requestsBeforeLateReply = held.requests.length;
        await act(async () =>
          held.post.resolve(
            Response.json({ model: withdrawnModel }, { status }),
          ),
        );
        expect(held.requests).toHaveLength(requestsBeforeLateReply);
        expect(
          screen.queryByText('Withdrawal of version 1 recorded.'),
        ).toBeNull();
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
        const held = holdOlderWithdrawal();
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
          <Workspace
            actor={approverActor}
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
            ? approverActor
            : actorWith(kind, {
                grants: [
                  grant(kind.approver, '41000000-0000-4000-8000-000000000903'),
                ],
              });
        holdToken = false;
        view.rerender(
          <Workspace
            actor={replacementActor}
            identity={
              stage === 'identity' ? deterministicBrowserIdentity() : identity
            }
            onActorRevalidated={onActorRevalidated}
          />,
        );
        await screen.findByRole('heading', { name: successorHeading });
        if (stage === 'POST') expect(held.postSignal()?.aborted).toBe(true);
        const requestsBeforeLateReply = held.requests.length;
        await act(async () => {
          token.resolve('retired-token');
          held.post.resolve(Response.json({ model: withdrawnModel }));
        });
        expect(held.requests).toHaveLength(requestsBeforeLateReply);
        expect(
          held.requests.filter(({ init }) => init?.method === 'POST'),
        ).toHaveLength(stage === 'identity' ? 0 : 1);
        expect(
          screen.queryByText('Withdrawal of version 1 recorded.'),
        ).toBeNull();
        expect(
          screen.queryByRole('button', { name: 'Retry identical command' }),
        ).toBeNull();
        expect(onActorRevalidated).not.toHaveBeenCalled();
      },
    );
  });
