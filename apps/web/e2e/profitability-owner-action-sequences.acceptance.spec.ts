import { test } from './ui-chaos.fixture';
import { runBrowserSequences } from './browser-sequences.fixture';
import { profitabilityOwnerSequenceAdapter } from './profitability-owner-browser-sequences.fixture';
test.describe('generated profitability owners', () => {
  test.use({ chaosOwner: 'sequence' });
  test('explores generated native profitability owner sequences', async ({
    page,
  }, info) => {
    test.setTimeout(150_000);
    await runBrowserSequences({
      page,
      info,
      adapter: profitabilityOwnerSequenceAdapter,
    });
  });
});
test('preserves literal profitability history, exact retry and stale native intentions through Company replacement', async ({
  page,
}, info) => {
  test.setTimeout(150_000);
  const world = await profitabilityOwnerSequenceAdapter.open({
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
      throw new Error('Missing enabled profitability owner action: ' + label);
    await action.run();
    await world.verify();
  }
  try {
    await world.verify();
    await run('edit-explicit-cost-and-price');
    await run('lose-native-estimate-confirmation');
    await run('retry-exact-estimate-double-admission');
    await run('approve-exact-human-selected-version');
    await run('edit-explicit-cost-and-price');
    await run('save-confirmed-native-estimate');
    await run('reject-native-stale-director-intention');
    await run('recover-native-estimate-history');
    await run('open-exact-earlier-estimate-version');
    await run('edit-explicit-cost-and-price');
    await run('save-confirmed-native-estimate');
    await run('edit-explicit-cost-and-price');
    await run('save-confirmed-native-estimate');
    await run('open-native-director-decision-queue');
    await run('retire-native-queue-read-through-company-replacement');
    await run('return-to-native-estimate-company');
    await run('open-native-director-decision-queue');
    await run('retire-native-director-denial-before-company-recovery');
    await run('return-to-native-estimate-company');
    await run('open-native-director-decision-queue');
    await run('retire-native-director-grant-in-current-company');
    await run('return-to-native-estimate-company');
    await run('open-native-director-decision-queue');
    await run('review-exact-native-queue-version');
    await run('approve-exact-native-queue-version');
    await run('return-from-native-decision-queue');
    await run('leave-native-estimate-company');
    await run('return-to-native-estimate-company');
    await world.settle();
    await world.verify();
    await page
      .locator('.commercial-intake-workspace:visible .profitability-estimate')
      .screenshot({
        path: info.outputPath('profitability-owner-native-recipe.png'),
      });
  } finally {
    await world.dispose();
  }
});
