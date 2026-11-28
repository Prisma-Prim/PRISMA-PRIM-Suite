import { renderHook } from '@testing-library/react';
import { expect, it } from 'vitest';
import { useAssignmentBundleCatalogue } from './assignment-bundle-catalogue';
import { ASSIGNMENT_PATHS } from './assignment-bundles';

it('offers every administrable bundle exactly once, each with a label', () => {
  const { result } = renderHook(() => useAssignmentBundleCatalogue());
  const bundles = result.current.map((option) => option.bundle);

  expect([...bundles].sort()).toEqual(Object.keys(ASSIGNMENT_PATHS).sort());
  expect(new Set(bundles).size).toBe(bundles.length);
  for (const option of result.current) expect(option.label).not.toBe('');
});
