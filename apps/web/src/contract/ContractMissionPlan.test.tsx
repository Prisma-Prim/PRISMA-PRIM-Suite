import {
  useInterfaceLocale,
  interfaceLocales,
} from '../localization/interface-locale';
import { afterEach, expect, it, vi } from 'vitest';
import { act, fireEvent, waitFor, within } from '@testing-library/react';
import { render, screen } from '../test/render-with-interface-locale';
import { deterministicBrowserIdentity } from '../access-composition';
import {
  actor,
  source,
  cataloguePage,
  userGrant,
  scope,
} from '../mission-plan/mission-plan.fixture';
import { ContractProjectsPanel } from './ContractProjectsPanel';
const identity = deterministicBrowserIdentity();
afterEach(() => vi.unstubAllGlobals());
function response(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}
const project = {
  id: 'configured-project',
  title: 'Literal configured mission',
  status: 'preparatory',
  createdAt: '2026-10-27T12:00:00.000Z',
};
const link = {
  id: 'configured-link',
  contractId: 'contract-one',
  projectId: project.id,
  revision: 4,
  created: true,
  actorWorkspaceMembershipId: actor.workspaceMembershipId,
  linkedAt: project.createdAt,
};
const props = {
  identity,
  companyId: scope.companyId,
  opportunityId: 'opportunity-one',
  contract: {
    id: 'contract-one',
    kind: 'CONTRACT' as const,
    revision: 3,
    linkedProjects: [],
    version: { executionState: 'EXECUTED' as const },
  },
  mayLink: true,
  mayCreate: true,
  opportunityTitle: 'Opportunity title',
  protectedCommand: false,
  reject: async () => undefined,
  onProtectionChange: () => undefined,
  onReload: () => undefined,
};
async function choose() {
  fireEvent.click(
    await screen.findByRole('button', {
      name: 'Open Version: Synthetic reusable plan',
    }),
  );
  fireEvent.click(
    await screen.findByRole('button', {
      name: 'Open Version: Synthetic reusable plan · Version 1',
    }),
  );
  const section = screen.getByRole('region', {
    name: 'Create a mission from a plan',
  });
  fireEvent.change(within(section).getByRole('textbox'), {
    target: { value: 'Literal configured mission' },
  });
  fireEvent.click(within(section).getByRole('checkbox'));
  return section;
}
it('keeps the exact configured command and acknowledgement through actual native candidate refresh before explicit retry', async () => {
  const sent: { path: string; body: unknown; key: string | null }[] = [],
    onLinked = vi.fn();
  let candidateReads = 0,
    finishCandidates: ((value: Response) => void) | undefined;
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init: RequestInit = {}) => {
      const path = new URL(String(input), window.location.origin).pathname;
      if (init.method === 'POST') {
        sent.push({
          path,
          body: init.body,
          key: new Headers(init.headers).get('idempotency-key'),
        });
        return sent.length === 1
          ? response({}, 500)
          : response({ project, link }, 201);
      }
      if (path.endsWith('/project-candidates')) {
        candidateReads += 1;
        if (candidateReads === 1) return response({ items: [] });
        if (candidateReads === 4) return response({}, 500);
        if (candidateReads === 2)
          return new Promise<Response>((resolve) => {
            finishCandidates = resolve;
          });
        return response({
          items: [{ ...project, alreadyLinked: true, otherContracts: [] }],
        });
      }
      if (path.endsWith('/versions/' + source.id))
        return response({ version: source });
      if (path.endsWith('/mission-plans')) return response(cataloguePage);
      throw new Error('Unexpected public request ' + path);
    }),
  );
  render(
    <ContractProjectsPanel
      {...props}
      missionPlan={{ actor }}
      onLinked={onLinked}
    />,
  );
  const section = await choose();
  fireEvent.click(
    within(section).getByRole('button', { name: 'Create and link mission' }),
  );
  const retry = await within(section).findByRole('button', {
    name: 'Retry the same Project creation',
  });
  const refresh = screen.getByRole('button', {
    name: 'Refresh eligible Projects',
  });
  expect(refresh).toBeEnabled();
  fireEvent.click(refresh);
  await waitFor(() => expect(finishCandidates).toBeDefined());
  expect(within(section).getByRole('checkbox')).toBeChecked();
  expect(within(section).getByRole('textbox')).toHaveValue(
    'Literal configured mission',
  );
  await act(async () => {
    finishCandidates?.(response({}, 500));
  });
  await screen.findByText('Project links could not be loaded. Try again.');
  expect(within(section).getByRole('checkbox')).toBeChecked();
  fireEvent.click(refresh);
  await waitFor(() => expect(candidateReads).toBe(3));
  await screen.findByText('Literal configured mission', { selector: 'strong' });
  expect(within(section).getByRole('checkbox')).toBeChecked();
  expect(within(section).getByRole('textbox')).toHaveValue(
    'Literal configured mission',
  );
  fireEvent.click(retry);
  await within(section).findByText('Preparatory Project created and linked.');
  expect(sent).toHaveLength(2);
  expect(sent[1]).toEqual(sent[0]);
  expect(sent[0]?.path).toMatch(/\/projects\/create-from-mission-plan$/);
  expect(JSON.parse(String(sent[0]?.body))).toEqual({
    title: 'Literal configured mission',
    expectedContractRevision: 3,
    acknowledgedCandidateProjectIds: [],
    missionPlan: {
      planId: source.planId,
      versionId: source.id,
      versionNumber: 1,
    },
  });
  expect(onLinked).toHaveBeenCalledOnce();
  fireEvent.click(refresh);
  await screen.findByText('Project links could not be loaded. Try again.');
  expect(
    within(section).getByText('Preparatory Project created and linked.'),
  ).toBeVisible();
  expect(
    within(section).queryByRole('button', {
      name: 'Retry the same Project creation',
    }),
  ).not.toBeInTheDocument();
});

it('retires direct plan denial and revalidates access while preserving the independent manual draft', async () => {
  const revalidated = vi.fn();
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const path = String(input);
      if (path.endsWith('/access/current-actor')) return response(actor);
      if (path.endsWith('/project-candidates')) return response({ items: [] });
      if (path.endsWith('/versions/' + source.id)) return response({}, 403);
      return response(cataloguePage);
    }),
  );
  render(
    <ContractProjectsPanel
      {...props}
      missionPlan={{ actor, onActorRevalidated: revalidated }}
      onLinked={() => undefined}
    />,
  );
  const manual = screen.getByRole('region', {
      name: 'Create a preparatory Project',
    }),
    field = within(manual).getByRole('textbox');
  fireEvent.change(field, {
    target: { value: 'Independent literal manual draft' },
  });
  fireEvent.click(
    await screen.findByRole('button', {
      name: 'Open Version: Synthetic reusable plan',
    }),
  );
  await screen.findByText('Mission-plan access is no longer available.');
  await waitFor(() => expect(revalidated).toHaveBeenCalledWith(actor));
  expect(within(manual).getByRole('textbox')).toBe(field);
  expect(field).toHaveValue('Independent literal manual draft');
  expect(field).toBeEnabled();
});

function servePlan(command: (init: RequestInit) => Promise<Response>) {
  const calls: string[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init: RequestInit = {}) => {
      const path = String(input);
      calls.push(path);
      if (init.method === 'POST') return command(init);
      if (path.endsWith('/project-candidates')) return response({ items: [] });
      if (path.endsWith('/versions/' + source.id))
        return response({ version: source });
      if (path.endsWith('/access/current-actor')) return response(actor);
      return response(cataloguePage);
    }),
  );
  return calls;
}
it.each(['company', 'session', 'grant'] as const)(
  'permanently retires planned work after a %s round trip and suppresses late success and denial',
  async (change) => {
    for (const status of [201, 403]) {
      let finish: ((r: Response) => void) | undefined;
      const calls = servePlan(
          () =>
            new Promise<Response>((resolve) => {
              finish = resolve;
            }),
        ),
        onLinked = vi.fn(),
        revalidated = vi.fn();
      const context = { actor, onActorRevalidated: revalidated };
      const view = render(
        <ContractProjectsPanel
          {...props}
          missionPlan={context}
          onLinked={onLinked}
        />,
      );
      const section = await choose();
      fireEvent.click(
        within(section).getByRole('button', {
          name: 'Create and link mission',
        }),
      );
      await waitFor(() => expect(finish).toBeDefined());
      const nextActor = {
        ...actor,
        activeCompany: {
          ...actor.activeCompany,
          id:
            change === 'company'
              ? '10000000-0000-4000-8000-000000000999'
              : scope.companyId,
          displayName: 'Synthetic Company',
          missionPlanGrants:
            change === 'grant'
              ? [
                  {
                    ...userGrant,
                    bundle: 'company_mission_plan_user',
                    assignmentId: '40000000-0000-4000-8000-000000000999',
                    permissionSetVersion: 'v1',
                    permissions: [
                      'project.mission_plan.read',
                      'project.mission_plan.instantiate',
                    ],
                  },
                ]
              : actor.activeCompany?.missionPlanGrants,
        },
      };
      view.rerender(
        <ContractProjectsPanel
          {...props}
          companyId={nextActor.activeCompany.id}
          identity={
            change === 'session' ? deterministicBrowserIdentity() : identity
          }
          missionPlan={{ actor: nextActor, onActorRevalidated: revalidated }}
          onLinked={onLinked}
        />,
      );
      view.rerender(
        <ContractProjectsPanel
          {...props}
          missionPlan={context}
          onLinked={onLinked}
        />,
      );
      await screen.findByRole('button', {
        name: 'Open Version: Synthetic reusable plan',
      });
      await act(async () => {
        finish?.(response({ project, link }, status));
      });
      expect(onLinked).not.toHaveBeenCalled();
      expect(revalidated).not.toHaveBeenCalled();
      expect(
        calls.filter((path) => path.endsWith('/access/current-actor')),
      ).toHaveLength(0);
      expect(
        screen.queryByText('Preparatory Project created and linked.'),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole('button', {
          name: 'Retry the same Project creation',
        }),
      ).not.toBeInTheDocument();
      view.unmount();
    }
  },
);
function LocaleChoices() {
  const { changeLocale } = useInterfaceLocale();
  return (
    <>
      {interfaceLocales.map((locale) => (
        <button key={locale} onClick={() => changeLocale(locale)}>
          {locale}
        </button>
      ))}
    </>
  );
}
it('preserves focus, exact selected source and protected command through four locales without I/O', async () => {
  const attempts: RequestInit[] = [],
    calls = servePlan(async (init) => {
      attempts.push(init);
      return attempts.length === 1
        ? response({}, 500)
        : response({ project, link }, 201);
    });
  render(
    <>
      <LocaleChoices />
      <ContractProjectsPanel
        {...props}
        missionPlan={{ actor }}
        onLinked={() => undefined}
      />
    </>,
  );
  const section = await choose(),
    field = within(section).getByRole('textbox');
  field.focus();
  const before = calls.length;
  for (const locale of ['ro', 'ru', 'fr', 'en']) {
    fireEvent.click(screen.getByRole('button', { name: locale }));
    expect(field).toHaveValue('Literal configured mission');
    expect(field).toHaveFocus();
    expect(calls).toHaveLength(before);
  }
  fireEvent.click(
    within(section).getByRole('button', { name: 'Create and link mission' }),
  );
  await within(section).findByRole('button', {
    name: 'Retry the same Project creation',
  });
  const pending = calls.length;
  for (const locale of ['fr', 'ru', 'ro', 'en'])
    fireEvent.click(screen.getByRole('button', { name: locale }));
  expect(calls).toHaveLength(pending);
  expect(field).toBeDisabled();
  expect(within(section).getByRole('checkbox')).toBeChecked();
  fireEvent.click(
    within(section).getByRole('button', {
      name: 'Retry the same Project creation',
    }),
  );
  await within(section).findByText('Preparatory Project created and linked.');
  expect(attempts).toHaveLength(2);
  expect(attempts[1]?.body).toBe(attempts[0]?.body);
  expect(new Headers(attempts[1]?.headers).get('idempotency-key')).toBe(
    new Headers(attempts[0]?.headers).get('idempotency-key'),
  );
});

it('treats a malformed successful reply as uncertainty and recovers the identical configured command', async () => {
  const commands: RequestInit[] = [];
  servePlan(async (init) => {
    commands.push(init);
    return commands.length === 1
      ? response(
          { project, link: { ...link, contractId: 'other-contract' } },
          201,
        )
      : response({ project, link }, 201);
  });
  render(
    <ContractProjectsPanel
      {...props}
      missionPlan={{ actor }}
      onLinked={() => undefined}
    />,
  );
  const section = await choose();
  fireEvent.click(
    within(section).getByRole('button', { name: 'Create and link mission' }),
  );
  const retry = await within(section).findByRole('button', {
    name: 'Retry the same Project creation',
  });
  expect(within(section).getByRole('textbox')).toBeDisabled();
  fireEvent.click(retry);
  await within(section).findByText('Preparatory Project created and linked.');
  expect(commands).toHaveLength(2);
  expect(commands[1]?.body).toBe(commands[0]?.body);
  expect(new Headers(commands[1]?.headers).get('idempotency-key')).toBe(
    new Headers(commands[0]?.headers).get('idempotency-key'),
  );
});
