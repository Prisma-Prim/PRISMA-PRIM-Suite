import { afterEach, expect, it, vi } from 'vitest';
import {
  fireEvent,
  render,
  screen,
} from '../test/render-with-interface-locale';
import { deterministicBrowserIdentity } from '../access-composition';
import { currentActor } from './current-work.fixture';
import { missionPlanAuthority } from './mission-plan-authority';
import {
  ModelAccessLifetime,
  useModelAccessRejection,
} from '../company-model/ModelAccessLifetime';
import {
  MissionPlanAccessLifetime,
  useMissionPlanRejection,
} from './mission-plan-access-lifetime';

afterEach(() => vi.unstubAllGlobals());

function Child() {
  const reject = useMissionPlanRejection();
  return (
    <button onClick={() => reject({ status: 'error' })}>
      Ordinary read failure
    </button>
  );
}

it('keeps ordinary read failures outside the denial and recovery latch', () => {
  const actor = currentActor();
  const authority = missionPlanAuthority(actor, 'copy');
  if (!authority) throw new Error('Missing synthetic plan authority.');
  const fetch = vi.fn();
  vi.stubGlobal('fetch', fetch);
  render(
    <MissionPlanAccessLifetime
      actor={actor}
      context={{ identity: deterministicBrowserIdentity(), authority }}
    >
      <Child />
    </MissionPlanAccessLifetime>,
  );
  fireEvent.click(
    screen.getByRole('button', { name: 'Ordinary read failure' }),
  );
  expect(screen.queryByRole('alert')).toBeNull();
  expect(
    screen.getByRole('button', { name: 'Ordinary read failure' }),
  ).toBeVisible();
  expect(fetch).not.toHaveBeenCalled();
});

function ModelChild() {
  useModelAccessRejection();
  return <p>Model child</p>;
}

it('preserves distinct required-context errors when a consumer has the wrong domain provider', () => {
  const actor = currentActor();
  const authority = missionPlanAuthority(actor, 'copy');
  if (!authority) throw new Error('Missing synthetic plan authority.');
  const identity = deterministicBrowserIdentity();
  expect(() =>
    render(
      <ModelAccessLifetime
        actor={actor}
        authority={authority}
        identity={identity}
        denied={() => null}
      >
        <Child />
      </ModelAccessLifetime>,
    ),
  ).toThrow('Mission-plan operations require their scoped access lifetime.');
  expect(() =>
    render(
      <MissionPlanAccessLifetime
        actor={actor}
        context={{ identity, authority }}
      >
        <ModelChild />
      </MissionPlanAccessLifetime>,
    ),
  ).toThrow('Company model access lifetime is required.');
});
