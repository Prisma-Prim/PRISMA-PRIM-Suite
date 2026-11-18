import { test } from '@playwright/test';
import { qualifyCombinedAudit } from './combined-audit-journey.fixture';

test.use({ actionTimeout: 20_000 });

test('qualifies exact bilingual analysis originals through independent audit and Certificate release on the pinned combined source', async ({
  page,
}, info) => {
  test.setTimeout(360_000);
  await qualifyCombinedAudit({ kind: 'registered', page, info });
});
