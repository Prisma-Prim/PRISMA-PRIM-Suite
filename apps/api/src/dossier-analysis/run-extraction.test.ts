import { describe, expect, it } from 'vitest';
import { extractRunSources } from './run-extraction.js';

describe('analysis extraction deadline', () => {
  it('bounds each worker by remaining time and explicitly fails unstarted sources', async () => {
    let time = 0;
    const timeouts: number[] = [];
    const results = await extractRunSources(
      [
        { bytes: new Uint8Array([1]), kind: 'pdf' },
        { bytes: new Uint8Array([2]), kind: 'docx' },
        { bytes: new Uint8Array([3]), kind: 'pdf' },
      ],
      {
        now: () => time,
        extract: async (input) => {
          timeouts.push(input.timeoutMs);
          time += 25_000;
          return {
            state: 'unreadable',
            parserVersion: 'v1',
            passages: [],
            issues: [],
            unitsTotal: 1,
            unitsReadable: 0,
          };
        },
      },
    );
    expect(timeouts).toEqual([20_000, 15_000]);
    expect(results.map((result) => result.state)).toEqual([
      'unreadable',
      'unreadable',
      'failed',
    ]);
    expect(results[2]?.issues).toEqual([{ code: 'time_limit', locator: null }]);
  });
});
