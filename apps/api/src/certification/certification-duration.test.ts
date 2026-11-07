import { describe, expect, it } from 'vitest';
import {
  proposeDuration,
  roundToHundredths,
  type DurationInputs,
} from './certification-duration.js';

function inputs(overrides: Partial<DurationInputs>): DurationInputs {
  return {
    subcategories: ['CI'],
    primary: 'CI',
    haccpStudies: { CI: 1 },
    effectiveFte: 10,
    increases: {},
    reductions: {},
    ...overrides,
  };
}

function proposal(value: ReturnType<typeof proposeDuration>) {
  if (value.kind !== 'proposal')
    throw new Error(`Expected a proposal, got ${value.kind}`);
  return value.proposal;
}

describe('ISO 22000 audit-duration proposal', () => {
  it('proposes one day for a small farm with one HACCP study', () => {
    expect(
      proposal(
        proposeDuration(
          inputs({
            subcategories: ['AI'],
            primary: 'AI',
            haccpStudies: { AI: 1 },
            effectiveFte: 4,
          }),
        ),
      ),
    ).toEqual({
      ruleVersion: 'iso22000-basic-2026-11',
      basicTime: '1',
      haccpTime: '0',
      fteTime: '0',
      baseDays: '1',
      netAdjustmentPercent: 0,
      initialOnSite: '1',
      initialTotal: '1.2',
      stage1OnSite: '0.5',
      stage2OnSite: '0.5',
      surveillanceOnSite: '0.333',
      surveillanceTotal: '0.3996',
      recertificationOnSite: '0.666',
      recertificationTotal: '0.7992',
      warnings: [
        'SURVEILLANCE_BELOW_ONE_DAY',
        'RECERTIFICATION_BELOW_ONE_DAY',
        'STAGE2_BELOW_ONE_DAY',
      ],
    });
  });

  it('adds HACCP and FTE time and nets increases against reductions for a dairy', () => {
    expect(
      proposal(
        proposeDuration(
          inputs({
            subcategories: ['CI'],
            primary: 'CI',
            haccpStudies: { CI: 3 },
            effectiveFte: 120,
            increases: { interpreter: 10, onSiteLaboratory: 5 },
            reductions: { automation: 5 },
          }),
        ),
      ),
    ).toMatchObject({
      basicTime: '2',
      haccpTime: '1',
      fteTime: '1.5',
      baseDays: '4.5',
      netAdjustmentPercent: 10,
      initialOnSite: '4.95',
      initialTotal: '5.94',
      stage1OnSite: '1.75',
      stage2OnSite: '3.2',
      surveillanceOnSite: '1.64835',
      surveillanceTotal: '1.97802',
      recertificationOnSite: '3.2967',
      recertificationTotal: '3.95604',
      warnings: [],
    });
  });

  it('counts the first study of the primary subcategory only, across subcategories', () => {
    expect(
      proposal(
        proposeDuration(
          inputs({
            subcategories: ['CIII', 'G'],
            primary: 'CIII',
            haccpStudies: { CIII: 2, G: 2 },
            effectiveFte: 230,
            reductions: { priorCertification: 10 },
          }),
        ),
      ),
    ).toMatchObject({
      basicTime: '2',
      haccpTime: '1',
      fteTime: '2',
      baseDays: '5',
      initialOnSite: '4.5',
      stage1OnSite: '1.5',
      stage2OnSite: '3',
    });
  });

  it('accepts reductions up to their caps for a catering kitchen', () => {
    expect(
      proposal(
        proposeDuration(
          inputs({
            subcategories: ['E'],
            primary: 'E',
            haccpStudies: { E: 1 },
            effectiveFte: 45,
            increases: { complexInfrastructure: 10 },
            reductions: { systemMaturity: 10, transferPreparedness: 10 },
          }),
        ),
      ),
    ).toMatchObject({
      baseDays: '2',
      netAdjustmentPercent: -10,
      initialOnSite: '1.8',
      stage1OnSite: '0.75',
      stage2OnSite: '1.05',
      surveillanceOnSite: '0.5994',
      warnings: ['SURVEILLANCE_BELOW_ONE_DAY'],
    });
  });

  it('rounds the FTE up to a whole number and proposes for a chemistry plant', () => {
    expect(
      proposal(
        proposeDuration(
          inputs({
            subcategories: ['K'],
            primary: 'K',
            haccpStudies: { K: 4 },
            effectiveFte: 799.5,
            increases: {
              productDevelopment: 10,
              criticalControlPoints: 5,
              interpreter: 10,
            },
            reductions: { automation: 10, systemMaturity: 5 },
          }),
        ),
      ),
    ).toMatchObject({
      baseDays: '6',
      initialOnSite: '6.6',
      initialTotal: '7.92',
      stage1OnSite: '2.25',
      stage2OnSite: '4.35',
      recertificationTotal: '5.27472',
    });
  });

  it('asks for a manual determination where the FTE bands overlap', () => {
    expect(proposeDuration(inputs({ effectiveFte: 1200 }))).toEqual({
      kind: 'manual',
      reason: 'FTE_BAND_AMBIGUOUS',
    });
  });

  it('refuses inconsistent primaries, HACCP studies and reductions beyond their caps', () => {
    expect(
      proposeDuration(
        inputs({
          subcategories: ['CIII', 'G'],
          primary: 'G',
          haccpStudies: { G: 1 },
        }),
      ),
    ).toEqual({
      kind: 'refused',
      refusals: ['PRIMARY_NOT_HIGHEST_BASIC_TIME'],
    });
    expect(
      proposeDuration(inputs({ primary: 'K', haccpStudies: { K: 1 } })),
    ).toMatchObject({
      kind: 'refused',
      refusals: ['PRIMARY_NOT_SELECTED', 'HACCP_STUDIES_MISMATCH'],
    });
    expect(proposeDuration(inputs({ haccpStudies: { CI: 0 } }))).toMatchObject({
      kind: 'refused',
      refusals: ['HACCP_STUDIES_MISMATCH'],
    });
    expect(
      proposeDuration(inputs({ reductions: { systemMaturity: 15 } })),
    ).toMatchObject({ kind: 'refused', refusals: ['REDUCTION_FACTOR_CAP'] });
    expect(
      proposeDuration(
        inputs({
          reductions: {
            systemMaturity: 10,
            priorCertification: 10,
            automation: 5,
          },
        }),
      ),
    ).toMatchObject({ kind: 'refused', refusals: ['REDUCTION_TOTAL_CAP'] });
  });

  it('rounds exact amounts half up to hundredths', () => {
    expect(roundToHundredths('1.64835')).toBe('1.65');
    expect(roundToHundredths('0.333')).toBe('0.33');
    expect(roundToHundredths('5.27472')).toBe('5.27');
    expect(roundToHundredths('3.2')).toBe('3.2');
    expect(roundToHundredths('0.125')).toBe('0.13');
  });
});
