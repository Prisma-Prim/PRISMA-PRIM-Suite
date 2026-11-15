import { expect, it } from 'vitest';
import { createOperationScope } from './use-scoped-operation';

it('completes one independent member while preserving its sibling', () => {
  const scope = createOperationScope();
  const first = scope.begin();
  const second = scope.begin();
  if (!first || !second) throw new Error('A live scope must admit work.');
  first.release();
  expect(scope.isPending()).toBe(true);
  expect(second.signal.aborted).toBe(false);
  first.retire();
  expect(second.signal.aborted).toBe(false);
  second.release();
  expect(scope.isPending()).toBe(false);
});

it('retires a completed latest observation when its successor begins', () => {
  const scope = createOperationScope();
  const previous = scope.beginLatest();
  if (!previous) throw new Error('A live scope must admit work.');
  previous.release();
  expect(scope.isPending()).toBe(false);
  const next = scope.beginLatest();
  expect(previous.signal.aborted).toBe(true);
  expect(next?.signal.aborted).toBe(false);
  scope.retire();
  expect(next?.signal.aborted).toBe(true);
  expect(scope.begin()?.signal.aborted).toBe(false);
});

it('permanently closes admission before notifying pending work', () => {
  const scope = createOperationScope();
  const pending = scope.begin();
  if (!pending) throw new Error('A live scope must admit work.');
  let reentrantAdmission: ReturnType<typeof scope.begin> = null;
  pending.signal.addEventListener('abort', () => {
    reentrantAdmission = scope.begin();
  });
  scope.close();
  expect(pending.signal.aborted).toBe(true);
  expect(reentrantAdmission).toBeNull();
  expect(scope.isPending()).toBe(false);
  expect(scope.isLive()).toBe(false);
  expect(scope.begin()).toBeNull();
  expect(scope.beginLatest()).toBeNull();
  scope.retire();
  expect(scope.begin()).toBeNull();
});
