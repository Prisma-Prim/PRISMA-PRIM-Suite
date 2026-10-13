import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { deterministicBrowserIdentity } from '../access-composition';
import type { ActorContext } from '../access-types';
import { ApplicationPresentation } from '../production-shell/application-presentation';
import { changeValue, selectOption } from '../test/select-option';
import { CompanyContextAccess } from './CompanyContextAccess';
import { WorkspaceMembershipSuspension } from './WorkspaceMembershipSuspension';
import { contractDecisionMessages } from '../contract/contract-decision.copy';
import { resolveMessage } from '../localization/messages';

const memberId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const ownerMembershipId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const companyId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

const capturedVersionExplanation =
  'The version is captured when access is granted. A later version applies only after this access is revoked and granted again.';
const bundleLabels = {
  context: 'Company Context Access',
  director: 'Company Director Client Access',
  commercial: 'Company Commercial Intake',
  catalogue: 'Company Service Catalogue',
  pricing: 'Company Pricing Configuration',
  pricingUser: 'Company Pricing User',
  offerPreparer: 'Company Offer Preparer',
  contractApprover: 'Company Contract Approver',
  pricingAdjustment: 'Company Pricing Adjustment',
  reader: 'Company Commercial Activity Reader',
  manager: 'Company Opportunity Manager',
  stageConfiguration: 'Company Sales Stage Configuration',
  project: 'Company Project Access',
  approver: 'Company Project Approver',
} as const;
const serverVersions = {
  context: null,
  director: 'v2',
  commercial: 'v4',
  catalogue: 'v1',
  pricing: 'v1',
  pricingUser: 'v1',
  offerPreparer: 'v1',
  contractApprover: 'v1',
  pricingAdjustment: 'v1',
  reader: 'v1',
  manager: 'v2',
  stageConfiguration: 'v1',
  project: 'v2',
  approver: 'v1',
} as const;

const administration = (
  bundle?: keyof typeof bundleLabels,
  permissionSetVersion: string | null | undefined = bundle
    ? serverVersions[bundle]
    : undefined,
) => ({
  members: [
    {
      workspaceMembershipId: memberId,
      displayName: 'Ada Member',
      email: 'ada@example.test',
    },
    {
      workspaceMembershipId: ownerMembershipId,
      displayName: 'Workspace Owner',
      email: 'owner@example.test',
    },
  ],
  companies: [{ id: companyId, displayName: 'PRISMA-PRIM' }],
  assignments: bundle
    ? [
        {
          id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
          workspaceMembershipId: memberId,
          companyId,
          bundle: bundleLabels[bundle],
          permissionSetVersion,
          active: true,
        },
      ]
    : [],
});

describe('CompanyContextAccess', () => {
  it('grants and revokes captured Contract Approver v1 through the localized administration choice', async () => {
    let active = false;
    const commands: Array<{
      method: string;
      path: string;
      key: string | null;
      body: unknown;
    }> = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (path: string, options?: RequestInit) => {
        if (path === '/api/company-context-assignments/administration')
          return Response.json(
            administration(active ? 'contractApprover' : undefined),
          );
        if (path.startsWith('/api/company-contract-approver-assignments')) {
          const body: unknown =
            typeof options?.body === 'string'
              ? JSON.parse(options.body)
              : undefined;
          commands.push({
            method: options?.method ?? 'GET',
            path,
            key: new Headers(options?.headers).get('idempotency-key'),
            body,
          });
          active = options?.method === 'POST';
          return Response.json(
            {
              id: 'contract-approver-assignment',
              workspaceMembershipId: memberId,
              companyId,
              bundle: 'Company Contract Approver',
              permissionSetVersion: 'v1',
              active,
            },
            { status: active ? 201 : 200 },
          );
        }
        return new Response(null, { status: 404 });
      }),
    );
    render(
      <CompanyContextAccess
        actor={ownerActor}
        identity={deterministicBrowserIdentity()}
      />,
    );
    await screen.findByLabelText('Workspace member');
    chooseTargets();
    chooseBundle('contract-approver');
    expect(
      screen.getByText(
        resolveMessage(contractDecisionMessages, 'ro', 'prerequisites'),
      ),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Grant access' }));
    await screen.findByText('Access granted. Server state refreshed.');
    expect(screen.getByText(/Current server state:/)).toHaveTextContent(
      'Granted — captured version v1',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Revoke access' }));
    await screen.findByText('Access revoked. Server state refreshed.');
    expect(screen.getByText(/Current server state:/)).toHaveTextContent(
      'Not granted',
    );
    expect(commands).toEqual([
      {
        method: 'POST',
        path: '/api/company-contract-approver-assignments',
        key: expect.any(String),
        body: { workspaceMembershipId: memberId, companyId },
      },
      {
        method: 'DELETE',
        path: `/api/company-contract-approver-assignments/${memberId}/${companyId}`,
        key: expect.any(String),
        body: undefined,
      },
    ]);
    expect(commands[0]?.key).not.toBe(commands[1]?.key);
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('presents access administration in Prisme while preserving the Classic public markup', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Response.json(administration())),
    );

    const classic = render(
      <CompanyContextAccess
        actor={ownerActor}
        identity={deterministicBrowserIdentity()}
      />,
    );
    const classicAccess = await screen.findByRole('region', {
      name: 'Company access',
    });
    expect(classicAccess).not.toHaveClass('company-access--prisme');
    expect(classicAccess.firstElementChild).toHaveClass('eyebrow');
    expect(classicAccess.querySelector('form')).not.toHaveClass(
      'company-access-form',
    );
    expect(
      within(classicAccess).getByRole('region', {
        name: 'Identity-provider sessions',
      }),
    ).not.toHaveClass('session-revocations--prisme');
    classic.unmount();

    render(
      <ApplicationPresentation value="prisme">
        <CompanyContextAccess
          actor={ownerActor}
          identity={deterministicBrowserIdentity()}
        />
      </ApplicationPresentation>,
    );
    const access = await screen.findByRole('region', {
      name: 'Company access',
    });
    expect(access).toHaveClass('company-access--prisme');
    expect(access.querySelector('form')).toHaveClass('company-access-form');
    expect(
      within(access).getByRole('region', {
        name: 'Identity-provider sessions',
      }),
    ).toHaveClass('session-revocations--prisme');
    expect(
      within(access).getByRole('region', { name: 'Workspace access' }),
    ).toHaveClass('membership-suspension--prisme');
  });

  it('loads only human-readable member and Company choices without UUID entry fields', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          new Response(JSON.stringify(administration()), { status: 200 }),
        ),
    );

    render(
      <CompanyContextAccess
        actor={ownerActor}
        identity={deterministicBrowserIdentity()}
      />,
    );

    expect(
      await screen.findByLabelText('Workspace member'),
    ).toBeInTheDocument();
    const memberSelect = screen.getByRole('combobox', {
      name: 'Workspace member',
    });
    fireEvent.click(memberSelect);
    expect(
      screen.getByRole('option', {
        name: 'Ada Member — ada@example.test',
      }),
    ).toBeInTheDocument();
    fireEvent.click(memberSelect);
    const companySelect = screen.getByRole('combobox', { name: 'Company' });
    fireEvent.click(companySelect);
    expect(screen.getByRole('option', { name: 'PRISMA-PRIM' })).toBeVisible();
    fireEvent.click(companySelect);
    expect(
      screen.queryByLabelText('Workspace membership ID'),
    ).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Company ID')).not.toBeInTheDocument();
    const bundleSelect = screen.getByRole('combobox', {
      name: 'Access bundle',
    });
    fireEvent.click(bundleSelect);
    expect(
      screen.getByRole('option', { name: 'Company Offer Preparer' }),
    ).toBeVisible();
    fireEvent.click(bundleSelect);

    chooseTargets();
    expect(screen.getByText(/Current server state:/)).toHaveTextContent(
      /^Current server state: Not granted$/,
    );
    expect(
      screen.queryByText(capturedVersionExplanation),
    ).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Grant access' })).toBeEnabled();
    expect(
      screen.getByRole('button', { name: 'Revoke access' }),
    ).toBeDisabled();
  });

  it.each(['classic', 'prisme'] as const)(
    'shows the exact captured version of an active legacy assignment in %s',
    async (presentation) => {
      vi.stubGlobal(
        'fetch',
        vi.fn(async () => Response.json(administration('director', 'v1'))),
      );

      render(
        <ApplicationPresentation value={presentation}>
          <CompanyContextAccess
            actor={ownerActor}
            identity={deterministicBrowserIdentity()}
          />
        </ApplicationPresentation>,
      );
      await screen.findByLabelText('Workspace member');
      chooseTargets();
      chooseBundle('director-client');

      expect(screen.getByText(/Current server state:/)).toHaveTextContent(
        /^Current server state: Granted — captured version v1$/,
      );
      expect(screen.getByText(capturedVersionExplanation)).toBeInTheDocument();
      expect(
        screen.getByRole('button', { name: 'Revoke access' }),
      ).toBeEnabled();
      expect(
        screen.getByRole('button', { name: 'Grant access' }),
      ).toBeDisabled();
    },
  );

  it('shows the server-captured version only after an explicit revoke and fresh grant', async () => {
    let assignment: 'legacy' | 'revoked' | 'fresh' = 'legacy';
    const commands: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (path: string, options?: RequestInit) => {
        if (path === '/api/company-context-assignments/administration')
          return Response.json(
            assignment === 'revoked'
              ? administration()
              : administration(
                  'director',
                  assignment === 'fresh' ? 'v2' : 'v1',
                ),
          );
        if (path.startsWith('/api/company-director-client-assignments')) {
          commands.push(options?.method ?? 'GET');
          assignment = options?.method === 'POST' ? 'fresh' : 'revoked';
          return Response.json({}, { status: 200 });
        }
        return new Response(null, { status: 404 });
      }),
    );
    render(
      <CompanyContextAccess
        actor={ownerActor}
        identity={deterministicBrowserIdentity()}
      />,
    );
    await screen.findByLabelText('Workspace member');
    chooseTargets();
    chooseBundle('director-client');
    expect(screen.getByText(/Current server state:/)).toHaveTextContent(
      /^Current server state: Granted — captured version v1$/,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Revoke access' }));
    await screen.findByText('Access revoked. Server state refreshed.');
    expect(screen.getByText(/Current server state:/)).toHaveTextContent(
      /^Current server state: Not granted$/,
    );
    expect(
      screen.queryByText(capturedVersionExplanation),
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Grant access' }));
    await screen.findByText('Access granted. Server state refreshed.');
    expect(screen.getByText(/Current server state:/)).toHaveTextContent(
      /^Current server state: Granted — captured version v2$/,
    );
    expect(screen.getByText(capturedVersionExplanation)).toBeInTheDocument();
    expect(commands).toEqual(['DELETE', 'POST']);
  });

  it('keeps a legacy Company Project Access v1 and shows the fresh v2 grant after revoke', async () => {
    let assignment: 'legacy' | 'revoked' | 'fresh' = 'legacy';
    const commands: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (path: string, options?: RequestInit) => {
        if (path === '/api/company-context-assignments/administration')
          return Response.json(
            assignment === 'revoked'
              ? administration()
              : assignment === 'fresh'
                ? administration('project')
                : administration('project', 'v1'),
          );
        if (path.startsWith('/api/company-project-assignments')) {
          commands.push(`${options?.method ?? 'GET'} ${path}`);
          assignment = options?.method === 'POST' ? 'fresh' : 'revoked';
          return Response.json({}, { status: 200 });
        }
        return new Response(null, { status: 404 });
      }),
    );
    render(
      <ApplicationPresentation value="prisme">
        <CompanyContextAccess
          actor={ownerActor}
          identity={deterministicBrowserIdentity()}
        />
      </ApplicationPresentation>,
    );
    await screen.findByLabelText('Workspace member');
    chooseTargets();
    chooseBundle('project');
    expect(screen.getByText(/Current server state:/)).toHaveTextContent(
      /^Current server state: Granted — captured version v1$/,
    );
    expect(screen.getByText(capturedVersionExplanation)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Revoke access' }));
    await screen.findByText('Access revoked. Server state refreshed.');
    fireEvent.click(screen.getByRole('button', { name: 'Grant access' }));
    await screen.findByText('Access granted. Server state refreshed.');

    expect(screen.getByText(/Current server state:/)).toHaveTextContent(
      /^Current server state: Granted — captured version v2$/,
    );
    expect(screen.getByText(capturedVersionExplanation)).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Revoke access' })).toBeEnabled();
    expect(commands).toEqual([
      `DELETE /api/company-project-assignments/${memberId}/${companyId}`,
      'POST /api/company-project-assignments',
    ]);
  });

  it('shows the version reported by the reloaded state rather than the grant response', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(Response.json(administration()))
        .mockResolvedValueOnce(
          Response.json(
            {
              id: 'assignment-1',
              workspaceMembershipId: memberId,
              companyId,
              bundle: 'Company Director Client Access',
              permissionSetVersion: 'v2',
              active: true,
            },
            { status: 201 },
          ),
        )
        .mockResolvedValueOnce(Response.json(administration('director', 'v1'))),
    );
    render(
      <CompanyContextAccess
        actor={ownerActor}
        identity={deterministicBrowserIdentity()}
      />,
    );
    await screen.findByLabelText('Workspace member');
    chooseTargets();
    chooseBundle('director-client');
    fireEvent.click(screen.getByRole('button', { name: 'Grant access' }));

    await screen.findByText('Access granted. Server state refreshed.');
    expect(screen.getByText(/Current server state:/)).toHaveTextContent(
      /^Current server state: Granted — captured version v1$/,
    );
  });

  it.each([
    {
      name: 'a null Contract Approver version',
      assignment: { bundle: 'Company Contract Approver', version: null },
    },
    {
      name: 'a missing Contract Approver version',
      assignment: { bundle: 'Company Contract Approver', version: undefined },
    },
    {
      name: 'an unknown Contract Approver version',
      assignment: { bundle: 'Company Contract Approver', version: 'v2' },
    },
    {
      name: 'an unknown Director Client version',
      assignment: { bundle: 'Company Director Client Access', version: 'v3' },
    },
    {
      name: 'a missing Director Client version',
      assignment: {
        bundle: 'Company Director Client Access',
        version: undefined,
      },
    },
    {
      name: 'a null Director Client version',
      assignment: { bundle: 'Company Director Client Access', version: null },
    },
    {
      name: 'an unknown Project Access version',
      assignment: { bundle: 'Company Project Access', version: 'v3' },
    },
    {
      name: 'a null Project Access version',
      assignment: { bundle: 'Company Project Access', version: null },
    },
    {
      name: 'a second version of a single-version bundle',
      assignment: { bundle: 'Company Task Manager', version: 'v2' },
    },
    {
      name: 'a version on Company Context Access',
      assignment: { bundle: 'Company Context Access', version: 'v1' },
    },
    {
      name: 'a null Pricing Configuration version',
      assignment: { bundle: 'Company Pricing Configuration', version: null },
    },
    {
      name: 'no Pricing Configuration version',
      assignment: {
        bundle: 'Company Pricing Configuration',
        version: undefined,
      },
    },
    {
      name: 'a v2 Pricing Configuration version',
      assignment: { bundle: 'Company Pricing Configuration', version: 'v2' },
    },
    {
      name: 'a V1 Pricing Configuration version',
      assignment: { bundle: 'Company Pricing Configuration', version: 'V1' },
    },
    {
      name: 'a v3 Opportunity Manager version',
      assignment: { bundle: 'Company Opportunity Manager', version: 'v3' },
    },
    {
      name: 'a v5 Commercial Intake version',
      assignment: { bundle: 'Company Commercial Intake', version: 'v5' },
    },
    {
      name: 'a null Sales Stage Configuration version',
      assignment: {
        bundle: 'Company Sales Stage Configuration',
        version: null,
      },
    },
    {
      name: 'a v2 Sales Stage Configuration version',
      assignment: {
        bundle: 'Company Sales Stage Configuration',
        version: 'v2',
      },
    },
    {
      name: 'a null Opportunity Manager version',
      assignment: { bundle: 'Company Opportunity Manager', version: null },
    },
    {
      name: 'a null Project Approver version',
      assignment: { bundle: 'Company Project Approver', version: null },
    },
    {
      name: 'a v2 Project Approver version',
      assignment: { bundle: 'Company Project Approver', version: 'v2' },
    },
    {
      name: 'a null Pricing User version',
      assignment: { bundle: 'Company Pricing User', version: null },
    },
    {
      name: 'no Pricing User version',
      assignment: { bundle: 'Company Pricing User', version: undefined },
    },
    {
      name: 'a v2 Pricing User version',
      assignment: { bundle: 'Company Pricing User', version: 'v2' },
    },
    {
      name: 'a V1 Pricing User version',
      assignment: { bundle: 'Company Pricing User', version: 'V1' },
    },
    {
      name: 'a null Pricing Adjustment version',
      assignment: { bundle: 'Company Pricing Adjustment', version: null },
    },
    {
      name: 'a v2 Pricing Adjustment version',
      assignment: { bundle: 'Company Pricing Adjustment', version: 'v2' },
    },
    {
      name: 'an unknown bundle label',
      assignment: { bundle: 'Company Unlisted Access', version: 'v1' },
    },
    {
      name: 'a missing bundle label',
      assignment: { bundle: undefined, version: 'v1' },
    },
  ])(
    'fails closed on $name and recovers through Retry',
    async ({ assignment }) => {
      vi.stubGlobal(
        'fetch',
        vi
          .fn()
          .mockResolvedValueOnce(
            Response.json({
              ...administration(),
              assignments: [
                {
                  id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
                  workspaceMembershipId: memberId,
                  companyId,
                  bundle: assignment.bundle,
                  permissionSetVersion: assignment.version,
                  active: true,
                },
              ],
            }),
          )
          .mockResolvedValueOnce(Response.json(administration('director'))),
      );
      render(
        <CompanyContextAccess
          actor={ownerActor}
          identity={deterministicBrowserIdentity()}
        />,
      );

      expect(await screen.findByRole('alert')).toHaveTextContent(
        'The access state could not be loaded or changed.',
      );
      expect(
        screen.queryByLabelText('Workspace member'),
      ).not.toBeInTheDocument();
      fireEvent.click(
        screen.getByRole('button', { name: 'Retry access state' }),
      );
      await screen.findByLabelText('Workspace member');
      chooseTargets();
      chooseBundle('director-client');
      expect(screen.getByText(/Current server state:/)).toHaveTextContent(
        /^Current server state: Granted — captured version v2$/,
      );
    },
  );

  it('concludes a confirmed grant only after Retry reloads the state rejected for an unknown version', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(Response.json(administration()))
        .mockResolvedValueOnce(Response.json({}, { status: 201 }))
        .mockResolvedValueOnce(Response.json(administration('director', 'v9')))
        .mockResolvedValueOnce(Response.json(administration('director'))),
    );
    render(
      <CompanyContextAccess
        actor={ownerActor}
        identity={deterministicBrowserIdentity()}
      />,
    );
    await screen.findByLabelText('Workspace member');
    chooseTargets();
    chooseBundle('director-client');
    fireEvent.click(screen.getByRole('button', { name: 'Grant access' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'The access state could not be loaded or changed.',
    );
    expect(
      screen.queryByText('Access granted. Server state refreshed.'),
    ).not.toBeInTheDocument();
    expect(screen.queryByText(/captured version/)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Retry access state' }));
    await screen.findByText('Access granted. Server state refreshed.');
    expect(screen.getByText(/Current server state:/)).toHaveTextContent(
      /^Current server state: Granted — captured version v2$/,
    );
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Grant access' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Revoke access' })).toBeEnabled();
    expect(fetch).toHaveBeenCalledTimes(4);

    chooseBundle('company-context');
    expect(screen.getByText(/Current server state:/)).toHaveTextContent(
      /^Current server state: Not granted$/,
    );
    expect(
      screen.queryByText('Access granted. Server state refreshed.'),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Grant access' })).toBeEnabled();
    expect(
      screen.getByRole('button', { name: 'Revoke access' }),
    ).toBeDisabled();
  });

  it('keeps a confirmed revoke unconcluded through a failed Retry until the state reloads', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(Response.json(administration('director')))
        .mockResolvedValueOnce(Response.json({}, { status: 200 }))
        .mockResolvedValueOnce(
          Response.json({ ...administration(), members: 'invalid' }),
        )
        .mockResolvedValueOnce(
          Response.json({ ...administration(), members: 'invalid' }),
        )
        .mockResolvedValueOnce(Response.json(administration())),
    );
    render(
      <CompanyContextAccess
        actor={ownerActor}
        identity={deterministicBrowserIdentity()}
      />,
    );
    await screen.findByLabelText('Workspace member');
    chooseTargets();
    chooseBundle('director-client');
    fireEvent.click(screen.getByRole('button', { name: 'Revoke access' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'The access state could not be loaded or changed.',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Retry access state' }));
    await screen.findByRole('button', { name: 'Retry access state' });
    expect(fetch).toHaveBeenCalledTimes(4);
    expect(
      screen.queryByText('Access revoked. Server state refreshed.'),
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Retry access state' }));
    await screen.findByText('Access revoked. Server state refreshed.');
    expect(screen.getByText(/Current server state:/)).toHaveTextContent(
      /^Current server state: Not granted$/,
    );
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Grant access' })).toBeEnabled();
    expect(
      screen.getByRole('button', { name: 'Revoke access' }),
    ).toBeDisabled();
  });

  it('keeps an uncertain grant replayable with its key after Retry reloads the state', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(Response.json(administration()))
        .mockResolvedValueOnce(new Response(null, { status: 500 }))
        .mockResolvedValueOnce(Response.json(administration('director', 'v9')))
        .mockResolvedValueOnce(Response.json(administration('director')))
        .mockResolvedValueOnce(Response.json({}, { status: 201 }))
        .mockResolvedValueOnce(Response.json(administration('director'))),
    );
    render(
      <CompanyContextAccess
        actor={ownerActor}
        identity={deterministicBrowserIdentity()}
      />,
    );
    await screen.findByLabelText('Workspace member');
    chooseTargets();
    chooseBundle('director-client');
    fireEvent.click(screen.getByRole('button', { name: 'Grant access' }));
    await screen.findByRole('alert');
    fireEvent.click(screen.getByRole('button', { name: 'Retry access state' }));
    await screen.findByLabelText('Workspace member');

    expect(screen.getByText(/Current server state:/)).toHaveTextContent(
      /^Current server state: Granted — captured version v2$/,
    );
    expect(screen.getByRole('alert')).toHaveTextContent(
      'The access state could not be loaded or changed.',
    );
    expect(
      screen.queryByText('Access granted. Server state refreshed.'),
    ).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Grant access' })).toBeEnabled();

    fireEvent.click(screen.getByRole('button', { name: 'Grant access' }));
    await screen.findByText('Access granted. Server state refreshed.');
    const firstKey = new Headers(
      vi.mocked(fetch).mock.calls[1]?.[1]?.headers,
    ).get('idempotency-key');
    const replayKey = new Headers(
      vi.mocked(fetch).mock.calls[4]?.[1]?.headers,
    ).get('idempotency-key');
    expect(firstKey).toBeTruthy();
    expect(replayKey).toBe(firstKey);
  });

  it('requires a named confirmation before suspending a Workspace member and reloads canonical state', async () => {
    const afterSuspension = {
      ...administration(),
      members: administration().members.filter(
        (member) => member.workspaceMembershipId !== memberId,
      ),
    };
    const refreshActivity = vi.fn(async () => undefined);
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(
          new Response(JSON.stringify(administration()), { status: 200 }),
        )
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({
              workspaceMembershipId: memberId,
              status: 'inactive',
            }),
            { status: 201 },
          ),
        )
        .mockResolvedValueOnce(
          new Response(JSON.stringify(afterSuspension), { status: 200 }),
        ),
    );

    render(
      <CompanyContextAccess
        actor={ownerActor}
        identity={deterministicBrowserIdentity()}
        onActivityRecorded={refreshActivity}
      />,
    );

    await screen.findByLabelText('Workspace member');
    changeValue(screen.getByLabelText('Member to suspend'), memberId);
    fireEvent.click(screen.getByRole('button', { name: 'Review suspension' }));

    expect(fetch).toHaveBeenCalledOnce();
    expect(
      within(
        screen.getByRole('region', {
          name: 'Confirm Workspace access suspension',
        }),
      ).getByText('Ada Member — ada@example.test'),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        'Their application access will stop. Their identity, assignments, and history will be preserved. Existing identity-provider sessions will also be revoked across this application.',
      ),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Suspend access' }));

    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(3));
    expect(fetch).toHaveBeenNthCalledWith(
      2,
      '/api/workspace-membership-suspensions',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ workspaceMembershipId: memberId }),
        headers: expect.objectContaining({
          'idempotency-key': expect.any(String),
        }),
      }),
    );
    expect(fetch).toHaveBeenNthCalledWith(
      3,
      '/api/company-context-assignments/administration',
      expect.any(Object),
    );
    expect(
      await screen.findByText('Member suspended. Server state refreshed.'),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText('Member to suspend'));
    expect(
      screen.queryByRole('option', { name: 'Ada Member — ada@example.test' }),
    ).not.toBeInTheDocument();
    expect(refreshActivity).toHaveBeenCalledOnce();
  });

  it('cancels a reviewed suspension without making a command request', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          new Response(JSON.stringify(administration()), { status: 200 }),
        ),
    );
    render(
      <CompanyContextAccess
        actor={ownerActor}
        identity={deterministicBrowserIdentity()}
      />,
    );

    await screen.findByLabelText('Member to suspend');
    changeValue(screen.getByLabelText('Member to suspend'), memberId);
    fireEvent.click(screen.getByRole('button', { name: 'Review suspension' }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(fetch).toHaveBeenCalledOnce();
    expect(
      screen.queryByRole('region', {
        name: 'Confirm Workspace access suspension',
      }),
    ).not.toBeInTheDocument();
  });

  it('resets a reviewed suspension only after the actor changes', async () => {
    const identity = deterministicBrowserIdentity();
    const members = [
      {
        workspaceMembershipId: memberId,
        label: 'Ada Member — ada@example.test',
      },
    ];
    const reloadAdministration = vi.fn(async () => true);
    const onPendingChange = vi.fn();
    const onActivityRecorded = vi.fn(async () => undefined);
    const onWorkspaceAccessRejected = vi.fn(async () => undefined);
    const { rerender } = render(
      <WorkspaceMembershipSuspension
        actor={ownerActor}
        identity={identity}
        members={members}
        disabled={false}
        reloadAdministration={reloadAdministration}
        onPendingChange={onPendingChange}
        onActivityRecorded={onActivityRecorded}
        onWorkspaceAccessRejected={onWorkspaceAccessRejected}
      />,
    );

    expect(onPendingChange).not.toHaveBeenCalled();
    changeValue(screen.getByLabelText('Member to suspend'), memberId);
    fireEvent.click(screen.getByRole('button', { name: 'Review suspension' }));
    expect(
      screen.getByRole('region', {
        name: 'Confirm Workspace access suspension',
      }),
    ).toBeInTheDocument();

    const replacementActor: ActorContext = {
      ...ownerActor,
      internalUserId: '11111111-1111-4111-8111-111111111111',
      workspaceMembershipId: '22222222-2222-4222-8222-222222222222',
    };
    rerender(
      <WorkspaceMembershipSuspension
        actor={replacementActor}
        identity={identity}
        members={members}
        disabled={false}
        reloadAdministration={reloadAdministration}
        onPendingChange={onPendingChange}
        onActivityRecorded={onActivityRecorded}
        onWorkspaceAccessRejected={onWorkspaceAccessRejected}
      />,
    );

    await waitFor(() =>
      expect(
        screen.queryByRole('region', {
          name: 'Confirm Workspace access suspension',
        }),
      ).not.toBeInTheDocument(),
    );
    expect(screen.getByLabelText('Member to suspend')).toHaveValue('');
    expect(onPendingChange).toHaveBeenCalledOnce();
    expect(onPendingChange).toHaveBeenLastCalledWith(false);
  });

  it('resets a reviewed suspension only after BrowserIdentity changes', async () => {
    const firstIdentity = deterministicBrowserIdentity({
      'x-test-identity': 'first',
    });
    const secondIdentity = deterministicBrowserIdentity({
      'x-test-identity': 'second',
    });
    const members = [
      {
        workspaceMembershipId: memberId,
        label: 'Ada Member — ada@example.test',
      },
    ];
    const reloadAdministration = vi.fn(async () => true);
    const onPendingChange = vi.fn();
    const onActivityRecorded = vi.fn(async () => undefined);
    const onWorkspaceAccessRejected = vi.fn(async () => undefined);
    const { rerender } = render(
      <WorkspaceMembershipSuspension
        actor={ownerActor}
        identity={firstIdentity}
        members={members}
        disabled={false}
        reloadAdministration={reloadAdministration}
        onPendingChange={onPendingChange}
        onActivityRecorded={onActivityRecorded}
        onWorkspaceAccessRejected={onWorkspaceAccessRejected}
      />,
    );

    expect(onPendingChange).not.toHaveBeenCalled();
    changeValue(screen.getByLabelText('Member to suspend'), memberId);
    fireEvent.click(screen.getByRole('button', { name: 'Review suspension' }));
    expect(
      screen.getByRole('region', {
        name: 'Confirm Workspace access suspension',
      }),
    ).toBeInTheDocument();

    rerender(
      <WorkspaceMembershipSuspension
        actor={ownerActor}
        identity={secondIdentity}
        members={members}
        disabled={false}
        reloadAdministration={reloadAdministration}
        onPendingChange={onPendingChange}
        onActivityRecorded={onActivityRecorded}
        onWorkspaceAccessRejected={onWorkspaceAccessRejected}
      />,
    );

    await waitFor(() =>
      expect(
        screen.queryByRole('region', {
          name: 'Confirm Workspace access suspension',
        }),
      ).not.toBeInTheDocument(),
    );
    expect(screen.getByLabelText('Member to suspend')).toHaveValue('');
    expect(onPendingChange).toHaveBeenCalledOnce();
    expect(onPendingChange).toHaveBeenLastCalledWith(false);
  });

  it('does not publish a stale suspension response after identity replacement', async () => {
    const suspensionResponse = deferred<Response>();
    const fetchMock = vi
      .fn()
      .mockImplementationOnce(() => suspensionResponse.promise);
    vi.stubGlobal('fetch', fetchMock);
    const firstIdentity = deterministicBrowserIdentity({
      'x-test-identity': 'first',
    });
    const secondIdentity = deterministicBrowserIdentity({
      'x-test-identity': 'second',
    });
    const members = [
      {
        workspaceMembershipId: memberId,
        label: 'Ada Member — ada@example.test',
      },
    ];
    const reloadAdministration = vi.fn(async () => true);
    const onPendingChange = vi.fn();
    const onActivityRecorded = vi.fn(async () => undefined);
    const onWorkspaceAccessRejected = vi.fn(async () => undefined);
    const { rerender } = render(
      <WorkspaceMembershipSuspension
        actor={ownerActor}
        identity={firstIdentity}
        members={members}
        disabled={false}
        reloadAdministration={reloadAdministration}
        onPendingChange={onPendingChange}
        onActivityRecorded={onActivityRecorded}
        onWorkspaceAccessRejected={onWorkspaceAccessRejected}
      />,
    );

    changeValue(screen.getByLabelText('Member to suspend'), memberId);
    fireEvent.click(screen.getByRole('button', { name: 'Review suspension' }));
    fireEvent.click(screen.getByRole('button', { name: 'Suspend access' }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());

    const pendingSignal = vi.mocked(fetch).mock.calls[0]?.[1]?.signal;
    rerender(
      <WorkspaceMembershipSuspension
        actor={ownerActor}
        identity={secondIdentity}
        members={members}
        disabled={false}
        reloadAdministration={reloadAdministration}
        onPendingChange={onPendingChange}
        onActivityRecorded={onActivityRecorded}
        onWorkspaceAccessRejected={onWorkspaceAccessRejected}
      />,
    );

    await waitFor(() => expect(pendingSignal?.aborted).toBe(true));
    await act(async () => {
      suspensionResponse.resolve(
        new Response(
          JSON.stringify({
            workspaceMembershipId: memberId,
            status: 'inactive',
          }),
          { status: 201 },
        ),
      );
      await suspensionResponse.promise;
      await Promise.resolve();
    });

    expect(onActivityRecorded).not.toHaveBeenCalled();
    expect(onWorkspaceAccessRejected).not.toHaveBeenCalled();
    expect(reloadAdministration).not.toHaveBeenCalled();
    expect(
      screen.queryByText('Member suspended. Server state refreshed.'),
    ).not.toBeInTheDocument();
    expect(screen.getByLabelText('Member to suspend')).toHaveValue('');
  });

  it('leaves the active shell immediately when the actor suspends their own Membership', async () => {
    const rejectWorkspaceAccess = vi.fn(async () => undefined);
    const refreshActivity = vi.fn(async () => undefined);
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(
          new Response(JSON.stringify(administration()), { status: 200 }),
        )
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({
              workspaceMembershipId: ownerMembershipId,
              status: 'inactive',
            }),
            { status: 201 },
          ),
        ),
    );
    render(
      <CompanyContextAccess
        actor={ownerActor}
        identity={deterministicBrowserIdentity()}
        onActivityRecorded={refreshActivity}
        onWorkspaceAccessRejected={rejectWorkspaceAccess}
      />,
    );

    await screen.findByLabelText('Member to suspend');
    changeValue(screen.getByLabelText('Member to suspend'), ownerMembershipId);
    fireEvent.click(screen.getByRole('button', { name: 'Review suspension' }));
    fireEvent.click(screen.getByRole('button', { name: 'Suspend access' }));

    await waitFor(() => expect(rejectWorkspaceAccess).toHaveBeenCalledOnce());
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(refreshActivity).not.toHaveBeenCalled();
  });

  it('recovers from a stale suspension denial with refreshed server state and no false success', async () => {
    const afterStaleDenial = {
      ...administration(),
      members: administration().members.filter(
        (member) => member.workspaceMembershipId !== memberId,
      ),
    };
    const refreshActivity = vi.fn(async () => undefined);
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(
          new Response(JSON.stringify(administration()), { status: 200 }),
        )
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({ message: 'Forbidden', statusCode: 403 }),
            { status: 403 },
          ),
        )
        .mockResolvedValueOnce(
          new Response(JSON.stringify(afterStaleDenial), { status: 200 }),
        ),
    );
    render(
      <CompanyContextAccess
        actor={ownerActor}
        identity={deterministicBrowserIdentity()}
        onActivityRecorded={refreshActivity}
      />,
    );

    await screen.findByLabelText('Member to suspend');
    changeValue(screen.getByLabelText('Member to suspend'), memberId);
    fireEvent.click(screen.getByRole('button', { name: 'Review suspension' }));
    fireEvent.click(screen.getByRole('button', { name: 'Suspend access' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'The suspension could not be completed. Server state was refreshed.',
    );
    expect(
      screen.queryByText('Member suspended. Server state refreshed.'),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByLabelText('Member to suspend'));
    expect(
      screen.queryByRole('option', { name: 'Ada Member — ada@example.test' }),
    ).not.toBeInTheDocument();
    expect(refreshActivity).not.toHaveBeenCalled();
  });

  it('leaves active business state when a peer-suspended actor gets a forbidden administration response', async () => {
    const rejectWorkspaceAccess = vi.fn(async () => undefined);
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({ message: 'Forbidden', statusCode: 403 }),
            { status: 403 },
          ),
        )
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({ message: 'Forbidden', statusCode: 403 }),
            { status: 403 },
          ),
        ),
    );

    render(
      <CompanyContextAccess
        actor={ownerActor}
        identity={deterministicBrowserIdentity()}
        onWorkspaceAccessRejected={rejectWorkspaceAccess}
      />,
    );

    await waitFor(() => expect(rejectWorkspaceAccess).toHaveBeenCalledOnce());
    expect(fetch).toHaveBeenNthCalledWith(
      2,
      '/api/access/current-actor',
      expect.any(Object),
    );
  });

  it('disambiguates duplicate member and Company labels with stable references', async () => {
    const duplicateMemberId = '11111111-1111-4111-8111-111111111111';
    const duplicateCompanyId = '22222222-2222-4222-8222-222222222222';
    const state = {
      members: [
        {
          workspaceMembershipId: memberId,
          displayName: 'Ada Member',
          email: 'ada@example.test',
        },
        {
          workspaceMembershipId: duplicateMemberId,
          displayName: 'Ada Member',
          email: 'ada@example.test',
        },
        {
          workspaceMembershipId: ownerMembershipId,
          displayName: 'Workspace Owner',
          email: 'owner@example.test',
        },
      ],
      companies: [
        { id: companyId, displayName: 'PRISMA-PRIM' },
        { id: duplicateCompanyId, displayName: 'PRISMA-PRIM' },
        {
          id: '33333333-3333-4333-8333-333333333333',
          displayName: 'BIC',
        },
      ],
      assignments: [],
    };
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          new Response(JSON.stringify(state), { status: 200 }),
        ),
    );

    render(
      <CompanyContextAccess
        actor={ownerActor}
        identity={deterministicBrowserIdentity()}
      />,
    );

    await screen.findByLabelText('Workspace member');
    const memberSelect = screen.getByRole('combobox', {
      name: 'Workspace member',
    });
    fireEvent.click(memberSelect);
    expect(
      screen.getByRole('option', {
        name: 'Ada Member — ada@example.test — Reference A3QMM1BZFR1YUM8AM42DIJIJU',
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('option', {
        name: 'Ada Member — ada@example.test — Reference 10DGNSXLJLXOXC3RMYV4E8SNL',
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('option', {
        name: 'Workspace Owner — owner@example.test',
      }),
    ).toBeInTheDocument();
    fireEvent.click(memberSelect);
    const companySelect = screen.getByRole('combobox', { name: 'Company' });
    fireEvent.click(companySelect);
    expect(
      screen.getByRole('option', {
        name: 'PRISMA-PRIM — Reference C4HJXN76IW6X20HATX7ZJHWB0',
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('option', {
        name: 'PRISMA-PRIM — Reference 20QXBLV736I61189QVFXEPZJ6',
      }),
    ).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'BIC' })).toBeInTheDocument();
    fireEvent.click(companySelect);
  });

  it('grants and revokes Task Manager v1 with explicit Project and Client prerequisites', async () => {
    let active = false;
    const commands: { method: string; path: string; key: string | null }[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (path: string, options?: RequestInit) => {
        if (path === '/api/company-context-assignments/administration')
          return Response.json({
            ...administration(),
            assignments: active
              ? [
                  {
                    id: 'task-assignment',
                    workspaceMembershipId: memberId,
                    companyId,
                    bundle: 'Company Task Manager',
                    permissionSetVersion: 'v1',
                    active: true,
                  },
                ]
              : [],
          });
        if (path.startsWith('/api/company-task-manager-assignments')) {
          commands.push({
            method: options?.method ?? 'GET',
            path,
            key: new Headers(options?.headers).get('idempotency-key'),
          });
          active = options?.method === 'POST';
          return Response.json(
            {
              id: 'task-assignment',
              workspaceMembershipId: memberId,
              companyId,
              bundle: 'Company Task Manager',
              permissionSetVersion: 'v1',
              active,
            },
            { status: active ? 201 : 200 },
          );
        }
        return new Response(null, { status: 404 });
      }),
    );
    render(
      <CompanyContextAccess
        actor={ownerActor}
        identity={deterministicBrowserIdentity()}
      />,
    );
    await screen.findByLabelText('Workspace member');
    chooseTargets();
    changeValue(screen.getByLabelText('Access bundle'), 'task-manager');
    expect(
      screen.getByText(
        /Company Task Manager v1 grants Task read and management only/,
      ),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Grant access' }));
    await screen.findByText('Access granted. Server state refreshed.');
    expect(screen.getByText(/Current server state:/)).toHaveTextContent(
      /^Current server state: Granted — captured version v1$/,
    );
    expect(screen.getByText(capturedVersionExplanation)).toBeInTheDocument();
    expect(
      screen.getByText(
        /Company Task Manager v1 grants Task read and management only/,
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Revoke access' })).toBeEnabled();
    fireEvent.click(screen.getByRole('button', { name: 'Revoke access' }));
    await screen.findByText('Access revoked. Server state refreshed.');
    expect(commands).toEqual([
      {
        method: 'POST',
        path: '/api/company-task-manager-assignments',
        key: expect.any(String),
      },
      {
        method: 'DELETE',
        path: `/api/company-task-manager-assignments/${memberId}/${companyId}`,
        key: expect.any(String),
      },
    ]);
    expect(screen.getByRole('button', { name: 'Grant access' })).toBeEnabled();
  });

  it('grants Company Context Access and reloads the canonical server state before reporting success', async () => {
    const refreshActivity = vi.fn(async () => undefined);
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(
          new Response(JSON.stringify(administration()), { status: 200 }),
        )
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({
              id: 'assignment-1',
              workspaceMembershipId: memberId,
              companyId,
              bundle: 'Company Context Access',
              active: true,
            }),
            { status: 201 },
          ),
        )
        .mockResolvedValueOnce(
          new Response(JSON.stringify(administration('context')), {
            status: 200,
          }),
        ),
    );

    render(
      <CompanyContextAccess
        actor={ownerActor}
        identity={deterministicBrowserIdentity()}
        onActivityRecorded={refreshActivity}
      />,
    );
    await screen.findByLabelText('Workspace member');
    chooseTargets();
    fireEvent.click(screen.getByRole('button', { name: 'Grant access' }));

    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(3));
    expect(fetch).toHaveBeenNthCalledWith(
      2,
      '/api/company-context-assignments',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ workspaceMembershipId: memberId, companyId }),
        headers: expect.objectContaining({
          'idempotency-key': expect.any(String),
        }),
      }),
    );
    expect(fetch).toHaveBeenNthCalledWith(
      3,
      '/api/company-context-assignments/administration',
      expect.any(Object),
    );
    expect(await screen.findByText(/Current server state:/)).toHaveTextContent(
      /^Current server state: Granted$/,
    );
    expect(
      screen.queryByText(capturedVersionExplanation),
    ).not.toBeInTheDocument();
    expect(
      screen.getByText('Access granted. Server state refreshed.'),
    ).toBeInTheDocument();
    expect(refreshActivity).toHaveBeenCalledOnce();
  });

  it('grants Company Commercial Intake through the existing administration', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(Response.json(administration()))
        .mockResolvedValueOnce(
          Response.json(
            {
              id: 'commercial-assignment',
              workspaceMembershipId: memberId,
              companyId,
              bundle: 'Company Commercial Intake',
              permissionSetVersion: 'v1',
              active: true,
            },
            { status: 201 },
          ),
        )
        .mockResolvedValueOnce(Response.json(administration('commercial'))),
    );

    render(
      <CompanyContextAccess
        actor={ownerActor}
        identity={deterministicBrowserIdentity()}
      />,
    );
    await screen.findByLabelText('Workspace member');
    chooseTargets();
    changeValue(screen.getByLabelText('Access bundle'), 'commercial-intake');
    fireEvent.click(screen.getByRole('button', { name: 'Grant access' }));

    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(3));
    expect(fetch).toHaveBeenNthCalledWith(
      2,
      '/api/company-commercial-intake-assignments',
      expect.objectContaining({ method: 'POST' }),
    );
    expect(await screen.findByText(/Current server state:/)).toHaveTextContent(
      'Current server state: Granted',
    );
  });

  it('grants Company Service Catalogue through the existing administration', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(Response.json(administration()))
        .mockResolvedValueOnce(
          Response.json(
            {
              id: 'catalogue-assignment',
              workspaceMembershipId: memberId,
              companyId,
              bundle: 'Company Service Catalogue',
              permissionSetVersion: 'v1',
              active: true,
            },
            { status: 201 },
          ),
        )
        .mockResolvedValueOnce(Response.json(administration('catalogue'))),
    );

    render(
      <CompanyContextAccess
        actor={ownerActor}
        identity={deterministicBrowserIdentity()}
      />,
    );
    await screen.findByLabelText('Workspace member');
    chooseTargets();
    changeValue(screen.getByLabelText('Access bundle'), 'service-catalogue');
    fireEvent.click(screen.getByRole('button', { name: 'Grant access' }));

    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(3));
    expect(fetch).toHaveBeenNthCalledWith(
      2,
      '/api/company-service-catalogue-assignments',
      expect.objectContaining({ method: 'POST' }),
    );
    expect(await screen.findByText(/Current server state:/)).toHaveTextContent(
      /^Current server state: Granted — captured version v1$/,
    );
  });

  it('grants and revokes Company Pricing Configuration v1 through the existing administration', async () => {
    let active = false;
    const commands: { method: string; path: string; key: string | null }[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (path: string, options?: RequestInit) => {
        if (path === '/api/company-context-assignments/administration')
          return Response.json(administration(active ? 'pricing' : undefined));
        if (path.startsWith('/api/company-pricing-configuration-assignments')) {
          commands.push({
            method: options?.method ?? 'GET',
            path,
            key: new Headers(options?.headers).get('idempotency-key'),
          });
          active = options?.method === 'POST';
          return Response.json(
            {
              id: 'configuration-assignment',
              workspaceMembershipId: memberId,
              companyId,
              bundle: 'Company Pricing Configuration',
              permissionSetVersion: 'v1',
              active,
            },
            { status: active ? 201 : 200 },
          );
        }
        return new Response(null, { status: 404 });
      }),
    );
    render(
      <CompanyContextAccess
        actor={ownerActor}
        identity={deterministicBrowserIdentity()}
      />,
    );
    await screen.findByLabelText('Workspace member');
    chooseTargets();
    changeValue(
      screen.getByLabelText('Access bundle'),
      'pricing-configuration',
    );
    expect(screen.getByLabelText('Access bundle')).toHaveTextContent(
      'Company Pricing Configuration',
    );
    expect(
      screen.getByText(
        /Company Pricing Configuration v1 grants offering read and pricing configuration only: reading and publishing illustrative Pricing Rule Versions and Tariff Versions/,
      ),
    ).toBeInTheDocument();
    expect(screen.getByText(/Current server state:/)).toHaveTextContent(
      /^Current server state: Not granted$/,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Grant access' }));
    await screen.findByText('Access granted. Server state refreshed.');
    expect(screen.getByText(/Current server state:/)).toHaveTextContent(
      /^Current server state: Granted — captured version v1$/,
    );
    expect(screen.getByText(capturedVersionExplanation)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Revoke access' }));
    await screen.findByText('Access revoked. Server state refreshed.');
    expect(screen.getByText(/Current server state:/)).toHaveTextContent(
      /^Current server state: Not granted$/,
    );
    expect(commands).toEqual([
      {
        method: 'POST',
        path: '/api/company-pricing-configuration-assignments',
        key: expect.any(String),
      },
      {
        method: 'DELETE',
        path: `/api/company-pricing-configuration-assignments/${memberId}/${companyId}`,
        key: expect.any(String),
      },
    ]);
    expect(commands[0]?.key).not.toBe(commands[1]?.key);
  });

  it('grants and revokes Company Opportunity Manager v2 with its prerequisites stated', async () => {
    let active = false;
    const commands: { method: string; path: string; key: string | null }[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (path: string, options?: RequestInit) => {
        if (path === '/api/company-context-assignments/administration')
          return Response.json(administration(active ? 'manager' : undefined));
        if (path.startsWith('/api/company-opportunity-manager-assignments')) {
          commands.push({
            method: options?.method ?? 'GET',
            path,
            key: new Headers(options?.headers).get('idempotency-key'),
          });
          active = options?.method === 'POST';
          return Response.json(
            {
              id: 'manager-assignment',
              workspaceMembershipId: memberId,
              companyId,
              bundle: 'Company Opportunity Manager',
              permissionSetVersion: 'v2',
              active,
            },
            { status: active ? 201 : 200 },
          );
        }
        return new Response(null, { status: 404 });
      }),
    );
    render(
      <CompanyContextAccess
        actor={ownerActor}
        identity={deterministicBrowserIdentity()}
      />,
    );
    await screen.findByLabelText('Workspace member');
    chooseTargets();
    const bundleSelect = screen.getByLabelText('Access bundle');
    selectOption(bundleSelect, 'opportunity-manager');
    expect(bundleSelect).toHaveTextContent('Company Opportunity Manager');
    expect(
      screen.getByText(
        'Company Opportunity Manager v2 changes the responsible actor and the outcome status; Company context and Commercial Intake read are authorized separately.',
      ),
    ).toBeInTheDocument();
    expect(screen.getByText(/Current server state:/)).toHaveTextContent(
      /^Current server state: Not granted$/,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Grant access' }));
    await screen.findByText('Access granted. Server state refreshed.');
    expect(screen.getByText(/Current server state:/)).toHaveTextContent(
      /^Current server state: Granted — captured version v2$/,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Revoke access' }));
    await screen.findByText('Access revoked. Server state refreshed.');
    expect(screen.getByText(/Current server state:/)).toHaveTextContent(
      /^Current server state: Not granted$/,
    );
    expect(commands).toEqual([
      {
        method: 'POST',
        path: '/api/company-opportunity-manager-assignments',
        key: expect.any(String),
      },
      {
        method: 'DELETE',
        path: `/api/company-opportunity-manager-assignments/${memberId}/${companyId}`,
        key: expect.any(String),
      },
    ]);
  });

  it('grants and revokes Company Sales Stage Configuration v1 with its prerequisites stated', async () => {
    let active = false;
    const commands: { method: string; path: string; key: string | null }[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (path: string, options?: RequestInit) => {
        if (path === '/api/company-context-assignments/administration')
          return Response.json(
            administration(active ? 'stageConfiguration' : undefined),
          );
        if (
          path.startsWith('/api/company-sales-stage-configuration-assignments')
        ) {
          commands.push({
            method: options?.method ?? 'GET',
            path,
            key: new Headers(options?.headers).get('idempotency-key'),
          });
          active = options?.method === 'POST';
          return Response.json(
            {
              id: 'stage-configuration-assignment',
              workspaceMembershipId: memberId,
              companyId,
              bundle: 'Company Sales Stage Configuration',
              permissionSetVersion: 'v1',
              active,
            },
            { status: active ? 201 : 200 },
          );
        }
        return new Response(null, { status: 404 });
      }),
    );
    render(
      <CompanyContextAccess
        actor={ownerActor}
        identity={deterministicBrowserIdentity()}
      />,
    );
    await screen.findByLabelText('Workspace member');
    chooseTargets();
    const bundleSelect = screen.getByLabelText('Access bundle');
    selectOption(bundleSelect, 'sales-stage-configuration');
    expect(bundleSelect).toHaveTextContent('Company Sales Stage Configuration');
    expect(
      screen.getByText(
        'Company Sales Stage Configuration v1 grants only the configuration of the Company Sales Stages. Company context and Commercial Intake read are authorized separately.',
      ),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Grant access' }));
    await screen.findByText('Access granted. Server state refreshed.');
    expect(screen.getByText(/Current server state:/)).toHaveTextContent(
      /^Current server state: Granted — captured version v1$/,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Revoke access' }));
    await screen.findByText('Access revoked. Server state refreshed.');
    expect(commands).toEqual([
      {
        method: 'POST',
        path: '/api/company-sales-stage-configuration-assignments',
        key: expect.any(String),
      },
      {
        method: 'DELETE',
        path: `/api/company-sales-stage-configuration-assignments/${memberId}/${companyId}`,
        key: expect.any(String),
      },
    ]);
  });

  it('grants and revokes Company Project Approver v1 with its lifecycle-only note', async () => {
    let active = false;
    const commands: { method: string; path: string; key: string | null }[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (path: string, options?: RequestInit) => {
        if (path === '/api/company-context-assignments/administration')
          return Response.json(administration(active ? 'approver' : undefined));
        if (path.startsWith('/api/company-project-approver-assignments')) {
          commands.push({
            method: options?.method ?? 'GET',
            path,
            key: new Headers(options?.headers).get('idempotency-key'),
          });
          active = options?.method === 'POST';
          return Response.json(
            {
              id: 'approver-assignment',
              workspaceMembershipId: memberId,
              companyId,
              bundle: 'Company Project Approver',
              permissionSetVersion: 'v1',
              active,
            },
            { status: active ? 201 : 200 },
          );
        }
        return new Response(null, { status: 404 });
      }),
    );
    render(
      <CompanyContextAccess
        actor={ownerActor}
        identity={deterministicBrowserIdentity()}
      />,
    );
    await screen.findByLabelText('Workspace member');
    chooseTargets();
    const bundle = screen.getByLabelText('Access bundle');
    changeValue(bundle, 'project-approver');
    expect(bundle).toHaveAttribute('data-value', 'project-approver');
    expect(bundle).toHaveTextContent('Company Project Approver');
    expect(
      screen.getByText(
        'Changes the Project lifecycle only; Project and Client read are authorized separately.',
      ),
    ).toBeInTheDocument();
    expect(screen.getByText(/Current server state:/)).toHaveTextContent(
      /^Current server state: Not granted$/,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Grant access' }));
    await screen.findByText('Access granted. Server state refreshed.');
    expect(screen.getByText(/Current server state:/)).toHaveTextContent(
      /^Current server state: Granted — captured version v1$/,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Revoke access' }));
    await screen.findByText('Access revoked. Server state refreshed.');
    expect(screen.getByText(/Current server state:/)).toHaveTextContent(
      /^Current server state: Not granted$/,
    );
    expect(commands).toEqual([
      {
        method: 'POST',
        path: '/api/company-project-approver-assignments',
        key: expect.any(String),
      },
      {
        method: 'DELETE',
        path: `/api/company-project-approver-assignments/${memberId}/${companyId}`,
        key: expect.any(String),
      },
    ]);
  });

  it('grants Company Commercial Activity Reader through the existing administration', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(Response.json(administration()))
        .mockResolvedValueOnce(
          Response.json(
            {
              id: 'reader-assignment',
              workspaceMembershipId: memberId,
              companyId,
              bundle: 'Company Commercial Activity Reader',
              permissionSetVersion: 'v1',
              active: true,
            },
            { status: 201 },
          ),
        )
        .mockResolvedValueOnce(Response.json(administration('reader'))),
    );

    render(
      <CompanyContextAccess
        actor={ownerActor}
        identity={deterministicBrowserIdentity()}
      />,
    );
    await screen.findByLabelText('Workspace member');
    chooseTargets();
    changeValue(
      screen.getByLabelText('Access bundle'),
      'commercial-activity-reader',
    );
    expect(
      screen.getByText(/grants commercial Activity Log read only/),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Grant access' }));

    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(3));
    expect(fetch).toHaveBeenNthCalledWith(
      2,
      '/api/company-commercial-activity-reader-assignments',
      expect.objectContaining({ method: 'POST' }),
    );
    expect(await screen.findByText(/Current server state:/)).toHaveTextContent(
      'Current server state: Granted',
    );
  });

  it('grants and revokes Company Pricing User v1 with its prerequisites and captured version', async () => {
    let active = false;
    const commands: {
      method: string;
      path: string;
      key: string | null;
      body: unknown;
    }[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (path: string, options?: RequestInit) => {
        if (path === '/api/company-context-assignments/administration')
          return Response.json(
            administration(active ? 'pricingUser' : undefined),
          );
        if (path.startsWith('/api/company-pricing-user-assignments')) {
          const body: unknown =
            typeof options?.body === 'string'
              ? JSON.parse(options.body)
              : undefined;
          commands.push({
            method: options?.method ?? 'GET',
            path,
            key: new Headers(options?.headers).get('idempotency-key'),
            body,
          });
          active = options?.method === 'POST';
          return Response.json(
            {
              id: 'pricing-user-assignment',
              workspaceMembershipId: memberId,
              companyId,
              bundle: 'Company Pricing User',
              permissionSetVersion: 'v1',
              active,
            },
            { status: active ? 201 : 200 },
          );
        }
        return new Response(null, { status: 404 });
      }),
    );
    render(
      <CompanyContextAccess
        actor={ownerActor}
        identity={deterministicBrowserIdentity()}
      />,
    );
    await screen.findByLabelText('Workspace member');
    chooseTargets();
    const bundleSelect = screen.getByRole('combobox', {
      name: 'Access bundle',
    });
    fireEvent.click(bundleSelect);
    expect(
      screen.getByRole('option', { name: 'Company Pricing User' }),
    ).toBeVisible();
    fireEvent.click(bundleSelect);
    chooseBundle('pricing-user');
    expect(screen.getByLabelText('Access bundle')).toHaveValue('pricing-user');
    const prerequisites = screen.getByText(/^Company Pricing User v1 grants/);
    expect(prerequisites).toHaveTextContent(/grants no publication/);
    expect(prerequisites).toHaveTextContent(
      /Company context must already be authorized separately\.$/,
    );
    expect(prerequisites).not.toHaveTextContent(/calculat/i);
    expect(screen.getByText(/Current server state:/)).toHaveTextContent(
      /^Current server state: Not granted$/,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Grant access' }));
    await screen.findByText('Access granted. Server state refreshed.');
    expect(screen.getByText(/Current server state:/)).toHaveTextContent(
      /^Current server state: Granted — captured version v1$/,
    );
    expect(screen.getByText(capturedVersionExplanation)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Revoke access' }));
    await screen.findByText('Access revoked. Server state refreshed.');
    expect(screen.getByText(/Current server state:/)).toHaveTextContent(
      /^Current server state: Not granted$/,
    );
    expect(commands).toEqual([
      {
        method: 'POST',
        path: '/api/company-pricing-user-assignments',
        key: expect.any(String),
        body: { workspaceMembershipId: memberId, companyId },
      },
      {
        method: 'DELETE',
        path: `/api/company-pricing-user-assignments/${memberId}/${companyId}`,
        key: expect.any(String),
        body: undefined,
      },
    ]);
    expect(commands[0]?.key).not.toBe(commands[1]?.key);
  });

  it('grants and revokes Company Pricing Adjustment v1 with its independent prerequisites', async () => {
    let active = false;
    const commands: Array<{
      method: string;
      path: string;
      body: unknown;
    }> = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (path: string, options?: RequestInit) => {
        if (path === '/api/company-context-assignments/administration')
          return Response.json(
            administration(active ? 'pricingAdjustment' : undefined),
          );
        if (path.startsWith('/api/company-pricing-adjustment-assignments')) {
          commands.push({
            method: options?.method ?? 'GET',
            path,
            body:
              typeof options?.body === 'string'
                ? JSON.parse(options.body)
                : undefined,
          });
          active = options?.method === 'POST';
          return Response.json(
            {
              id: 'pricing-adjustment-assignment',
              workspaceMembershipId: memberId,
              companyId,
              bundle: 'Company Pricing Adjustment',
              permissionSetVersion: 'v1',
              active,
            },
            { status: active ? 201 : 200 },
          );
        }
        return new Response(null, { status: 404 });
      }),
    );
    render(
      <CompanyContextAccess
        actor={ownerActor}
        identity={deterministicBrowserIdentity()}
      />,
    );
    await screen.findByLabelText('Workspace member');
    chooseTargets();
    chooseBundle('pricing-adjustment');
    const prerequisites = screen.getByText(
      /^Company Pricing Adjustment v1 grants/,
    );
    expect(prerequisites).toHaveTextContent(/only the application/);
    expect(prerequisites).toHaveTextContent(
      /Opportunity visibility and Company Pricing User access/,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Grant access' }));
    await screen.findByText('Access granted. Server state refreshed.');
    expect(screen.getByText(/Current server state:/)).toHaveTextContent(
      /^Current server state: Granted — captured version v1$/,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Revoke access' }));
    await screen.findByText('Access revoked. Server state refreshed.');
    expect(commands).toEqual([
      {
        method: 'POST',
        path: '/api/company-pricing-adjustment-assignments',
        body: { workspaceMembershipId: memberId, companyId },
      },
      {
        method: 'DELETE',
        path: `/api/company-pricing-adjustment-assignments/${memberId}/${companyId}`,
        body: undefined,
      },
    ]);
  });

  it('revokes Company Director Client Access and reloads the canonical server state', async () => {
    const refreshActivity = vi.fn(async () => undefined);
    const clientAuthorityChanged = vi.fn(async () => undefined);
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(
          new Response(JSON.stringify(administration('director')), {
            status: 200,
          }),
        )
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({
              id: 'assignment-1',
              workspaceMembershipId: memberId,
              companyId,
              bundle: 'Company Director Client Access',
              active: false,
            }),
            { status: 200 },
          ),
        )
        .mockResolvedValueOnce(
          new Response(JSON.stringify(administration()), { status: 200 }),
        ),
    );

    render(
      <CompanyContextAccess
        actor={ownerActor}
        identity={deterministicBrowserIdentity()}
        onActivityRecorded={refreshActivity}
        onClientAuthorityChanged={clientAuthorityChanged}
      />,
    );
    await screen.findByLabelText('Workspace member');
    chooseTargets();
    changeValue(screen.getByLabelText('Access bundle'), 'director-client');
    expect(screen.getByText(/Current server state:/)).toHaveTextContent(
      'Current server state: Granted',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Revoke access' }));

    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(3));
    expect(fetch).toHaveBeenNthCalledWith(
      2,
      `/api/company-director-client-assignments/${memberId}/${companyId}`,
      expect.objectContaining({ method: 'DELETE' }),
    );
    expect(await screen.findByText(/Current server state:/)).toHaveTextContent(
      'Current server state: Not granted',
    );
    expect(
      screen.getByText('Access revoked. Server state refreshed.'),
    ).toBeInTheDocument();
    expect(refreshActivity).toHaveBeenCalledOnce();
    expect(clientAuthorityChanged).not.toHaveBeenCalled();
  });

  it('refreshes Activity Log after a confirmed mutation when administration reload fails', async () => {
    const refreshActivity = vi.fn(async () => undefined);
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(
          new Response(JSON.stringify(administration()), { status: 200 }),
        )
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({
              id: 'assignment-1',
              workspaceMembershipId: memberId,
              companyId,
              bundle: 'Company Context Access',
              active: true,
            }),
            { status: 201 },
          ),
        )
        .mockResolvedValueOnce(new Response(null, { status: 500 })),
    );

    render(
      <CompanyContextAccess
        actor={ownerActor}
        identity={deterministicBrowserIdentity()}
        onActivityRecorded={refreshActivity}
      />,
    );
    await screen.findByLabelText('Workspace member');
    chooseTargets();
    fireEvent.click(screen.getByRole('button', { name: 'Grant access' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'The access state could not be loaded or changed.',
    );
    expect(fetch).toHaveBeenCalledTimes(3);
    expect(refreshActivity).toHaveBeenCalledOnce();
  });

  it('reloads state after a stale command denial instead of keeping the previous assignment state', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(
          new Response(JSON.stringify(administration('context')), {
            status: 200,
          }),
        )
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({ message: 'Forbidden', statusCode: 403 }),
            { status: 403 },
          ),
        )
        .mockResolvedValueOnce(
          new Response(JSON.stringify(administration()), { status: 200 }),
        ),
    );

    render(
      <CompanyContextAccess
        actor={ownerActor}
        identity={deterministicBrowserIdentity()}
      />,
    );
    await screen.findByLabelText('Workspace member');
    chooseTargets();
    fireEvent.click(screen.getByRole('button', { name: 'Revoke access' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'The access state could not be loaded or changed.',
    );
    expect(screen.getByText(/Current server state:/)).toHaveTextContent(
      'Current server state: Not granted',
    );
    expect(screen.getByRole('button', { name: 'Grant access' })).toBeEnabled();
  });

  it('reuses the same idempotency key when a failed grant is retried and the server still reports it absent', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(
          new Response(JSON.stringify(administration()), { status: 200 }),
        )
        .mockResolvedValueOnce(new Response(null, { status: 500 }))
        .mockResolvedValueOnce(
          new Response(JSON.stringify(administration()), { status: 200 }),
        )
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({
              id: 'assignment-1',
              workspaceMembershipId: memberId,
              companyId,
              bundle: 'Company Context Access',
              active: true,
            }),
            { status: 201 },
          ),
        )
        .mockResolvedValueOnce(
          new Response(JSON.stringify(administration('context')), {
            status: 200,
          }),
        ),
    );

    render(
      <CompanyContextAccess
        actor={ownerActor}
        identity={deterministicBrowserIdentity()}
      />,
    );
    await screen.findByLabelText('Workspace member');
    chooseTargets();
    fireEvent.click(screen.getByRole('button', { name: 'Grant access' }));
    await screen.findByRole('alert');
    fireEvent.click(screen.getByRole('button', { name: 'Grant access' }));
    await screen.findByText('Access granted. Server state refreshed.');

    const firstKey = new Headers(
      vi.mocked(fetch).mock.calls[1]?.[1]?.headers,
    ).get('idempotency-key');
    const retryKey = new Headers(
      vi.mocked(fetch).mock.calls[3]?.[1]?.headers,
    ).get('idempotency-key');
    expect(firstKey).toBeTruthy();
    expect(retryKey).toBe(firstKey);
  });

  it('revalidates the active actor after a self Company Director Client assignment', async () => {
    const selfActor: ActorContext = {
      ...ownerActor,
      activeCompany: {
        id: companyId,
        displayName: 'PRISMA-PRIM',
        clientPermissions: [],
      },
    };
    const revalidatedActor: ActorContext = {
      ...selfActor,
      activeCompany: {
        ...selfActor.activeCompany!,
        clientPermissions: ['client.read', 'client.create', 'client.update'],
      },
    };
    const state = {
      ...administration(),
      members: [
        {
          workspaceMembershipId: ownerMembershipId,
          displayName: 'Workspace Owner',
          email: 'owner@example.test',
        },
      ],
    };
    const grantedState = {
      ...state,
      assignments: [
        {
          id: 'assignment-1',
          workspaceMembershipId: ownerMembershipId,
          companyId,
          bundle: 'Company Director Client Access',
          permissionSetVersion: 'v2',
          active: true,
        },
      ],
    };
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(
          new Response(JSON.stringify(state), { status: 200 }),
        )
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({
              id: 'assignment-1',
              workspaceMembershipId: ownerMembershipId,
              companyId,
              bundle: 'Company Director Client Access',
              active: true,
            }),
            { status: 201 },
          ),
        )
        .mockResolvedValueOnce(
          new Response(JSON.stringify(revalidatedActor), { status: 200 }),
        )
        .mockResolvedValueOnce(
          new Response(JSON.stringify(grantedState), { status: 200 }),
        ),
    );
    const acceptActor = vi.fn(async () => undefined);
    const clientAuthorityChanged = vi.fn(async () => undefined);

    render(
      <CompanyContextAccess
        actor={selfActor}
        identity={deterministicBrowserIdentity()}
        onActorRevalidated={acceptActor}
        onClientAuthorityChanged={clientAuthorityChanged}
      />,
    );
    await screen.findByLabelText('Workspace member');
    changeValue(screen.getByLabelText('Workspace member'), ownerMembershipId);
    changeValue(screen.getByLabelText('Company'), companyId);
    changeValue(screen.getByLabelText('Access bundle'), 'director-client');
    fireEvent.click(screen.getByRole('button', { name: 'Grant access' }));

    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(4));
    expect(fetch).toHaveBeenNthCalledWith(
      3,
      '/api/access/current-actor',
      expect.objectContaining({
        headers: expect.objectContaining({
          'x-company-context-id': companyId,
        }),
      }),
    );
    expect(acceptActor).toHaveBeenCalledWith(revalidatedActor);
    expect(clientAuthorityChanged).toHaveBeenCalledOnce();
  });

  it('notifies Client authority changes for a self assignment outside the active Company', async () => {
    const otherCompanyId = '11111111-1111-4111-8111-111111111111';
    const selfActor: ActorContext = {
      ...ownerActor,
      activeCompany: {
        id: companyId,
        displayName: 'Active Company B',
        clientPermissions: [
          'client.read',
          'client.create',
          'client.update',
          'client.duplicate.resolve',
        ],
      },
    };
    const state = {
      members: [
        {
          workspaceMembershipId: ownerMembershipId,
          displayName: 'Workspace Owner',
          email: 'owner@example.test',
        },
      ],
      companies: [
        { id: otherCompanyId, displayName: 'Candidate Company A' },
        { id: companyId, displayName: 'Active Company B' },
      ],
      assignments: [],
    };
    const grantedState = {
      ...state,
      assignments: [
        {
          id: 'assignment-other-company',
          workspaceMembershipId: ownerMembershipId,
          companyId: otherCompanyId,
          bundle: 'Company Director Client Access',
          permissionSetVersion: 'v2',
          active: true,
        },
      ],
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify(state), { status: 200 }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify(grantedState.assignments[0]), {
          status: 201,
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify(grantedState), { status: 200 }),
      );
    vi.stubGlobal('fetch', fetchMock);
    const clientAuthorityChanged = vi.fn(async () => undefined);

    render(
      <CompanyContextAccess
        actor={selfActor}
        identity={deterministicBrowserIdentity()}
        onClientAuthorityChanged={clientAuthorityChanged}
      />,
    );
    await screen.findByLabelText('Workspace member');
    changeValue(screen.getByLabelText('Workspace member'), ownerMembershipId);
    changeValue(screen.getByLabelText('Company'), otherCompanyId);
    changeValue(screen.getByLabelText('Access bundle'), 'director-client');
    fireEvent.click(screen.getByRole('button', { name: 'Grant access' }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
    expect(
      fetchMock.mock.calls.some(([path]) =>
        String(path).endsWith('/access/current-actor'),
      ),
    ).toBe(false);
    expect(clientAuthorityChanged).toHaveBeenCalledOnce();
  });

  it('rejects the active Company after self-revocation removes its context access', async () => {
    const selfActor: ActorContext = {
      ...ownerActor,
      workspacePermissions: ['company.assignment.manage'],
      activeCompany: {
        id: companyId,
        displayName: 'PRISMA-PRIM',
        clientPermissions: ['client.read', 'client.create', 'client.update'],
      },
    };
    const state = {
      members: [
        {
          workspaceMembershipId: ownerMembershipId,
          displayName: 'Workspace Owner',
          email: 'owner@example.test',
        },
      ],
      companies: [{ id: companyId, displayName: 'PRISMA-PRIM' }],
      assignments: [
        {
          id: 'assignment-1',
          workspaceMembershipId: ownerMembershipId,
          companyId,
          bundle: 'Company Director Client Access',
          permissionSetVersion: 'v2',
          active: true,
        },
      ],
    };
    const revokedState = { ...state, assignments: [] };
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(
          new Response(JSON.stringify(state), { status: 200 }),
        )
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({ ...state.assignments[0], active: false }),
            { status: 200 },
          ),
        )
        .mockResolvedValueOnce(new Response(null, { status: 403 }))
        .mockResolvedValueOnce(
          new Response(JSON.stringify(revokedState), { status: 200 }),
        ),
    );
    const rejectCompanyContext = vi.fn(async () => undefined);
    const acceptActor = vi.fn(async () => undefined);
    const refreshActivity = vi.fn(async () => undefined);

    render(
      <CompanyContextAccess
        actor={selfActor}
        identity={deterministicBrowserIdentity()}
        onCompanyContextRejected={rejectCompanyContext}
        onActorRevalidated={acceptActor}
        onActivityRecorded={refreshActivity}
      />,
    );
    await screen.findByLabelText('Workspace member');
    changeValue(screen.getByLabelText('Workspace member'), ownerMembershipId);
    changeValue(screen.getByLabelText('Company'), companyId);
    changeValue(screen.getByLabelText('Access bundle'), 'director-client');
    fireEvent.click(screen.getByRole('button', { name: 'Revoke access' }));

    await screen.findByText('Access revoked. Server state refreshed.');
    expect(rejectCompanyContext).toHaveBeenCalledWith(companyId);
    expect(acceptActor).not.toHaveBeenCalled();
    expect(refreshActivity).not.toHaveBeenCalled();
  });

  it('retries self-assignment actor revalidation with the same command key', async () => {
    const selfActor: ActorContext = {
      ...ownerActor,
      activeCompany: {
        id: companyId,
        displayName: 'PRISMA-PRIM',
        clientPermissions: [],
      },
    };
    const revalidatedActor: ActorContext = {
      ...selfActor,
      activeCompany: {
        id: companyId,
        displayName: 'PRISMA-PRIM',
        clientPermissions: ['client.read', 'client.create', 'client.update'],
      },
    };
    const state = {
      members: [
        {
          workspaceMembershipId: ownerMembershipId,
          displayName: 'Workspace Owner',
          email: 'owner@example.test',
        },
      ],
      companies: [{ id: companyId, displayName: 'PRISMA-PRIM' }],
      assignments: [],
    };
    const grantedState = {
      ...state,
      assignments: [
        {
          id: 'assignment-1',
          workspaceMembershipId: ownerMembershipId,
          companyId,
          bundle: 'Company Director Client Access',
          permissionSetVersion: 'v2',
          active: true,
        },
      ],
    };
    const assignment = {
      id: 'assignment-1',
      workspaceMembershipId: ownerMembershipId,
      companyId,
      bundle: 'Company Director Client Access',
      active: true,
    };
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(
          new Response(JSON.stringify(state), { status: 200 }),
        )
        .mockResolvedValueOnce(
          new Response(JSON.stringify(assignment), { status: 201 }),
        )
        .mockResolvedValueOnce(new Response(null, { status: 500 }))
        .mockResolvedValueOnce(new Response(null, { status: 500 }))
        .mockResolvedValueOnce(
          new Response(JSON.stringify(grantedState), { status: 200 }),
        )
        .mockResolvedValueOnce(
          new Response(JSON.stringify(assignment), { status: 201 }),
        )
        .mockResolvedValueOnce(
          new Response(JSON.stringify(revalidatedActor), { status: 200 }),
        )
        .mockResolvedValueOnce(
          new Response(JSON.stringify(grantedState), { status: 200 }),
        ),
    );
    const acceptActor = vi.fn(async () => undefined);

    render(
      <CompanyContextAccess
        actor={selfActor}
        identity={deterministicBrowserIdentity()}
        onActorRevalidated={acceptActor}
      />,
    );
    await screen.findByLabelText('Workspace member');
    changeValue(screen.getByLabelText('Workspace member'), ownerMembershipId);
    changeValue(screen.getByLabelText('Company'), companyId);
    changeValue(screen.getByLabelText('Access bundle'), 'director-client');
    fireEvent.click(screen.getByRole('button', { name: 'Grant access' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'The access state could not be loaded or changed.',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Retry access state' }));
    await screen.findByLabelText('Workspace member');
    expect(screen.getByText(/Current server state:/)).toHaveTextContent(
      'Current server state: Granted',
    );
    expect(screen.getByRole('button', { name: 'Grant access' })).toBeEnabled();

    fireEvent.click(screen.getByRole('button', { name: 'Grant access' }));
    await screen.findByText('Access granted. Server state refreshed.');

    const firstKey = new Headers(
      vi.mocked(fetch).mock.calls[1]?.[1]?.headers,
    ).get('idempotency-key');
    const retryKey = new Headers(
      vi.mocked(fetch).mock.calls[5]?.[1]?.headers,
    ).get('idempotency-key');
    expect(firstKey).toBeTruthy();
    expect(retryKey).toBe(firstKey);
    expect(acceptActor).toHaveBeenCalledWith(revalidatedActor);
  });

  it('rejects the session when the administration read is unauthorized', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          new Response(
            JSON.stringify({ message: 'Unauthorized', statusCode: 401 }),
            { status: 401 },
          ),
        ),
    );
    const rejectSession = vi.fn(async () => undefined);
    const identity = { ...deterministicBrowserIdentity(), rejectSession };

    render(<CompanyContextAccess actor={ownerActor} identity={identity} />);

    await waitFor(() => expect(rejectSession).toHaveBeenCalledOnce());
  });

  it('does not send a credential-delayed mutation after unmount', async () => {
    const mutationToken = deferred<string | null>();
    const getToken = vi
      .fn()
      .mockResolvedValueOnce('administration-token')
      .mockImplementationOnce(() => mutationToken.promise);
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(
          new Response(JSON.stringify(administration()), { status: 200 }),
        ),
    );
    const identity = {
      ...deterministicBrowserIdentity(),
      getToken,
    };
    const { unmount } = render(
      <CompanyContextAccess actor={ownerActor} identity={identity} />,
    );
    await screen.findByLabelText('Workspace member');
    chooseTargets();
    fireEvent.click(screen.getByRole('button', { name: 'Grant access' }));
    await waitFor(() => expect(getToken).toHaveBeenCalledTimes(2));

    unmount();
    await act(async () => {
      mutationToken.resolve('mutation-token');
      await mutationToken.promise;
      await Promise.resolve();
    });

    expect(fetch).toHaveBeenCalledOnce();
  });

  it('does not publish a stale administration read after identity replacement', async () => {
    const firstResponse = deferred<Response>();
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockImplementationOnce(() => firstResponse.promise)
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({
              members: [
                {
                  workspaceMembershipId: memberId,
                  displayName: 'New Session Member',
                  email: 'new@example.test',
                },
              ],
              companies: [{ id: companyId, displayName: 'New Company' }],
              assignments: [],
            }),
            { status: 200 },
          ),
        ),
    );
    const firstIdentity = deterministicBrowserIdentity({
      'x-test-identity': 'first',
    });
    const secondIdentity = deterministicBrowserIdentity({
      'x-test-identity': 'second',
    });
    const { rerender } = render(
      <CompanyContextAccess actor={ownerActor} identity={firstIdentity} />,
    );

    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    rerender(
      <CompanyContextAccess actor={ownerActor} identity={secondIdentity} />,
    );
    await waitFor(() =>
      expect(screen.getByLabelText('Workspace member')).toBeEnabled(),
    );
    fireEvent.click(screen.getByLabelText('Workspace member'));
    expect(
      screen.getByRole('option', {
        name: 'New Session Member — new@example.test',
      }),
    ).toBeInTheDocument();

    await act(async () => {
      firstResponse.resolve(
        new Response(
          JSON.stringify({
            members: [
              {
                workspaceMembershipId: memberId,
                displayName: 'Stale Member',
                email: 'stale@example.test',
              },
            ],
            companies: [{ id: companyId, displayName: 'Stale Company' }],
            assignments: [],
          }),
          { status: 200 },
        ),
      );
      await firstResponse.promise;
    });

    expect(
      screen.queryByText('Stale Member — stale@example.test'),
    ).not.toBeInTheDocument();
  });
});

function chooseTargets() {
  selectOption(screen.getByLabelText('Workspace member'), memberId);
  selectOption(screen.getByLabelText('Company'), companyId);
}

function chooseBundle(value: string) {
  selectOption(screen.getByLabelText('Access bundle'), value);
}

const ownerActor: ActorContext = {
  internalUserId: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
  workspaceMembershipId: ownerMembershipId,
  workspaceId: 'ffffffff-ffff-4fff-8fff-ffffffffffff',
  workspaceName: 'PRISMA Workspace',
  displayName: 'Workspace Owner',
  email: 'owner@example.test',
  active: true,
  workspacePermissions: [
    'company.manage',
    'company.assignment.manage',
    'client.manage',
  ],
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolver) => {
    resolve = resolver;
  });
  return { promise, resolve };
}
