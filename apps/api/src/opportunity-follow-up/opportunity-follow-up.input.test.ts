import { describe, expect, it } from 'vitest';
import {
  followUpInput,
  followUpQuery,
  literalFollowUpDate,
} from './opportunity-follow-up.input.js';

describe('the separate manual follow-up intent', () => {
  it('preserves literal calendar values and explicit undated/reason declarations', () => {
    for (const date of ['0001-01-01', '2000-02-29', '9999-12-31'])
      expect(literalFollowUpDate(date)).toBe(date);
    const reason = '  Discussion moved\r\nЖ é  ';
    expect(
      followUpInput({
        expectedRevision: 1,
        observedOpportunityVersion: 2,
        followUpOn: null,
        reason,
      }),
    ).toEqual({
      expectedRevision: 1,
      observedOpportunityVersion: 2,
      followUpOn: null,
      reason,
    });
  });
  it('rejects coercion, impossible calendars, unknown fields and malformed literal text', () => {
    for (const date of [
      '0000-01-01',
      '1900-02-29',
      '2026-02-30',
      '2026-01-01T00:00:00Z',
      ' 2026-01-01',
      '2026-1-01',
      20260101,
      null,
    ])
      expect(() => literalFollowUpDate(date)).toThrow();
    for (const reason of ['', ' \u00a0', '\ud800', '\0', '😀'.repeat(251)])
      expect(() =>
        followUpInput({
          expectedRevision: 0,
          observedOpportunityVersion: 1,
          followUpOn: null,
          reason,
        }),
      ).toThrow();
    expect(() =>
      followUpInput({
        expectedRevision: 0,
        observedOpportunityVersion: 1,
        followUpOn: null,
      }),
    ).toThrow();
    expect(() =>
      followUpInput({
        expectedRevision: 0,
        observedOpportunityVersion: 1,
        followUpOn: null,
        reason: null,
        now: '2026-01-01',
      }),
    ).toThrow();
    expect(
      followUpInput({
        expectedRevision: Number.MAX_SAFE_INTEGER,
        observedOpportunityVersion: 1,
        followUpOn: null,
        reason: null,
      }).expectedRevision,
    ).toBe(Number.MAX_SAFE_INTEGER);
  });
  it('requires one explicit discovery boundary and closed scalar continuation fields', () => {
    expect(followUpQuery({ through: '2026-11-15' }, 'discovery')).toEqual({
      through: '2026-11-15',
      cursor: undefined,
    });
    for (const query of [
      {},
      { through: '' },
      { through: ['2026-11-15'] },
      { through: '2026-11-15', limit: '26' },
      { through: '2026-11-15', cursor: ['x'] },
    ])
      expect(() => followUpQuery(query, 'discovery')).toThrow();
    expect(() =>
      followUpQuery({ cursor: 'x'.repeat(2049) }, 'history'),
    ).toThrow();
    expect(() => followUpQuery({ cursor: 'a' }, 'current')).toThrow();
  });
});
