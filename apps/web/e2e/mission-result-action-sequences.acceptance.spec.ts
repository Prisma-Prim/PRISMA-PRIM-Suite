import { expect, test } from './ui-chaos.fixture';
import { runBrowserSequences } from './browser-sequences.fixture';
import { missionResultSequenceAdapter } from './mission-result-browser-sequences.fixture';

test.use({ actionTimeout: 20_000 });
test.describe('generated mission result sequences', () => {
  test.use({ chaosOwner: 'sequence' });
  test('explores generated native mission Task-result action sequences', async ({
    page,
  }, info) => {
    test.setTimeout(150_000);
    await runBrowserSequences({
      page,
      info,
      adapter: missionResultSequenceAdapter,
    });
  });
});

test('preserves native mission result retry, originals and independent work across every retired read stage', async ({
  page,
}, info) => {
  test.setTimeout(150_000);
  const world = await missionResultSequenceAdapter.open({
    page,
    info,
    trial: 0,
    initial: 'empty',
  });
  type Values = Parameters<typeof world.actions>[0];
  const preferred = info.project.name.endsWith('narrow') ? 'ru' : 'ro';
  async function run(label: string, values: Partial<Values> = {}) {
    const action = world
      .actions({
        variant: 'a',
        locale: preferred,
        stage: 'parser',
        replacement: 'task',
        ...values,
      })
      .find((entry) => entry.label === label);
    if (!action)
      throw new Error(`Missing enabled native mission result recipe: ${label}`);
    await action.run();
    await world.verify();
  }
  try {
    await world.verify();
    await run('prepare-literal-mission-result');
    await run('save-result:lost-receipt');
    await run('retry-identical-result-command-double-admission');
    await run('prepare-literal-mission-result', { variant: 'b' });
    await run('save-result:failed-refresh');
    await run('recover-result-from-native-read');
    await run('prepare-literal-mission-result');
    await run('native-stale-task-result-intention');
    await run('recover-result-from-native-read');
    await run('prepare-literal-mission-result');
    await run('write-result-during-independent-project-read');
    for (const stage of ['token', 'parser', 'http'] satisfies Array<
      Values['stage']
    >) {
      for (const replacement of ['task', 'company', 'access'] satisfies Array<
        Values['replacement']
      >) {
        await run(`retire-${stage}-through-${replacement}-aba`, {
          stage,
          replacement,
        });
        const phases: string[] = [];
        for (let step = 0; step < 12; step++) {
          const action = world
            .actions({ variant: 'a', locale: preferred, stage, replacement })
            .find((entry) => entry.label.startsWith('held-read:'));
          if (!action) break;
          phases.push(action.label.slice('held-read:'.length));
          await action.run();
          await world.verify();
        }
        expect(phases).toContain('replace');
        expect(phases).toContain('return');
        expect(phases.at(-1)).toBe('release');
        if (replacement === 'company') expect(phases).toContain('return-task');
        if (replacement === 'access') {
          expect(phases).toContain('restore-access');
          expect(phases).toContain('return-access');
          expect(phases).toContain('restore-task');
        }
      }
    }
    await run('hold-native-denial-before-company-recovery');
    await run('replace-company-and-deliver-held-denial');
    await run('recover-native-source-company');
    for (const label of [
      'enter-native-result-projects',
      'select-native-result-project',
      'open-native-result-task',
    ]) {
      if (
        world
          .actions({
            variant: 'a',
            locale: preferred,
            stage: 'parser',
            replacement: 'task',
          })
          .some((action) => action.label === label)
      )
        await run(label);
    }
    await run('native-result-history');
    await run('download-exact-mission-original');
    await world.settle();
    await world.verify();
    await expect(page.locator('.task-results')).toBeVisible();
    await page.locator('.task-results').screenshot({
      path: info.outputPath('mission-result-curated-panel.png'),
    });
    await page.screenshot({
      path: info.outputPath('mission-result-native-recipe.png'),
      fullPage: true,
    });
  } finally {
    await world.dispose();
  }
});
