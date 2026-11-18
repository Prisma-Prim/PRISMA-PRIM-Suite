import { test } from './ui-chaos.fixture';
import { runBrowserSequences } from './browser-sequences.fixture';
import { offerOwnerSequenceAdapter } from './offer-owner-browser-sequences.fixture';

test.describe('generated Offer owner sequences', () => {
  test.use({ chaosOwner: 'sequence' });
  test('explores generated native Offer version owner sequences', async ({
    page,
  }, info) => {
    test.setTimeout(150_000);
    await runBrowserSequences({
      page,
      info,
      adapter: offerOwnerSequenceAdapter,
    });
  });
});

test('preserves literal Offer versions, exact retry, stale conflicts and independent source work through Company replacement', async ({
  page,
}, info) => {
  test.setTimeout(150_000);
  const world = await offerOwnerSequenceAdapter.open({
    page,
    info,
    trial: 0,
    initial: 'empty',
  });
  async function run(label: string) {
    const action = world
      .actions({
        variant: 'b',
        locale: info.project.name.endsWith('narrow') ? 'ru' : 'ro',
      })
      .find((item) => item.label === label);
    if (!action)
      throw new Error('Missing enabled Offer owner action: ' + label);
    await action.run();
    await world.verify();
  }
  try {
    await world.verify();
    await run('edit-literal-native-offer');
    await run('lose-committed-native-offer-receipt');
    await run('retry-exact-offer-command-with-double-admission');
    await run('write-during-independent-native-estimate-read');
    await run('retire-native-source-denial-before-company-recovery');
    await run('return-to-native-offer-company');
    await run('retire-native-source-grant-in-current-company');
    await run('return-to-native-offer-company');
    await run('reopen-native-offer-history');
    await run('native-stale-offer-revision');
    await run('recover-current-native-offer');
    await run('leave-native-offer-company');
    await run('return-to-native-offer-company');
    await world.settle();
    await world.verify();
    await page
      .locator('.offer-panel:visible')
      .screenshot({ path: info.outputPath('offer-owner-native-recipe.png') });
  } finally {
    await world.dispose();
  }
});
