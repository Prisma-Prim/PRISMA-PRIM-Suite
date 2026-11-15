import { describe, expect, it } from 'vitest';
import { offerModelAuthority } from '../offer-model/offer-model.kind';
import { contractModelAuthority } from '../contract-model/contract-model.kind';
import { modelKinds } from './company-model-kinds.test-fixture';

describe('Company model authority from public grants', () => {
  it.each(modelKinds)(
    'admits $name without a per-kind context field',
    (kind) => {
      const authority =
        kind.name === 'Offer' ? offerModelAuthority : contractModelAuthority;
      expect(authority(kind.actor)).toMatchObject({
        canEdit: true,
        canDecide: false,
      });
      expect(authority(kind.approverActor)).toMatchObject({
        canDecide: true,
      });
    },
  );
});
