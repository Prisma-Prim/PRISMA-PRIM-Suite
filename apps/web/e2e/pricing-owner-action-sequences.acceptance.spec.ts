import { test } from './ui-chaos.fixture';
import { runBrowserSequences } from './browser-sequences.fixture';
import { pricingOwnerSequenceAdapter } from './pricing-owner-browser-sequences.fixture';
test.describe('generated pricing owners', () => {
  test.use({ chaosOwner: 'sequence' });
  test('explores generated native pricing owner sequences', async ({
    page,
  }, info) => {
    test.setTimeout(150_000);
    await runBrowserSequences({
      page,
      info,
      adapter: pricingOwnerSequenceAdapter,
    });
  });
});
test('preserves literal pricing history, exact retry and stale native intentions through Company replacement', async ({
  page,
}, info) => {
  test.setTimeout(150_000);
  const world = await pricingOwnerSequenceAdapter.open({
    page,
    info,
    trial: 0,
    initial: 'empty',
  });
  async function run(label: string, quantity: '1' | '3' = '3') {
    const action = world
      .actions({
        quantity,
        locale: info.project.name.endsWith('narrow') ? 'ru' : 'ro',
      })
      .find((item) => item.label === label);
    if (!action)
      throw new Error('Missing enabled pricing owner action: ' + label);
    await action.run();
    await world.verify();
  }
  try {
    await world.verify();
    await run('edit-literal-priced-quantity', '1');
    await run('lose-committed-monetary-receipt');
    await run('retry-exact-monetary-snapshot-double-admission');
    await run('edit-literal-priced-quantity');
    await run('calculate-native-monetary-snapshot');
    await run('reopen-exact-monetary-history');
    await run('retire-native-pricing-denial-before-company-recovery');
    await run('return-to-native-pricing-company');
    await run('retire-native-pricing-grant-in-current-company');
    await run('return-to-native-pricing-company');
    await run('conflict-with-native-effective-rule');
    await run('recover-native-effective-pricing');
    await run('leave-native-pricing-company');
    await run('return-to-native-pricing-company');
    await world.settle();
    await world.verify();
    await page
      .locator('.pricing-snapshot-panel:visible')
      .screenshot({ path: info.outputPath('pricing-owner-native-recipe.png') });
  } finally {
    await world.dispose();
  }
});
