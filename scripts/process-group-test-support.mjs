import assert from 'node:assert/strict';

import { probeDetachedProcessGroupCapability } from './process-group.mjs';

export async function skipWithoutDetachedProcessGroups(context) {
  const capability = await probeDetachedProcessGroupCapability();
  if (capability.supported) {
    return false;
  }
  assert.notEqual(
    process.env.GITHUB_ACTIONS,
    'true',
    `GitHub Actions must retain real POSIX process-group coverage: ${capability.reason}`,
  );
  context.skip(capability.reason);
  return true;
}
