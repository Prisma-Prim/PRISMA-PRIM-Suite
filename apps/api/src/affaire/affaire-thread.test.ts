import { describe, expect, it } from 'vitest';
import { affaireThread, type AffaireStagePresences } from './affaire-thread.js';

const nothingYet: AffaireStagePresences = {
  request: 'record',
  costing: 'none',
  offer: 'none',
  contract: 'none',
  delivery: 'none',
  closure: 'none',
  collection: 'not_linked',
};

describe('affaire stage rule', () => {
  it('makes the Request current while no later stage holds a record', () => {
    expect(affaireThread({ status: 'OPEN', presence: nothingYet })).toEqual({
      thread: { kind: 'in_progress', currentStage: 'request' },
      markers: {
        request: 'current',
        costing: 'upcoming',
        offer: 'upcoming',
        contract: 'upcoming',
        delivery: 'upcoming',
        closure: 'upcoming',
        collection: 'not_applicable',
      },
    });
  });

  it('makes the furthest stage holding a record current and skips empty earlier stages', () => {
    expect(
      affaireThread({
        status: 'ON_HOLD',
        presence: { ...nothingYet, offer: 'record', contract: 'record' },
      }),
    ).toEqual({
      thread: { kind: 'in_progress', currentStage: 'contract' },
      markers: {
        request: 'done',
        costing: 'not_applicable',
        offer: 'done',
        contract: 'current',
        delivery: 'upcoming',
        closure: 'upcoming',
        collection: 'not_applicable',
      },
    });
  });

  it('never derives the current stage from a stage the actor cannot read', () => {
    expect(
      affaireThread({
        status: 'WON',
        presence: {
          ...nothingYet,
          costing: 'record',
          offer: 'not_available',
          contract: 'not_available',
          delivery: 'not_available',
          closure: 'not_available',
        },
      }),
    ).toEqual({
      thread: { kind: 'in_progress', currentStage: 'costing' },
      markers: {
        request: 'done',
        costing: 'current',
        offer: 'not_available',
        contract: 'not_available',
        delivery: 'not_available',
        closure: 'not_available',
        collection: 'not_applicable',
      },
    });
  });

  it.each(['LOST', 'DISQUALIFIED', 'ARCHIVED'] as const)(
    'shows the %s status instead of a current stage',
    (status) => {
      expect(
        affaireThread({
          status,
          presence: {
            ...nothingYet,
            offer: 'record',
            closure: 'not_available',
          },
        }),
      ).toEqual({
        thread: { kind: 'closed', status },
        markers: {
          request: 'done',
          costing: 'not_applicable',
          offer: 'done',
          contract: 'not_applicable',
          delivery: 'not_applicable',
          closure: 'not_available',
          collection: 'not_applicable',
        },
      });
    },
  );
});
