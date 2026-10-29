import { InterfaceLocaleSelect } from '../localization/InterfaceLocaleSelect';
import { StrictMode } from 'react';
import {
  fireEvent,
  render,
  screen,
  within,
} from './render-with-interface-locale';
import { App } from '../App';
import { deterministicBrowserIdentity } from '../access-composition';
import {
  actor,
  project,
  installParentServer,
} from './mission-applicability-app-fixture';
import { distantDecisionFixture } from './mission-applicability-history-fixture';
export async function openDistantHistory({
  override = async () => undefined,
  readActor = () => actor,
}: {
  override?: Parameters<typeof installParentServer>[1];
  readActor?: () => unknown;
} = {}) {
  const fixture = distantDecisionFixture();
  installParentServer(readActor, async (path, init, url) => {
    const overridden = await override(path, init, url);
    if (overridden) return overridden;
    if (path.endsWith('/mission-applicability/history')) {
      const before = url.searchParams.get('beforeRevision');
      return Response.json(
        fixture.page(before === null ? undefined : Number(before)),
      );
    }
    if (path.endsWith('/mission-applicability'))
      return Response.json(fixture.current);
    return undefined;
  });
  const view = render(
    <StrictMode>
      <InterfaceLocaleSelect />
      <App identity={deterministicBrowserIdentity()} />
    </StrictMode>,
  );
  const projects = await screen.findByRole('region', { name: 'Projects' });
  fireEvent.click(
    await within(projects).findByRole('button', {
      name: new RegExp(project.title),
    }),
  );
  const panel = await screen.findByRole('region', {
    name: 'Mission activity applicability',
  });
  const history = await within(panel).findByRole('region', {
    name: 'Project-wide applicability history',
  });
  await within(history).findByRole('article', {
    name: 'Proposal corrected — Version 60',
  });
  const approval = within(panel).getByRole('article', {
    name: 'Approved exclusion — Version 30',
  });
  const inspect = within(approval).getByRole('button', {
    name: 'Inspect referenced fact: Decision on proposal — Version 30',
  });
  return { view, panel, history, inspect, projects, fixture };
}
