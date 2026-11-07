import '@testing-library/jest-dom/vitest';
import { StrictMode, useEffect, useState } from 'react';
import {
  act,
  fireEvent,
  render,
  renderHook,
  screen,
  waitFor,
} from '@testing-library/react';
import { expect, it } from 'vitest';
import { useScopedOperation } from './use-scoped-operation';

type Begun = (AbortSignal | null)[];

function Owner({ scope, begun }: { scope: string; begun: Begun }) {
  const operation = useScopedOperation(scope);
  return (
    <button
      type="button"
      data-scope={scope}
      onClick={() => begun.push(operation.begin())}
    >
      Begin
    </button>
  );
}

/** Lets a test change the scope outside `act`, as a resolved read would. */
function Host({
  initial,
  begun,
  control,
}: {
  initial: string | null;
  begun: Begun;
  control: { show?: (scope: string) => void };
}) {
  const [scope, setScope] = useState(initial);
  control.show = setScope;
  return scope === null ? null : <Owner scope={scope} begun={begun} />;
}

/**
 * React commits, yields for paint and only then runs passive effects. Waiting
 * on the DOM clicks inside that frame, before any passive effect has run.
 */
async function beginOnFirstDisplayedFrame(
  control: { show?: (scope: string) => void },
  scope: string,
) {
  let requested = false;
  await waitFor(() => {
    if (!requested) {
      requested = true;
      control.show?.(scope);
    }
    const button = screen.getByRole('button', { name: 'Begin' });
    expect(button).toHaveAttribute('data-scope', scope);
    fireEvent.click(button);
  });
}

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

it('keeps work begun on the first displayed frame of a new owner (#1095)', async () => {
  const begun: Begun = [];
  const control: { show?: (scope: string) => void } = {};
  render(<Host initial={null} begun={begun} control={control} />);
  await beginOnFirstDisplayedFrame(control, 'company-a');
  // Let every pending effect run before judging the work.
  await act(async () => undefined);
  expect(begun).toHaveLength(1);
  expect(begun[0]).toBeInstanceOf(AbortSignal);
  expect(begun[0]?.aborted).toBe(false);
});

it('retires earlier work and keeps work begun on the first displayed frame of a new scope (#1096)', async () => {
  const begun: Begun = [];
  const control: { show?: (scope: string) => void } = {};
  render(<Host initial="authority-a" begun={begun} control={control} />);
  fireEvent.click(screen.getByRole('button', { name: 'Begin' }));
  await beginOnFirstDisplayedFrame(control, 'authority-b');
  // Let every pending effect run before judging the work.
  await act(async () => undefined);
  expect(begun).toHaveLength(2);
  expect(begun[0]?.aborted).toBe(true);
  expect(begun[1]).toBeInstanceOf(AbortSignal);
  expect(begun[1]?.aborted).toBe(false);
});

function useScopedRead(scope: string) {
  const operation = useScopedOperation(scope);
  const [value, setValue] = useState<string | null>(null);
  return {
    value,
    async read(response: Promise<string>) {
      const signal = operation.begin();
      if (!signal) return;
      const next = await response;
      if (!signal.aborted) setValue(next);
    },
  };
}

it('never applies a late result for a retired authority, even when equal values return (#1046)', async () => {
  const { result, rerender } = renderHook(({ scope }) => useScopedRead(scope), {
    initialProps: { scope: 'read-grant-a' },
  });
  const late = deferred<string>();
  let pending: Promise<void> | undefined;
  act(() => {
    pending = result.current.read(late.promise);
  });
  const beganUnderA = result.current;
  rerender({ scope: 'read-grant-b' });
  // A continuation of the first grant cannot open live work under its successor.
  await act(async () => beganUnderA.read(Promise.resolve('stale closure')));
  expect(result.current.value).toBeNull();
  rerender({ scope: 'read-grant-a' });
  await act(async () => {
    late.resolve('retired grant result');
    await pending;
  });
  expect(result.current.value).toBeNull();
  await act(async () => result.current.read(Promise.resolve('current grant')));
  expect(result.current.value).toBe('current grant');
});

it('recreates a live owner after the StrictMode cleanup (#888)', () => {
  const begun: Begun = [];
  renderHook(
    () => {
      const operation = useScopedOperation('company-a');
      useEffect(() => {
        // A consumer starting work on mount, including StrictMode replay.
        begun.push(operation.begin());
      }, [operation]);
      return operation;
    },
    { wrapper: StrictMode },
  );
  expect(begun).toHaveLength(2);
  expect(begun[0]?.aborted).toBe(true);
  expect(begun[1]).toBeInstanceOf(AbortSignal);
  expect(begun[1]?.aborted).toBe(false);
});

it('supersedes, retires on request and refuses work after unmount', () => {
  const { result, unmount } = renderHook(() => useScopedOperation('scope'));
  const operation = result.current;
  const first = operation.begin();
  const second = operation.begin();
  expect(first?.aborted).toBe(true);
  expect(second?.aborted).toBe(false);
  operation.retire();
  expect(second?.aborted).toBe(true);
  const third = operation.begin();
  unmount();
  expect(third?.aborted).toBe(true);
  expect(operation.begin()).toBeNull();
});
