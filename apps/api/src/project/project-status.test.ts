import { describe, expect, it } from 'vitest';
import { isOpenProjectStatus, type ProjectStatus } from './project-status.js';

describe('Project lifecycle status classification', () => {
  it.each([
    ['preparatory', true],
    ['active', true],
    ['on_hold', true],
    ['completed', false],
    ['cancelled', false],
  ] satisfies [ProjectStatus, boolean][])('%s open=%s', (status, expected) => {
    expect(isOpenProjectStatus(status)).toBe(expected);
  });
});
