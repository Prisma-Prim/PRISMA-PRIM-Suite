import { expect, test } from './ui-chaos.fixture';
import { runBrowserSequences } from './browser-sequences.fixture';
import { contractSigningSequenceAdapter } from './contract-browser-sequences.fixture';

test.use({ actionTimeout: 20_000 });
test.describe('generated Contract sequences', () => {
  test.use({ chaosOwner: 'sequence' });
  test('explores generated native Contract signing action sequences', async ({
    page,
  }, info) => {
    test.setTimeout(150_000);
    await runBrowserSequences({
      page,
      info,
      adapter: contractSigningSequenceAdapter,
    });
  });
});

test('checks the Contract signing sequence adapter against the native reported-signing recipe', async ({
  page,
}, info) => {
  test.setTimeout(180_000);
  const world = await contractSigningSequenceAdapter.open({
    page,
    info,
    trial: 1,
    initial: 'reported-date',
  });
  const run = async (label: string, locale: 'en' | 'fr' = 'en') => {
    const action = world
      .actions({ locale, variant: 'a' })
      .find((candidate) => candidate.label === label);
    if (!action)
      throw new Error(`Expected an enabled Contract recipe action: ${label}`);
    await action.run();
    await world.verify();
  };
  try {
    await run('edit-literal-reported-signing');
    await run('held-pdf-survives-independent-declarer-loss');
    await run('edit-literal-reported-signing');
    await run('declare-signing-lost-receipt');
    await run('change-interface-locale', 'fr');
    await run('retry-exact-contract-command-with-double-admission');
    await run('change-interface-locale');
    await run('fail-independent-read-then-recover-confirmed-contract');
    await run('download-exact-signing-pdf');
    await run('link-existing-thirteen-task-project-lost-receipt');
    await run('revoke-independent-pdf-and-declarer-authority');
    await run('retry-exact-contract-command-with-double-admission');
    await run('restore-independent-authority-and-original-pdf');
    await run('retire-held-pdf-200-after-company-aba');
    await run('retire-held-pdf-403-after-company-aba');
    await run('download-exact-signing-pdf');
    await page
      .locator('.model-contract-panel')
      .getByRole('heading', { name: 'Recorded declaration', exact: true })
      .scrollIntoViewIfNeeded();
    await page.screenshot({
      path: info.outputPath('contract-signing-sequence-viewport.png'),
    });
    await page.screenshot({
      path: info.outputPath('contract-signing-sequence-recipe.png'),
      fullPage: true,
    });
    expect(world.describe()).toMatchObject({
      declared: true,
      linked: true,
      revision: 4,
    });
  } finally {
    await world.dispose();
  }
});
