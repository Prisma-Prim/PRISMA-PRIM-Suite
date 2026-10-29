import { ConflictException } from '@nestjs/common';
import { expect, it } from 'vitest';
import { nextApplicabilityRevision } from './mission-applicability.transition.js';

it('admits the first and final signed32 material successors without advancing or retaining state', () => {
  expect(nextApplicabilityRevision(0)).toBe(1);
  expect(nextApplicabilityRevision(2147483646)).toBe(2147483647);
  expect(nextApplicabilityRevision(0)).toBe(1);
});
it('refuses actual MAX exhaustion with409 before a material successor exists', () => {
  // This is the actual pure boundary called before the transaction appends.
  // Real PG separately proves integer overflow and exact successor/audit rollback;
  // no artificial MAX history or stale observed-revision conflict stands in for it.
  try {
    nextApplicabilityRevision(2147483647);
    throw new Error('Expected exhaustion');
  } catch (error) {
    expect(error).toBeInstanceOf(ConflictException);
    if (!(error instanceof ConflictException)) throw error;
    expect(error.getStatus()).toBe(409);
  }
  expect(nextApplicabilityRevision(1)).toBe(2);
});
it.each([-1, 0.5, NaN, Infinity, 2147483648])(
  'treats corrupt stored revision %s as an error instead of exhausted or empty success',
  (value) => {
    expect(() => nextApplicabilityRevision(value)).toThrow(
      'Invalid stored applicability revision.',
    );
  },
);
