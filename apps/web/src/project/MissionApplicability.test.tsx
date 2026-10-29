import { StrictMode } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import {
  fireEvent,
  render,
  screen,
  within,
} from '../test/render-with-interface-locale';
import {
  actor,
  companyId,
  projectId,
  plan,
  snapshot,
  installParentServer,
} from '../test/mission-applicability-app-fixture';
import { deterministicBrowserIdentity } from '../access-composition';
import { createAuthenticatedApiClient } from '../api/authenticated-api-client';
import { readCurrentActor } from '../access/current-actor';
import { readCopiedTemplatePlan } from './project-template-response';
import { MissionApplicability } from './MissionApplicability';

afterEach(() => vi.unstubAllGlobals());
it('keeps a confirmed receipt when the optional shared Activity refresh collaborator throws, independently of a failed current reload', async () => {
  let confirmed = false;
  installParentServer(
    () => actor,
    async (path, init) => {
      if (path === `/api/projects/${projectId}/mission-applicability`) {
        if (init?.method === 'POST') {
          confirmed = true;
          return Response.json(
            {
              action: 'recorded',
              projectId,
              factId: 'confirmed-fact-demo',
              applicabilityRevision: 1,
            },
            { status: 201 },
          );
        }
        return confirmed
          ? new Response(null, { status: 503 })
          : Response.json(snapshot());
      }
      return undefined;
    },
  );
  const identity = deterministicBrowserIdentity(),
    verified = await readCurrentActor({
      api: await createAuthenticatedApiClient(identity),
      companyContextId: companyId,
    }),
    copied = readCopiedTemplatePlan({ template: plan })?.template;
  if (verified.status !== 'ok' || !copied || !('activities' in copied))
    throw new Error('Expected complete verified public fixture');
  const refresh = vi.fn(async () => {
    throw new Error('Synthetic shared refresh boundary failure');
  });
  render(
    <StrictMode>
      <MissionApplicability
        actor={verified.value}
        plan={copied}
        identity={identity}
        projectId={projectId}
        onActivityRecorded={refresh}
      />
    </StrictMode>,
  );
  const panel = await screen.findByRole('region', {
    name: 'Mission activity applicability',
  });
  await within(panel).findByRole('combobox', { name: 'Source activity' });
  for (const [name, value] of [
    ['Proposal reason (1–1000 characters)', 'Reported proposal DEMO'],
    ['Reported scope basis (1–2000 characters)', 'Exact scope DEMO'],
    ['Reported agreement basis (1–2000 characters)', 'Reported basis DEMO'],
  ])
    fireEvent.change(within(panel).getByRole('textbox', { name }), {
      target: { value },
    });
  fireEvent.click(
    within(panel).getByRole('button', { name: 'Review exact proposal' }),
  );
  fireEvent.click(
    within(panel).getByRole('button', { name: 'Record proposal' }),
  );
  await within(panel).findByText('Applicability fact confirmed.');
  await within(panel).findByText('Current applicability could not be loaded.');
  expect(refresh).toHaveBeenCalledTimes(1);
  expect(
    within(panel).queryByRole('button', {
      name: 'Retry exact applicability command',
    }),
  ).not.toBeInTheDocument();
});
