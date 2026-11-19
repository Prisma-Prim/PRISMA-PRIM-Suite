import { expect, test } from './ui-chaos.fixture';
import { runBrowserSequences } from './browser-sequences.fixture';
import { projectTaskSequenceAdapter } from './project-task-browser-sequences.fixture';

test.use({ actionTimeout: 20_000 });
test.describe('generated Project Task sequences', () => {
  test.use({ chaosOwner: 'sequence' });
  test('explores generated native Project and Task action sequences', async ({
    page,
  }, info) => {
    test.setTimeout(150_000);
    await runBrowserSequences({
      page,
      info,
      adapter: projectTaskSequenceAdapter,
    });
  });
});

test('checks Project Task actions against native literal retry and independent-read recipes', async ({
  page,
}, info) => {
  test.setTimeout(150_000);
  const world = await projectTaskSequenceAdapter.open({
    page,
    info,
    trial: 1,
    initial: 'a',
  });
  type Values = Parameters<typeof world.actions>[0];
  async function run(
    label: string,
    values: Partial<Omit<Values, 'locale'>> = {},
  ) {
    const action = world
      .actions({
        variant: values.variant ?? 'a',
        locale: info.project.name.endsWith('narrow') ? 'ru' : 'ro',
        stage: values.stage ?? 'parser',
        replacement: values.replacement ?? 'project',
      })
      .find((entry) => entry.label === label);
    if (!action)
      throw new Error(`Missing enabled native Project Task recipe: ${label}`);
    await action.run();
    await world.verify();
  }
  try {
    await world.verify();
    await run('read-project-with-independent-task-draft');
    await run('write-project-with-independent-task-draft');
    await run('save-task-lost-receipt');
    await run('change-interface-locale');
    await run('retry-exact-task-with-double-admission');
    await run('edit-literal-task-instructions', { variant: 'b' });
    await run('save-task-failed-read');
    await run('reload-confirmed-or-conflicted-task-without-writing');
    await run('stale-task-revision-requires-deliberate-reload', {
      variant: 'b',
    });
    await run('reload-confirmed-or-conflicted-task-without-writing');
    await run('write-task-while-project-read-is-held');
    await run('navigate-and-reopen-exact-project-task');
    for (const stage of ['token', 'parser', 'http'] as const)
      for (const replacement of ['project', 'company', 'access'] as const) {
        const variant = stage === 'http' ? 'b' : 'a';
        const suffix =
          stage === 'http' && replacement !== 'project' ? '-403' : '';
        await run(`isolate-${stage}${suffix}-task-after-${replacement}`, {
          stage,
          replacement,
          variant,
        });
      }
    await world.settle();
    await world.verify();
    await expect(page.locator('.project-tasks:visible')).toBeVisible();
    await page.screenshot({
      path: info.outputPath('project-task-native-recipe.png'),
      fullPage: true,
    });
  } finally {
    await world.dispose();
  }
});
