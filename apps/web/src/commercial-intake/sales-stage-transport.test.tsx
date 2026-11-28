import { act, renderHook } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { deterministicBrowserIdentity } from '../access-composition';
import type { ActorContext } from '../access-types';
import { companyGrants } from '../access/company-grants.test-fixture';
import { useSalesStageTransport } from './sales-stage-transport';

// A fictional Company whose stage configuration the server refuses.
const companyId = '00000000-0000-4000-8000-000000001547';
const actor: ActorContext = {
  internalUserId: '00000000-0000-4000-8000-000000002547',
  workspaceMembershipId: '00000000-0000-4000-8000-000000003547',
  workspaceId: '00000000-0000-4000-8000-000000004547',
  workspaceName: 'Fictional Workspace',
  displayName: 'Ana Fictiv',
  email: 'ana@example.test',
  active: true,
  workspacePermissions: [],
  activeCompany: {
    id: companyId,
    displayName: 'Fictional Consulting',
    grants: companyGrants(
      {
        bundle: 'company_commercial_intake',
        version: 'v4',
        assignmentId: 'intake-assignment',
      },
      {
        bundle: 'company_sales_stage_configuration',
        version: 'v1',
        assignmentId: 'stage-configuration-assignment',
      },
    ),
  },
};

afterEach(() => vi.unstubAllGlobals());

it('forwards no late revalidated Actor once a newer Actor was observed during the recovery', async () => {
  let release: (response: Response) => void = () => undefined;
  const revalidation = new Promise<Response>((resolve) => {
    release = resolve;
  });
  vi.stubGlobal(
    'fetch',
    vi.fn(() => revalidation),
  );
  const onActorRevalidated = vi.fn();
  const props = {
    actor,
    identity: deterministicBrowserIdentity(),
    onActivityRecorded: vi.fn(),
    onActorRevalidated,
    onCompanyContextRejected: vi.fn(),
    onWorkspaceAccessRejected: vi.fn(),
  };
  const { result, rerender } = renderHook(
    (current: typeof props) => useSalesStageTransport(current),
    { initialProps: props },
  );
  const transport = result.current;
  if (transport.status !== 'ready') throw new Error('Expected the settings.');
  const outcome = transport.settings.handleAccess(
    { status: 403, body: {} },
    companyId,
    new AbortController().signal,
    'sales-stage-configuration',
  );
  // Another screen accepts a newer Actor with the same grants meanwhile.
  rerender({ ...props, actor: { ...actor, displayName: 'Ana Fictiv (nou)' } });
  await act(async () => {
    release(Response.json(actor));
    await outcome;
  });
  expect(onActorRevalidated).not.toHaveBeenCalled();
  // The newer Actor still reads Commercial Intake: the list stays readable.
  await expect(outcome).resolves.toBe('retained');
});
