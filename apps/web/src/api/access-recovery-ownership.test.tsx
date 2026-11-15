import { Suspense, startTransition, useState } from 'react';
import {
  act,
  render,
  renderHook,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import type { ActorContext } from '../access-types';
import type { BrowserIdentity } from '../access-composition';
import { actor, identity, ids } from '../invoice-record/invoice-record.fixture';
import { useAccessRecovery } from './use-access-recovery';

afterEach(() => vi.unstubAllGlobals());

function deferred<T>() {
  let complete: ((value: T) => void) | undefined;
  const promise = new Promise<T>((resolve) => {
    complete = resolve;
  });
  return {
    promise,
    resolve(value: T) {
      if (!complete) throw new Error('Deferred is not initialized.');
      complete(value);
    },
  };
}

it('keeps committed access recovery alive while its replacement render is suspended', async () => {
  const token = deferred<string>();
  const suspended = deferred<void>();
  const identity: BrowserIdentity = {
    loaded: true,
    signedIn: true,
    getToken: vi.fn(() => token.promise),
    signOut: vi.fn(),
    rejectSession: vi.fn(),
    signedOutView: null,
  };
  const onActorRevalidated = vi.fn();
  const transport = vi.fn(async () => Response.json(actor));
  vi.stubGlobal('fetch', transport);
  const control: {
    show?: (observation: ActorContext) => void;
    recovery?: ReturnType<typeof useAccessRecovery>;
  } = {};
  const rendered = vi.fn();
  function Workspace({ observation }: { observation: ActorContext }) {
    const recovery = useAccessRecovery({
      identity,
      actor: observation,
      authority: { key: 'displayed-authority', companyId: ids.company },
      onActorRevalidated,
    });
    rendered(observation.displayName);
    if (observation.displayName === 'Suspended replacement')
      throw suspended.promise;
    control.recovery = recovery;
    return <output>{observation.displayName}</output>;
  }
  function Host() {
    const [observation, show] = useState(actor);
    control.show = show;
    return (
      <Suspense fallback="Waiting">
        <Workspace observation={observation} />
      </Suspense>
    );
  }
  render(<Host />);
  act(() => control.recovery?.reject({ status: 'forbidden' }));
  expect(identity.getToken).toHaveBeenCalledOnce();
  act(() =>
    startTransition(() =>
      control.show?.({ ...actor, displayName: 'Suspended replacement' }),
    ),
  );
  expect(rendered).toHaveBeenCalledWith('Suspended replacement');
  expect(screen.getByText(actor.displayName)).toBeVisible();
  await act(async () => token.resolve('committed-session'));
  await waitFor(() =>
    expect(onActorRevalidated).toHaveBeenCalledExactlyOnceWith(actor),
  );
  expect(transport).toHaveBeenCalledOnce();
});

it('retains denial on an Actor-only replacement until the current owner retries', async () => {
  const transport = vi.fn(async () => Response.json(actor));
  vi.stubGlobal('fetch', transport);
  const props = {
    identity,
    authority: { key: 'current-authority', companyId: ids.company },
    onActorRevalidated: vi.fn(),
  };
  const probe = renderHook(
    ({ observation }) => useAccessRecovery({ ...props, actor: observation }),
    { initialProps: { observation: actor } },
  );
  const previous = probe.result.current;
  act(() => previous.reject({ status: 'forbidden' }));
  await waitFor(() => expect(props.onActorRevalidated).toHaveBeenCalledOnce());
  probe.rerender({ observation: { ...actor, displayName: 'New Actor' } });
  expect(probe.result.current.denied).toBe(true);
  act(() => probe.result.current.reject({ status: 'forbidden' }));
  expect(transport).toHaveBeenCalledOnce();
  act(() => probe.result.current.retry());
  expect(probe.result.current.denied).toBe(false);
  act(() => probe.result.current.reject({ status: 'forbidden' }));
  await waitFor(() => expect(transport).toHaveBeenCalledTimes(2));
  act(() => previous.retry());
  expect(probe.result.current.denied).toBe(true);
});

it('never admits saved rejection or retry controls after authority A-to-B-to-A', async () => {
  const transport = vi.fn(async () => Response.json(actor));
  vi.stubGlobal('fetch', transport);
  const rejectSession = vi.fn(async () => undefined);
  const currentIdentity = { ...identity, rejectSession };
  const probe = renderHook(
    ({ key }) =>
      useAccessRecovery({
        actor,
        identity: currentIdentity,
        authority: { key, companyId: ids.company },
      }),
    { initialProps: { key: 'authority-a' } },
  );
  const retired = probe.result.current;
  probe.rerender({ key: 'authority-b' });
  probe.rerender({ key: 'authority-a' });
  act(() => retired.reject({ status: 'unauthorized' }));
  expect(rejectSession).not.toHaveBeenCalled();
  expect(probe.result.current.denied).toBe(false);
  act(() => probe.result.current.reject({ status: 'forbidden' }));
  await waitFor(() => expect(transport).toHaveBeenCalledOnce());
  expect(probe.result.current.denied).toBe(true);
  act(() => retired.retry());
  expect(probe.result.current.denied).toBe(true);
  act(() => probe.result.current.reject({ status: 'forbidden' }));
  expect(transport).toHaveBeenCalledOnce();
});
