import '@testing-library/jest-dom/vitest';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ActorContext } from '../access-types';
import { deterministicBrowserIdentity } from '../access-composition';
import {
  InterfaceLocaleProvider,
  interfaceLocaleStorageKey,
} from '../localization/interface-locale';
import { OfferPanel } from './OfferPanel';
import {
  MODEL_OFFER_OPPORTUNITY,
  modelOfferActor,
  modelOfferFixture,
} from './model-offer.fixture';
import { modelOfferQualityCodes } from './offer-response';

const identity = deterministicBrowserIdentity({
  'x-test-external-subject': 'synthetic-command-owner',
});
const cases = [
  ['quality', 'Run Quality Checks', 'Retry the same Quality Checks'],
  ['approve', 'Approve this version', 'Retry the same decision'],
  ['reject', 'Reject this version', 'Retry the same decision'],
  [
    'transmission',
    'Record simulated transmission',
    'Retry the same transmission',
  ],
  ['response', 'Record simulated expiry', 'Retry the same Client response'],
] as const;
type Kind = (typeof cases)[number][0];
const priorId = '90000000-0000-4000-8000-000000000852';
function response(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}
function fixture(kind: Kind) {
  const company = modelOfferActor.activeCompany;
  if (!company) throw new Error('Missing synthetic Company.');
  const actor: ActorContext = {
    ...modelOfferActor,
    activeCompany: {
      ...company,
      offerApproverAssignmentId: 'approver-852',
      offerApproverPermissionSetVersion: 'v2',
      offerPermissions: [
        ...(company.offerPermissions ?? []),
        'commercial.offer.approve',
        'commercial.offer.model_based.approve',
        'commercial.offer.response.record',
        'commercial.offer.model_based.response.record',
      ],
    },
  };
  const original = modelOfferFixture();
  const time = original.version.createdAt;
  const warnings = [
    'DECLARED_TAX_UNVERIFIED',
    'NON_OFFICIAL_OFFER',
    'ILLUSTRATIVE_MODEL',
  ];
  const run = {
    id: 'model-run',
    offerVersionId: original.version.id,
    ruleSet: 'OFFER_QUALITY_COMPANY_MODEL',
    ruleSetVersion: 1,
    actorWorkspaceMembershipId: actor.workspaceMembershipId,
    evaluatedAt: time,
    results: modelOfferQualityCodes.map((code) => ({
      code,
      status: warnings.includes(code) ? 'WARNING' : 'PASS',
    })),
  };
  const approval = {
    id: 'approval',
    offerVersionId: original.version.id,
    offerRevision: 3,
    actorWorkspaceMembershipId: actor.workspaceMembershipId,
    decidedAt: time,
    state: 'APPROVED',
    qualityRun: run,
    acknowledgedWarningCodes: warnings,
    representationSha256: original.version.representation.sha256,
  };
  const transmission = {
    id: 'transmission',
    offerVersionId: original.version.id,
    offerRevision: 4,
    actorWorkspaceMembershipId: actor.workspaceMembershipId,
    transmittedAt: time,
    channel: 'SIMULATED',
    note: null,
    qualityRun: run,
    acknowledgedWarningCodes: [],
    representationSha256: original.version.representation.sha256,
  };
  const offer = {
    ...original,
    revision: kind === 'response' ? 4 : kind === 'transmission' ? 3 : 2,
    version: {
      ...original.version,
      versionNumber: 2,
      predecessorVersionId: priorId,
      latestQualityRun: run,
      ...(kind === 'transmission' || kind === 'response'
        ? { decisionState: 'APPROVED', decision: approval }
        : {}),
      ...(kind === 'response'
        ? {
            transmissionState: 'TRANSMITTED',
            transmission,
            clientResponseState: 'PENDING',
            validityElapsed: true,
          }
        : {}),
    },
  };
  const result =
    kind === 'quality'
      ? run
      : kind === 'approve'
        ? approval
        : kind === 'reject'
          ? {
              id: 'rejection',
              offerVersionId: original.version.id,
              offerRevision: 3,
              actorWorkspaceMembershipId: actor.workspaceMembershipId,
              decidedAt: time,
              state: 'REJECTED',
              reason: 'Synthetic rejection',
            }
          : kind === 'transmission'
            ? transmission
            : {
                id: 'response',
                offerVersionId: original.version.id,
                offerRevision: 5,
                actorWorkspaceMembershipId: actor.workspaceMembershipId,
                decidedAt: original.version.validUntil,
                evidenceKind: 'SIMULATED',
                outcome: 'EXPIRED',
              };
  const history = {
    versions: [
      {
        id: original.version.id,
        versionNumber: 2,
        createdAt: time,
        supersededByVersionId: null,
      },
      {
        id: priorId,
        versionNumber: 1,
        createdAt: time,
        supersededByVersionId: original.version.id,
      },
    ],
    nextCursor: null,
  };
  const prior = {
    ...offer,
    version: {
      ...original.version,
      id: priorId,
      supersededByVersionId: original.version.id,
      supersededAt: time,
    },
  };
  return { actor, offer, result, history, prior };
}
function panel(actor: ActorContext) {
  return (
    <InterfaceLocaleProvider>
      <OfferPanel
        actor={actor}
        identity={identity}
        opportunityId={MODEL_OFFER_OPPORTUNITY}
        currentClientId="client-1"
        onCompanyContextRejected={() => undefined}
      />
    </InterfaceLocaleProvider>
  );
}
function commandButtons() {
  return screen
    .getAllByRole('button')
    .filter((button) =>
      /^(?:Prepare full Offer from approved model|Prepare from an approved estimate|Prepare a new version|Open version 1|Run Quality Checks|Approve this version|Reject this version|Record simulated (?:transmission|acceptance|Client rejection|expiry))$/u.test(
        button.textContent ?? '',
      ),
    );
}
beforeEach(() => window.localStorage.setItem(interfaceLocaleStorageKey, 'en'));
afterEach(() => {
  vi.restoreAllMocks();
  window.localStorage.clear();
});

describe('Offer command ownership', () => {
  it.each(cases)(
    'retains %s as the only retry across lost and malformed confirmation and unlocks siblings only after resolution',
    async (kind, action, retry) => {
      const data = fixture(kind);
      const attempts: {
        path: string;
        body: BodyInit | null | undefined;
        key: string | null;
      }[] = [];
      vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
        const path = input.toString();
        if (init?.method === 'POST') {
          attempts.push({
            path,
            body: init.body,
            key: new Headers(init.headers).get('idempotency-key'),
          });
          return attempts.length === 1
            ? response({}, 503)
            : attempts.length === 2
              ? response({}, 201)
              : response(data.result, 201);
        }
        if (path.endsWith('/versions')) return response(data.history);
        return response({ offer: data.offer });
      });
      render(panel(data.actor));
      await screen.findByRole('button', {
        name: 'Open version 1',
      });
      if (kind === 'reject')
        fireEvent.change(screen.getByLabelText('Rejection reason'), {
          target: { value: 'Synthetic rejection' },
        });
      if (kind === 'approve')
        for (const checkbox of screen.getAllByRole('checkbox'))
          fireEvent.click(checkbox);
      fireEvent.click(await screen.findByRole('button', { name: action }));
      for (let index = 0; index < 2; index++) {
        const identical = await screen.findByRole('button', {
          name: retry,
        });
        expect(identical).toBeEnabled();
        for (const sibling of commandButtons()) {
          expect(sibling, sibling.textContent ?? '').toBeDisabled();
          act(() => sibling.click());
        }
        expect(attempts).toHaveLength(index + 1);
        fireEvent.click(identical);
      }
      await waitFor(() => expect(attempts).toHaveLength(3));
      expect(attempts[0]).toEqual(attempts[1]);
      expect(attempts[1]).toEqual(attempts[2]);
      await waitFor(() =>
        expect(
          screen.getByRole('button', {
            name: 'Prepare full Offer from approved model',
          }),
        ).toBeEnabled(),
      );
      expect(
        screen.queryByRole('button', { name: retry }),
      ).not.toBeInTheDocument();
      expect(
        screen.getByRole('button', { name: 'Open version 1' }),
      ).toBeEnabled();
    },
  );

  it.each(['history', 'successor'] as const)(
    'ignores an earlier %s reply while a later workflow command owns unresolved intent',
    async (read) => {
      const data = fixture('quality');
      let release: ((reply: Response) => void) | undefined;
      vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
        const path = input.toString();
        if (init?.method === 'POST') return response({}, 503);
        if (
          path.endsWith(`/versions/${priorId}`) ||
          path.includes('/snapshots?')
        )
          return new Promise<Response>((resolve) => {
            release = resolve;
          });
        if (path.endsWith('/legal-entities'))
          return response({ clientVersion: 1, legalEntities: [] });
        return path.endsWith('/versions')
          ? response(data.history)
          : response({ offer: data.offer });
      });
      render(panel(data.actor));
      fireEvent.click(
        await screen.findByRole('button', {
          name: read === 'history' ? 'Open version 1' : 'Prepare a new version',
        }),
      );
      await waitFor(() => expect(release).toBeDefined());
      fireEvent.click(
        screen.getByRole('button', { name: 'Run Quality Checks' }),
      );
      await screen.findByRole('button', {
        name: 'Retry the same Quality Checks',
      });
      await act(async () => {
        release?.(
          response(
            read === 'history'
              ? { offer: data.prior }
              : { items: [], nextCursor: null },
          ),
        );
      });
      expect(
        screen.getByRole('button', {
          name: 'Retry the same Quality Checks',
        }),
      ).toBeEnabled();
      expect(
        screen.queryByText('Historical version · read only'),
      ).not.toBeInTheDocument();
      expect(
        screen.getByRole('button', {
          name: 'Prepare full Offer from approved model',
        }),
      ).toBeDisabled();
    },
  );
});
