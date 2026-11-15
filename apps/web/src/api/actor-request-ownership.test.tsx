import { Suspense, startTransition, useState } from 'react';
import {
  act,
  render,
  renderHook,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { useActorRequests } from './use-actor-requests';
import { actor, identity, ids } from '../invoice-record/invoice-record.fixture';

afterEach(() => vi.unstubAllGlobals());

function deferred<T>() {
  let settle: ((value: T) => void) | undefined;
  const promise = new Promise<T>((resolve) => {
    settle = resolve;
  });
  return {
    promise,
    resolve(value: T) {
      if (!settle) throw new Error('Deferred was not initialized');
      settle(value);
    },
  };
}

function requestProps() {
  return {
    actor,
    identity,
    companyId: ids.company,
    scope: 'financial-read',
    onCompanyContextRejected: vi.fn(),
    onActorRevalidated: vi.fn(),
    onWorkspaceAccessRejected: vi.fn(),
  };
}

it('keeps a new request alive when an old A-to-B-to-A cleanup runs', async () => {
  let finish: ((response: Response) => void) | undefined;
  const held = new Promise<Response>((resolve) => {
    finish = resolve;
  });
  const transport = vi.fn(async () => held);
  vi.stubGlobal('fetch', transport);
  const props = {
    actor,
    identity,
    onCompanyContextRejected: vi.fn(),
    onActorRevalidated: vi.fn(),
    onWorkspaceAccessRejected: vi.fn(),
  };
  const probe = renderHook(
    ({ scope }) =>
      useActorRequests({ ...props, companyId: ids.company, scope }),
    { initialProps: { scope: 'authority-a' } },
  );
  const retired = probe.result.current;
  probe.rerender({ scope: 'authority-b' });
  probe.rerender({ scope: 'authority-a' });
  const pending = probe.result.current.request('/fresh');
  await waitFor(() => expect(transport).toHaveBeenCalledTimes(1));
  act(() => retired.retireRequests());
  if (!finish) throw new Error('Fresh read did not start');
  finish(Response.json({ source: 'current' }));
  await expect(pending).resolves.toEqual({
    status: 'ok',
    value: { source: 'current' },
  });
});

it.each(['first', 'second'])(
  'retains independent same-scope reads when the %s read finishes first',
  async (firstToFinish) => {
    const responses = {
      first: deferred<Response>(),
      second: deferred<Response>(),
    };
    const transport = vi.fn(async (url: string) => {
      if (url.endsWith('/first')) return responses.first.promise;
      if (url.endsWith('/second')) return responses.second.promise;
      throw new Error('Unexpected request');
    });
    vi.stubGlobal('fetch', transport);
    const probe = renderHook(() => useActorRequests(requestProps()));
    const first = probe.result.current.request('/first');
    const second = probe.result.current.request('/second');
    await waitFor(() => expect(transport).toHaveBeenCalledTimes(2));
    const selected = firstToFinish === 'first' ? first : second;
    const remaining = firstToFinish === 'first' ? second : first;
    const selectedResponse =
      firstToFinish === 'first' ? responses.first : responses.second;
    const remainingResponse =
      firstToFinish === 'first' ? responses.second : responses.first;
    selectedResponse.resolve(Response.json({ result: 'finished first' }));
    await expect(selected).resolves.toEqual({
      status: 'ok',
      value: { result: 'finished first' },
    });
    remainingResponse.resolve(Response.json({ result: 'finished second' }));
    await expect(remaining).resolves.toEqual({
      status: 'ok',
      value: { result: 'finished second' },
    });
  },
);

it.each(['requests', 'all'])(
  'separately owns access recovery when retiring %s',
  async (retirement) => {
    const read = deferred<Response>();
    const recoveryBody = deferred<unknown>();
    const recovering = vi.fn();
    const props = requestProps();
    vi.stubGlobal('fetch', async (url: string) => {
      if (!url.endsWith('/access/current-actor')) return read.promise;
      const response = Response.json(actor);
      response.json = () => {
        recovering();
        return recoveryBody.promise;
      };
      return response;
    });
    const probe = renderHook(() => useActorRequests(props));
    const pendingRead = probe.result.current.request('/independent');
    act(() => probe.result.current.recover({ status: 'forbidden' }));
    await waitFor(() => expect(recovering).toHaveBeenCalledOnce());
    act(() =>
      retirement === 'all'
        ? probe.result.current.retire()
        : probe.result.current.retireRequests(),
    );
    read.resolve(Response.json({ source: 'retired' }));
    await expect(pendingRead).resolves.toEqual({ status: 'retired' });
    await act(async () => recoveryBody.resolve(actor));
    if (retirement === 'requests')
      await waitFor(() =>
        expect(props.onActorRevalidated).toHaveBeenCalledWith(actor),
      );
    else expect(props.onActorRevalidated).not.toHaveBeenCalled();
  },
);

it('retires a held full-Actor recovery while an independent read remains valid', async () => {
  const read = deferred<Response>();
  const recoveryBody = deferred<unknown>();
  const recovering = vi.fn();
  const props = requestProps();
  vi.stubGlobal('fetch', async (url: string) => {
    if (!url.endsWith('/access/current-actor')) return read.promise;
    const response = Response.json(actor);
    response.json = () => {
      recovering();
      return recoveryBody.promise;
    };
    return response;
  });
  const probe = renderHook(
    ({ observation }) => useActorRequests({ ...props, actor: observation }),
    { initialProps: { observation: actor } },
  );
  const pendingRead = probe.result.current.request('/independent');
  act(() => probe.result.current.recover({ status: 'forbidden' }));
  await waitFor(() => expect(recovering).toHaveBeenCalledOnce());
  probe.rerender({
    observation: { ...actor, displayName: 'Newer full Actor' },
  });
  await act(async () => recoveryBody.resolve(actor));
  expect(props.onActorRevalidated).not.toHaveBeenCalled();
  read.resolve(Response.json({ source: 'still permitted' }));
  await expect(pendingRead).resolves.toEqual({
    status: 'ok',
    value: { source: 'still permitted' },
  });
});

it('does not start old full-Actor recovery from a late denial after a newer observation', async () => {
  const denial = deferred<Response>();
  const props = requestProps();
  const transport = vi.fn(async (url: string) =>
    url.endsWith('/old-read') ? denial.promise : Response.json(actor),
  );
  vi.stubGlobal('fetch', transport);
  const probe = renderHook(
    ({ observation }) => useActorRequests({ ...props, actor: observation }),
    { initialProps: { observation: actor } },
  );
  const oldRead = probe.result.current.request('/old-read');
  await waitFor(() => expect(transport).toHaveBeenCalledOnce());
  probe.rerender({
    observation: { ...actor, displayName: 'Newer full Actor' },
  });
  await act(async () => {
    denial.resolve(new Response(null, { status: 403 }));
    await oldRead;
  });
  expect(transport).toHaveBeenCalledOnce();
  expect(props.onActorRevalidated).not.toHaveBeenCalled();
  await act(async () => probe.result.current.recover({ status: 'forbidden' }));
  await waitFor(() =>
    expect(props.onActorRevalidated).toHaveBeenCalledWith(actor),
  );
});

it('keeps a displayed scope usable while its replacement render is suspended', async () => {
  const response = deferred<Response>();
  const suspended = deferred<void>();
  const props = requestProps();
  const control: {
    show?: (scope: string) => void;
    read?: () => Promise<unknown>;
  } = {};
  const renderedScopes = vi.fn();
  vi.stubGlobal('fetch', async () => response.promise);
  function Workspace({ scope }: { scope: string }) {
    const owner = useActorRequests({ ...props, scope });
    renderedScopes(scope);
    if (scope === 'replacement') throw suspended.promise;
    control.read = () => owner.request('/displayed');
    return <output>{scope}</output>;
  }
  function Host() {
    const [scope, setScope] = useState('displayed');
    control.show = setScope;
    return (
      <Suspense fallback="Waiting">
        <Workspace scope={scope} />
      </Suspense>
    );
  }
  render(<Host />);
  const pending = control.read?.();
  act(() => startTransition(() => control.show?.('replacement')));
  expect(renderedScopes).toHaveBeenCalledWith('replacement');
  expect(screen.getByText('displayed')).toBeVisible();
  response.resolve(Response.json({ source: 'displayed' }));
  await expect(pending).resolves.toEqual({
    status: 'ok',
    value: { source: 'displayed' },
  });
});
