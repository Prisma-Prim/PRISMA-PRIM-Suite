import { test } from './ui-chaos.fixture';
import { runBrowserSequences } from './browser-sequences.fixture';
import { workingEvidenceSequenceAdapter } from './working-evidence-browser-sequences.fixture';

test.use({ actionTimeout: 20_000, chaosOwner: 'sequence' });

test('explores generated native Working Evidence action sequences', async ({
  page,
}, info) => {
  test.setTimeout(150_000);
  await runBrowserSequences({
    page,
    info,
    adapter: workingEvidenceSequenceAdapter,
  });
});
