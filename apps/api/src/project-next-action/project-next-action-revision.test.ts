import { ConflictException } from '@nestjs/common';
import { expect, it } from 'vitest';
import { nextActionMaterialRevision } from './project-next-action-revision.js';

it('bounds the actual append-called material successor without manufacturing a billion-row history', () => {
  expect(nextActionMaterialRevision(0)).toBe(1);
  expect(nextActionMaterialRevision(2147483646)).toBe(2147483647);
  try {
    nextActionMaterialRevision(2147483647);
    throw new Error('Exhaustion was not refused.');
  } catch (error) {
    expect(error).toBeInstanceOf(ConflictException);
    if (!(error instanceof ConflictException)) throw error;
    expect(error.getStatus()).toBe(409);
  }
  for (const invalid of [-1, 0.5, 2147483648, Number.NaN])
    expect(() => nextActionMaterialRevision(invalid)).toThrow(
      'Invalid stored next-action revision.',
    );
});
