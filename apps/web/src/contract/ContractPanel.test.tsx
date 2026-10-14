import {
  assertMessageCoverage,
  resolveMessage,
} from '../localization/messages';
import { contractAddendumMessages } from './contract-addendum.copy';
import { contractVersionMessages } from './contract-version.copy';
import { contractDecisionMessages } from './contract-decision.copy';
import { contractSignatureMessages } from './contract-signature.copy';
import { contractProjectsMessages } from './contract-projects.copy';
import { contractPrecontractMessages } from './contract-precontract.copy';
import { contractRuleSetMessages } from './contract-rule-set.copy';
import { ProjectContracts } from './ProjectContracts';
import '@testing-library/jest-dom/vitest';
import {
  act,
  fireEvent,
  render,
  screen,
  within,
  waitFor,
} from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { deterministicBrowserIdentity } from '../access-composition';
import type { ActorContext } from '../access-types';
import { ContractPanel } from './ContractPanel';
import {
  InterfaceLocaleProvider,
  interfaceLocales,
  interfaceLocaleStorageKey,
  useInterfaceLocale,
} from '../localization/interface-locale';
const identity = deterministicBrowserIdentity({
  'x-test-external-subject': 'contract-reader',
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  window.localStorage.removeItem(interfaceLocaleStorageKey);
});
function SignatureLocaleChoices() {
  const { changeLocale } = useInterfaceLocale();
  return (
    <>
      {interfaceLocales.map((locale) => (
        <button key={locale} onClick={() => changeLocale(locale)}>
          Choose {locale}
        </button>
      ))}
    </>
  );
}
describe('ContractPanel', () => {
  it('C7 creates a Precontract with an identical uncertain retry and opens it as its own agreement', async () => {
    window.localStorage.setItem(interfaceLocaleStorageKey, 'en');
    const precontract = precontractUiFixture();
    const attempts: Array<{ body: unknown; key: string | null }> = [];
    const reads: string[] = [];
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const path = input.toString();
      if (init?.method === 'POST') {
        attempts.push({
          body: typeof init.body === 'string' && JSON.parse(init.body),
          key: new Headers(init.headers).get('idempotency-key'),
        });
        return attempts.length === 1
          ? response({}, 500)
          : response(precontract, 201);
      }
      if (path.includes('/offers/')) return acceptedOfferResponse();
      if (path.endsWith('/versions'))
        return response({ items: [precontract.version], nextCursor: null });
      if (path.includes('/agreements/precontract-one')) {
        reads.push(path);
        return response({ contract: precontract });
      }
      return response({ contract: null, precontract: null });
    });
    render(
      <InterfaceLocaleProvider>
        <ContractPanel
          actor={actor(true)}
          identity={identity}
          opportunityId="opportunity-one"
          onCompanyContextRejected={() => undefined}
        />
      </InterfaceLocaleProvider>,
    );
    const create = await screen.findByRole('button', {
      name: 'Create Precontract',
    });
    expect(
      screen.getByRole('button', { name: 'Create Contract' }),
    ).toBeVisible();
    fireEvent.change(screen.getByLabelText('Preliminary work scope'), {
      target: { value: 'Synthetic preliminary scope' },
    });
    fireEvent.change(
      screen.getByLabelText('Preliminary financial conditions'),
      {
        target: { value: 'Synthetic advance' },
      },
    );
    fireEvent.change(screen.getByLabelText('Limits until the Contract'), {
      target: { value: 'Synthetic limit' },
    });
    fireEvent.change(screen.getByLabelText('Precontract term end'), {
      target: { value: '2026-12-31' },
    });
    fireEvent.click(create);
    expect(
      await screen.findByText(
        'The Precontract result is uncertain. Retry the same command.',
      ),
    ).toBeVisible();
    expect(screen.getByLabelText('Preliminary work scope')).toBeDisabled();
    expect(
      screen.getByRole('button', { name: 'Create Contract' }),
    ).toBeDisabled();
    fireEvent.click(
      screen.getByRole('button', {
        name: 'Retry the same Precontract command',
      }),
    );
    expect(await screen.findByText('Precontract created.')).toBeVisible();
    expect(attempts).toHaveLength(2);
    expect(attempts[1]).toEqual(attempts[0]);
    expect(attempts[0]?.body).toEqual({
      kind: 'PRECONTRACT',
      acceptedOfferVersionId: 'accepted-version',
      preliminaryWorkScope: 'Synthetic preliminary scope',
      preliminaryFinancialConditions: 'Synthetic advance',
      preliminaryLimits: 'Synthetic limit',
      termStartsOn: null,
      termEndsOn: '2026-12-31',
      specialConditions: null,
    });
    expect(
      screen.getByRole('heading', { name: 'Illustrative Precontract' }),
    ).toBeVisible();
    expect(
      screen.getByText('Synthetic limit', { selector: 'dd' }),
    ).toBeVisible();
    expect(
      screen.getByRole('button', { name: 'Back to the Contract area' }),
    ).toBeEnabled();
    expect(reads[0]).toContain(
      '/contracts/opportunities/opportunity-one/agreements/precontract-one',
    );
  });
  it('C7 lists an existing Precontract instead of offering a second one and opens the main Contract reference', async () => {
    window.localStorage.setItem(interfaceLocaleStorageKey, 'en');
    let main = false;
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const path = input.toString();
      if (path.includes('/offers/')) return acceptedOfferResponse();
      if (path.endsWith('/versions'))
        return response({ items: [], nextCursor: null });
      if (path.includes('/agreements/precontract-one'))
        return response({ contract: precontractUiFixture() });
      return response({
        contract: main
          ? {
              ...fixture(),
              precontract: { id: 'precontract-one', illustrativeReference: 4 },
            }
          : null,
        precontract: {
          id: 'precontract-one',
          illustrativeReference: 4,
          versionNumber: 2,
          decisionState: 'APPROVED',
          executionState: 'EXECUTED',
        },
      });
    });
    render(
      <InterfaceLocaleProvider>
        <ContractPanel
          actor={actor(true)}
          identity={identity}
          opportunityId="opportunity-one"
          onCompanyContextRejected={() => undefined}
        />
      </InterfaceLocaleProvider>,
    );
    const section = await screen.findByRole('region', { name: 'Precontract' });
    expect(
      within(section).getByText(
        'Illustrative Precontract reference 4 · Version 2 · Approved internally · Executed — simulated evidence only',
      ),
    ).toBeVisible();
    expect(
      screen.queryByRole('button', { name: 'Create Precontract' }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Create Contract' }),
    ).toBeVisible();
    main = true;
    fireEvent.click(screen.getByRole('button', { name: 'Reload Contract' }));
    expect(
      await screen.findByText('Illustrative Precontract reference'),
    ).toBeVisible();
    expect(screen.getByText('4', { selector: 'dd' })).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Open Precontract' }));
    expect(
      await screen.findByRole('heading', { name: 'Illustrative Precontract' }),
    ).toBeVisible();
    fireEvent.click(
      screen.getByRole('button', { name: 'Back to the Contract area' }),
    );
    expect(
      await screen.findByRole('button', { name: 'Open Precontract' }),
    ).toBeVisible();
  });
  it.each(['PRECONTRACT_AFTER_CONTRACT', 'CONTRACT_ALREADY_EXISTS'] as const)(
    'C7 presents %s without an uncertain retry and keeps entered values',
    async (code) => {
      window.localStorage.setItem(interfaceLocaleStorageKey, 'en');
      vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
        if (init?.method === 'POST')
          return response({ code, message: 'Refused.' }, 409);
        if (input.toString().includes('/offers/'))
          return acceptedOfferResponse();
        return response({ contract: null, precontract: null });
      });
      render(
        <InterfaceLocaleProvider>
          <ContractPanel
            actor={actor(true)}
            identity={identity}
            opportunityId="opportunity-one"
            onCompanyContextRejected={() => undefined}
          />
        </InterfaceLocaleProvider>,
      );
      for (const label of [
        'Preliminary work scope',
        'Preliminary financial conditions',
        'Limits until the Contract',
      ])
        fireEvent.change(await screen.findByLabelText(label), {
          target: { value: 'Kept ' + label },
        });
      fireEvent.change(screen.getByLabelText('Precontract term end'), {
        target: { value: '2026-12-31' },
      });
      fireEvent.click(
        screen.getByRole('button', { name: 'Create Precontract' }),
      );
      expect(
        await screen.findByText(
          code === 'PRECONTRACT_AFTER_CONTRACT'
            ? 'A Precontract can only be prepared before the Contract.'
            : 'This Opportunity already has a Precontract. Reload it.',
        ),
      ).toBeVisible();
      expect(
        screen.getByRole('button', { name: 'Create Precontract' }),
      ).toBeDisabled();
      expect(screen.getByLabelText('Limits until the Contract')).toHaveValue(
        'Kept Limits until the Contract',
      );
    },
  );
  it('C7 refuses incomplete preliminary work locally and never offers creation to readers', async () => {
    window.localStorage.setItem(interfaceLocaleStorageKey, 'en');
    const fetch = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(async (input) =>
        input.toString().includes('/offers/')
          ? acceptedOfferResponse()
          : response({ contract: null, precontract: null }),
      );
    const view = render(
      <InterfaceLocaleProvider>
        <ContractPanel
          actor={actor(true)}
          identity={identity}
          opportunityId="opportunity-one"
          onCompanyContextRejected={() => undefined}
        />
      </InterfaceLocaleProvider>,
    );
    fireEvent.change(await screen.findByLabelText('Preliminary work scope'), {
      target: { value: '   ' },
    });
    fireEvent.submit(
      screen.getByRole('button', { name: 'Create Precontract' }),
    );
    expect(
      await screen.findByText(
        'Check the preliminary work, the term end and the dates.',
      ),
    ).toBeVisible();
    expect(fetch.mock.calls.some(([, init]) => init?.method === 'POST')).toBe(
      false,
    );
    view.rerender(
      <InterfaceLocaleProvider>
        <ContractPanel
          actor={actor(false)}
          identity={identity}
          opportunityId="opportunity-one"
          onCompanyContextRejected={() => undefined}
        />
      </InterfaceLocaleProvider>,
    );
    expect(await screen.findByText(copyEmpty)).toBeVisible();
    expect(
      screen.queryByRole('button', { name: 'Create Precontract' }),
    ).not.toBeInTheDocument();
  });
  it.each(interfaceLocales)(
    'C7 localizes Precontract creation in %s',
    async (locale) => {
      assertMessageCoverage('contractPrecontract', contractPrecontractMessages);
      window.localStorage.setItem(interfaceLocaleStorageKey, locale);
      vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) =>
        input.toString().includes('/offers/')
          ? acceptedOfferResponse()
          : response({ contract: null, precontract: null }),
      );
      render(
        <InterfaceLocaleProvider>
          <ContractPanel
            actor={actor(true)}
            identity={identity}
            opportunityId="opportunity-one"
            onCompanyContextRejected={() => undefined}
          />
        </InterfaceLocaleProvider>,
      );
      const copy = (key: (typeof contractPrecontractMessages.keys)[number]) =>
        resolveMessage(contractPrecontractMessages, locale, key);
      expect(
        await screen.findByRole('button', { name: copy('create') }),
      ).toBeVisible();
      for (const key of ['scope', 'financial', 'limits', 'end'] as const)
        expect(screen.getByLabelText(copy(key))).toBeVisible();
    },
  );
  it('C9 creates DIRECT without Offer access and retains an identical uncertain retry', async () => {
    window.localStorage.setItem(interfaceLocaleStorageKey, 'en');
    const preparer = actor(true);
    if (!preparer.activeCompany) throw new Error('Missing Company');
    preparer.activeCompany.offerPermissions = [];
    preparer.activeCompany.pricingUserPermissionAssignmentId = 'pricing-one';
    preparer.activeCompany.pricingUserPermissionSetVersion = 'v1';
    preparer.activeCompany.pricingUserPermissions = [
      'commercial.pricing.snapshot.read',
    ];
    const direct = {
      ...fixture(),
      origin: 'DIRECT',
      directReason: ' Internal reason ',
      sourceOfferId: null,
      sourceOfferVersionId: null,
      sourceOffer: null,
      parent: null,
      parentContractId: null,
      addendumOrdinal: null,
    };
    const attempts: Array<{ body: unknown; key: string | null }> = [];
    const calls: string[] = [];
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const path = input.toString();
      calls.push(path);
      if (path.endsWith('/direct') && init?.method === 'POST') {
        attempts.push({
          body: init.body,
          key: new Headers(init.headers).get('idempotency-key'),
        });
        return attempts.length === 1
          ? response({}, 500)
          : response(direct, 201);
      }
      if (path.includes('/snapshots'))
        return response({
          items: [
            {
              id: 'snapshot-one',
              currency: 'EUR',
              total: '345.00',
              committedAt: '2026-10-07T09:00:00.000Z',
            },
          ],
        });
      if (path.endsWith('/legal-entities'))
        return response({ clientVersion: 1, legalEntities: [] });
      if (path.endsWith('/representation')) return response(representation());
      if (path.endsWith('/versions'))
        return response({ items: [direct.version], nextCursor: null });
      return response({ contract: null });
    });
    render(
      <InterfaceLocaleProvider>
        <ContractPanel
          actor={preparer}
          identity={identity}
          opportunityId="opportunity-one"
          currentClientId="client-one"
          onCompanyContextRejected={() => undefined}
        />
      </InterfaceLocaleProvider>,
    );
    fireEvent.change(await screen.findByLabelText('Internal direct reason'), {
      target: { value: ' Internal reason ' },
    });
    fireEvent.change(screen.getByLabelText('Direct scope'), {
      target: { value: ' Exact scope ' },
    });
    fireEvent.click(
      screen.getByRole('button', { name: 'Create direct Contract' }),
    );
    expect(
      await screen.findByText(
        'The direct Contract result is uncertain. Retry the identical command.',
      ),
    ).toBeVisible();
    expect(screen.getByLabelText('Internal direct reason')).toBeDisabled();
    fireEvent.click(
      screen.getByRole('button', {
        name: 'Retry identical direct Contract command',
      }),
    );
    expect(await screen.findByText('Direct origin')).toBeVisible();
    expect(attempts).toHaveLength(2);
    expect(attempts[1]).toEqual(attempts[0]);
    expect(calls.some((path) => path.includes('/offers/'))).toBe(false);
  });
  it('C9 revision keeps its recorded Snapshot when it is not on the first loaded page', async () => {
    window.localStorage.setItem(interfaceLocaleStorageKey, 'en');
    const preparer = actor(true);
    if (!preparer.activeCompany) throw new Error('Missing Company');
    preparer.activeCompany.offerPermissions = [];
    preparer.activeCompany.pricingUserPermissionAssignmentId = 'pricing-one';
    preparer.activeCompany.pricingUserPermissionSetVersion = 'v1';
    preparer.activeCompany.pricingUserPermissions = [
      'commercial.pricing.snapshot.read',
    ];
    const base = fixture();
    const direct = {
      ...base,
      origin: 'DIRECT',
      directReason: 'Internal reason',
      sourceOfferId: null,
      sourceOfferVersionId: null,
      sourceOffer: null,
      parent: null,
      parentContractId: null,
      addendumOrdinal: null,
      version: { ...base.version, scopeNote: 'Recorded scope' },
    };
    const revisions: unknown[] = [];
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const path = input.toString();
      if (path.endsWith('/versions') && init?.method === 'POST') {
        revisions.push(typeof init.body === 'string' && JSON.parse(init.body));
        return new Promise<Response>(() => undefined);
      }
      if (path.includes('/snapshots'))
        return response({
          items: [
            {
              id: 'snapshot-newer',
              currency: 'EUR',
              total: '999.00',
              committedAt: '2026-10-08T09:00:00.000Z',
            },
          ],
          nextCursor: 'older-page',
        });
      if (path.endsWith('/representation')) return response(representation());
      if (path.endsWith('/versions'))
        return response({ items: [direct.version], nextCursor: null });
      return response({ contract: direct });
    });
    render(
      <InterfaceLocaleProvider>
        <ContractPanel
          actor={preparer}
          identity={identity}
          opportunityId="opportunity-one"
          currentClientId="client-one"
          onCompanyContextRejected={() => undefined}
        />
      </InterfaceLocaleProvider>,
    );
    const revise = await screen.findByRole('button', {
      name: 'Create new direct Contract Version',
    });
    await waitFor(() => expect(revise).toBeEnabled());
    fireEvent.change(screen.getByLabelText('Direct scope'), {
      target: { value: 'Revised scope' },
    });
    fireEvent.click(revise);
    await waitFor(() => expect(revisions).toHaveLength(1));
    expect(revisions[0]).toMatchObject({
      pricingSnapshotId: 'snapshot-one',
      scopeNote: 'Revised scope',
    });
  });
  it('C9 suppresses a late direct creation after independent Snapshot authority changes', async () => {
    window.localStorage.setItem(interfaceLocaleStorageKey, 'en');
    const preparer = actor(true);
    if (!preparer.activeCompany) throw new Error('Missing Company');
    preparer.activeCompany.offerPermissions = [];
    preparer.activeCompany.pricingUserPermissionAssignmentId = 'pricing-one';
    preparer.activeCompany.pricingUserPermissionSetVersion = 'v1';
    preparer.activeCompany.pricingUserPermissions = [
      'commercial.pricing.snapshot.read',
    ];
    let resolveLate: ((value: Response) => void) | undefined;
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const path = input.toString();
      if (path.endsWith('/direct') && init?.method === 'POST')
        return new Promise<Response>((resolve) => {
          resolveLate = resolve;
        });
      if (path.includes('/snapshots'))
        return response({
          items: [
            {
              id: 'snapshot-one',
              currency: 'EUR',
              total: '345.00',
              committedAt: '2026-10-07T09:00:00.000Z',
            },
          ],
          nextCursor: null,
        });
      if (path.endsWith('/legal-entities'))
        return response({ clientVersion: 1, legalEntities: [] });
      return response({ contract: null });
    });
    const props = {
      identity,
      opportunityId: 'opportunity-one',
      currentClientId: 'client-one',
      onCompanyContextRejected: () => undefined,
    };
    const view = render(
      <InterfaceLocaleProvider>
        <ContractPanel {...props} actor={preparer} />
      </InterfaceLocaleProvider>,
    );
    fireEvent.change(await screen.findByLabelText('Internal direct reason'), {
      target: { value: 'Internal reason' },
    });
    fireEvent.change(screen.getByLabelText('Direct scope'), {
      target: { value: 'Exact scope' },
    });
    fireEvent.click(
      screen.getByRole('button', { name: 'Create direct Contract' }),
    );
    await waitFor(() => expect(resolveLate).toBeDefined());
    view.rerender(
      <InterfaceLocaleProvider>
        <ContractPanel
          {...props}
          actor={{
            ...preparer,
            activeCompany: {
              ...preparer.activeCompany,
              pricingUserPermissions: [],
            },
          }}
        />
      </InterfaceLocaleProvider>,
    );
    await waitFor(() =>
      expect(
        screen.queryByLabelText('Internal direct reason'),
      ).not.toBeInTheDocument(),
    );
    await act(async () => {
      resolveLate?.(
        response(
          {
            ...fixture(),
            origin: 'DIRECT',
            directReason: 'Internal reason',
            sourceOfferId: null,
            sourceOfferVersionId: null,
            sourceOffer: null,
            parent: null,
            parentContractId: null,
            addendumOrdinal: null,
          },
          201,
        ),
      );
    });
    expect(
      screen.queryByText('Direct origin', { exact: true }),
    ).not.toBeInTheDocument();
  });
  it('C8 keeps exact uncertain Addendum creation and opens its own optional-price content', async () => {
    window.localStorage.setItem(interfaceLocaleStorageKey, 'en');
    const parent = { ...executedUiFixture(), addenda: [] };
    const original = fixture();
    const child = {
      ...original,
      id: 'addendum-one',
      kind: 'ADDENDUM',
      origin: null,
      sourceOfferId: null,
      sourceOfferVersionId: null,
      sourceOffer: null,
      parentContractId: parent.id,
      addendumOrdinal: 1,
      parent: {
        id: parent.id,
        illustrativeReference: 1,
        versionNumber: 1,
        revision: 3,
        kind: 'CONTRACT',
      },
      addenda: [],
      linkedProjects: [],
      version: {
        ...original.version,
        id: 'addendum-version-one',
        specialConditions: null,
        scopeNote: null,
        commercialConditions: null,
        changeSummary: '  Exact child change  ',
        pricingSnapshotId: null,
        pricingSnapshot: null,
      },
    };
    const attempts: Array<{ body: unknown; key: string | null }> = [];
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const path = input.toString();
      if (init?.method === 'POST' && path.endsWith('/addenda')) {
        attempts.push({
          body: init.body,
          key: new Headers(init.headers).get('idempotency-key'),
        });
        return attempts.length === 1 ? response({}, 500) : response(child, 201);
      }
      if (path.endsWith('/versions'))
        return response({
          items: [
            path.includes('/agreements/addendum-one')
              ? child.version
              : parent.version,
          ],
          nextCursor: null,
        });
      return response({
        contract: path.includes('/agreements/addendum-one') ? child : parent,
      });
    });
    render(
      <InterfaceLocaleProvider>
        <ContractPanel
          actor={actor(true)}
          identity={identity}
          opportunityId="opportunity-one"
          onCompanyContextRejected={() => undefined}
        />
      </InterfaceLocaleProvider>,
    );
    fireEvent.change(await screen.findByLabelText('Change summary'), {
      target: { value: '  Exact child change  ' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Create Addendum' }));
    expect(
      await screen.findByText(
        'The Addendum result is uncertain. Retry the identical command.',
      ),
    ).toBeVisible();
    expect(screen.getByLabelText('Change summary')).toBeDisabled();
    fireEvent.click(
      screen.getByRole('button', { name: 'Retry identical Addendum command' }),
    );
    await waitFor(() => expect(attempts).toHaveLength(2));
    expect(attempts[1]).toEqual(attempts[0]);
    expect(
      await screen.findByText('Exact child change', { selector: 'dd' }),
    ).toBeVisible();
    expect(screen.getByText('No Pricing Snapshot referenced.')).toBeVisible();
    expect(
      screen.queryByRole('button', { name: 'Create Project' }),
    ).not.toBeInTheDocument();
  });
  it('C8 selects an older optional Snapshot through its independent current Pricing grant', async () => {
    window.localStorage.setItem(interfaceLocaleStorageKey, 'en');
    const parent = { ...executedUiFixture(), addenda: [] },
      original = fixture();
    const child = {
      ...original,
      id: 'paged-child',
      kind: 'ADDENDUM',
      origin: null,
      sourceOfferId: null,
      sourceOfferVersionId: null,
      sourceOffer: null,
      parentContractId: parent.id,
      addendumOrdinal: 1,
      parent: {
        id: parent.id,
        kind: 'CONTRACT',
        illustrativeReference: 1,
        versionNumber: 1,
        revision: 3,
      },
      addenda: [],
      version: {
        ...original.version,
        id: 'paged-child-version',
        changeSummary: 'Choose old Snapshot',
        specialConditions: null,
        scopeNote: null,
        commercialConditions: null,
        pricingSnapshotId: 'snapshot-old',
        pricingSnapshot: {
          ...original.version.pricingSnapshot,
          id: 'snapshot-old',
        },
      },
    };
    const bodies: unknown[] = [];
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const path = input.toString();
      if (path.includes('/pricing/opportunities/'))
        return response({
          items: [
            {
              id: path.includes('&cursor=') ? 'snapshot-old' : 'snapshot-new',
              currency: 'EUR',
              total: '345.00',
              committedAt: '2026-10-07T09:00:00.000Z',
            },
          ],
          ...(path.includes('&cursor=') ? {} : { nextCursor: 'snapshot-new' }),
        });
      if (init?.method === 'POST') {
        bodies.push(JSON.parse(String(init.body)));
        return response(child, 201);
      }
      const current = path.includes('/agreements/paged-child') ? child : parent;
      return path.endsWith('/versions')
        ? response({ items: [current.version], nextCursor: null })
        : response({ contract: current });
    });
    const preparer = actor(true);
    if (!preparer.activeCompany) throw new Error('Missing Company');
    preparer.activeCompany.offerPermissions = [];
    preparer.activeCompany.pricingUserPermissions = [
      'commercial.pricing.snapshot.read',
    ];
    preparer.activeCompany.pricingUserPermissionSetVersion = 'v1';
    preparer.activeCompany.pricingUserPermissionAssignmentId = 'pricing-grant';
    render(
      <InterfaceLocaleProvider>
        <ContractPanel
          actor={preparer}
          identity={identity}
          opportunityId="opportunity-one"
          onCompanyContextRejected={() => undefined}
        />
      </InterfaceLocaleProvider>,
    );
    fireEvent.change(await screen.findByLabelText('Change summary'), {
      target: { value: 'Choose old Snapshot' },
    });
    fireEvent.click(
      screen.getByRole('button', { name: 'Choose a Pricing Snapshot' }),
    );
    fireEvent.click(
      await screen.findByRole('button', {
        name: 'Load more Pricing Snapshots',
      }),
    );
    await waitFor(() =>
      expect(
        screen.queryByRole('button', { name: 'Load more Pricing Snapshots' }),
      ).not.toBeInTheDocument(),
    );
    fireEvent.click(screen.getByRole('combobox'));
    fireEvent.click(
      screen.getByRole('option', { name: 'EUR · 345.00 · snapshot-old' }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Create Addendum' }));
    await waitFor(() =>
      expect(bodies).toEqual([
        {
          expectedContractRevision: 3,
          changeSummary: 'Choose old Snapshot',
          termEndsOn: null,
          pricingSnapshotId: 'snapshot-old',
        },
      ]),
    );
    expect(
      await screen.findByRole('button', { name: 'Return to parent agreement' }),
    ).toBeVisible();
  });
  it.each(interfaceLocales)(
    'C8 keeps localized values for correctable errors and shows a stale outcome in %s',
    async (locale) => {
      window.localStorage.setItem(interfaceLocaleStorageKey, locale);
      assertMessageCoverage('contractAddendum', contractAddendumMessages);
      const copy = (key: (typeof contractAddendumMessages.keys)[number]) =>
        resolveMessage(contractAddendumMessages, locale, key);
      const parent = { ...executedUiFixture(), addenda: [] };
      let posts = 0;
      vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
        if (init?.method === 'POST' && input.toString().endsWith('/addenda'))
          return ++posts === 1
            ? response({ field: 'changeSummary' }, 400)
            : response({ code: 'STALE_CONTRACT_REVISION' }, 409);
        return input.toString().endsWith('/versions')
          ? response({ items: [parent.version], nextCursor: null })
          : response({ contract: parent });
      });
      const preparer = actor(true);
      if (!preparer.activeCompany) throw new Error('Missing Company');
      preparer.activeCompany.offerPermissions = [];
      render(
        <InterfaceLocaleProvider>
          <ContractPanel
            actor={preparer}
            identity={identity}
            opportunityId="opportunity-one"
            onCompanyContextRejected={() => undefined}
          />
        </InterfaceLocaleProvider>,
      );
      const summary = await screen.findByLabelText(copy('summary'));
      fireEvent.change(summary, {
        target: { value: '  Preserve exact entered text  ' },
      });
      fireEvent.change(screen.getByLabelText(copy('end')), {
        target: { value: '2030-12-31' },
      });
      fireEvent.click(screen.getByRole('button', { name: copy('create') }));
      expect(await screen.findByText(copy('invalid'))).toBeVisible();
      expect(summary).toHaveValue('  Preserve exact entered text  ');
      expect(screen.getByLabelText(copy('end'))).toHaveValue('2030-12-31');
      fireEvent.click(screen.getByRole('button', { name: copy('create') }));
      expect(await screen.findByText(copy('stale'))).toBeVisible();
      expect(
        screen.getByRole('button', { name: copy('create') }),
      ).toBeDisabled();
    },
  );
  it('C8 discards a late creation after Company authority changes and retains independent parent navigation without Client read', async () => {
    window.localStorage.setItem(interfaceLocaleStorageKey, 'en');
    const parent = {
      ...executedUiFixture(),
      addenda: [
        {
          id: 'child-one',
          addendumOrdinal: 1,
          illustrativeReference: 1,
          versionNumber: 1,
          decisionState: 'PENDING',
          executionState: 'NOT_EXECUTED',
        },
      ],
    };
    let finish: ((result: Response) => void) | undefined;
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      if (init?.method === 'POST')
        return new Promise<Response>((resolve) => {
          finish = resolve;
        });
      return input.toString().endsWith('/versions')
        ? response({ items: [parent.version], nextCursor: null })
        : response({ contract: parent });
    });
    const show = (current: ActorContext) => (
      <InterfaceLocaleProvider>
        <ContractPanel
          actor={current}
          identity={identity}
          opportunityId="opportunity-one"
          onCompanyContextRejected={() => undefined}
        />
      </InterfaceLocaleProvider>
    );
    const displayed = render(show(actor(true)));
    fireEvent.change(await screen.findByLabelText('Change summary'), {
      target: { value: 'Discard pending response' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Create Addendum' }));
    await waitFor(() => expect(finish).toBeDefined());
    const reader = actor(false);
    displayed.rerender(show(reader));
    expect(
      await screen.findByRole('button', { name: 'Open Addendum 1' }),
    ).toBeEnabled();
    expect(screen.queryByLabelText('Change summary')).not.toBeInTheDocument();
    await act(async () => {
      finish?.(response({ id: 'late-child' }, 201));
    });
    expect(screen.queryByText('Addendum recorded.')).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Open Addendum 1' }),
    ).toBeEnabled();
  });
  it('C6 requires current Company Client read to revise while preserving independent Contract history', async () => {
    window.localStorage.setItem(interfaceLocaleStorageKey, 'en');
    const original = fixture();
    const owner = actor(false);
    owner.workspacePermissions = ['client.manage'];
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) =>
      input.toString().endsWith('/versions')
        ? response({ items: [original.version], nextCursor: null })
        : response({ contract: original }),
    );
    const show = (current: ActorContext) => (
      <InterfaceLocaleProvider>
        <ContractPanel
          actor={current}
          identity={identity}
          opportunityId="opportunity-one"
          onCompanyContextRejected={() => undefined}
        />
      </InterfaceLocaleProvider>
    );
    const view = render(show(owner));
    const expectReadableHistory = async () => {
      expect(await screen.findByText('Synthetic accepted scope')).toBeVisible();
      expect(
        await within(
          screen.getByRole('region', { name: 'Contract Version history' }),
        ).findByRole('button', { name: 'Open Contract Version 1' }),
      ).toBeVisible();
    };
    await expectReadableHistory();
    expect(
      screen.queryByRole('button', { name: 'Create new Contract Version' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByLabelText('Revised special conditions'),
    ).not.toBeInTheDocument();
    const eligible = actor(true);
    eligible.workspacePermissions = ['client.manage'];
    if (!eligible.activeCompany) throw new Error('Missing Company');
    eligible.activeCompany.offerPermissions = [];
    view.rerender(show(eligible));
    expect(
      await screen.findByRole('button', {
        name: 'Create new Contract Version',
      }),
    ).toBeEnabled();
    await expectReadableHistory();
    view.rerender(show(owner));
    await expectReadableHistory();
    expect(
      screen.queryByRole('button', { name: 'Create new Contract Version' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByLabelText('Revised special conditions'),
    ).not.toBeInTheDocument();
  });
  it('C6 keeps an identical revision command for explicit uncertain retry', async () => {
    window.localStorage.setItem(interfaceLocaleStorageKey, 'en');
    const commands: Array<{ body: unknown; key: string | null }> = [];
    const original = fixture();
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      if (init?.method === 'POST' && input.toString().endsWith('/versions')) {
        commands.push({
          body: init.body,
          key: new Headers(init.headers).get('idempotency-key'),
        });
        return commands.length === 1
          ? response({}, 500)
          : response(
              {
                contractId: original.id,
                contractVersionId: 'version-two',
                versionNumber: 2,
                revision: 2,
                createdAt: '2026-09-27T09:00:00.000Z',
                provisional: true,
              },
              201,
            );
      }
      if (input.toString().endsWith('/versions'))
        return response({ items: [original.version], nextCursor: null });
      return response({ contract: original });
    });
    render(
      <InterfaceLocaleProvider>
        <ContractPanel
          actor={actor(true)}
          identity={identity}
          opportunityId="opportunity-one"
          onCompanyContextRejected={() => undefined}
        />
      </InterfaceLocaleProvider>,
    );
    fireEvent.change(
      await screen.findByLabelText('Revised special conditions'),
      { target: { value: '  Exact revision  ' } },
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'Create new Contract Version' }),
    );
    await screen.findByText(
      'The revision result is uncertain. Retry the identical version command.',
    );
    expect(screen.getByLabelText('Revised special conditions')).toBeDisabled();
    expect(commands).toHaveLength(1);
    fireEvent.click(
      screen.getByRole('button', { name: 'Retry identical version command' }),
    );
    await waitFor(() => expect(commands).toHaveLength(2));
    expect(commands[1]).toEqual(commands[0]);
    expect(JSON.parse(String(commands[0]?.body))).toMatchObject({
      expectedContractRevision: 1,
      specialConditions: '  Exact revision  ',
    });
  });
  it.each(interfaceLocales)(
    'C6 preserves editable values after validation in %s without Offer authority',
    async (locale) => {
      window.localStorage.setItem(interfaceLocaleStorageKey, locale);
      const original = fixture();
      const current = actor(true);
      if (!current.activeCompany) throw new Error('Missing Company');
      current.activeCompany.offerPermissions = [];
      vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) =>
        init?.method === 'POST'
          ? response({}, 400)
          : input.toString().endsWith('/versions')
            ? response({ items: [original.version], nextCursor: null })
            : response({ contract: original }),
      );
      render(
        <InterfaceLocaleProvider>
          <ContractPanel
            actor={current}
            identity={identity}
            opportunityId="opportunity-one"
            onCompanyContextRejected={() => undefined}
          />
        </InterfaceLocaleProvider>,
      );
      const message = (key: (typeof contractVersionMessages.keys)[number]) =>
        resolveMessage(contractVersionMessages, locale, key);
      const field = await screen.findByLabelText(message('conditions'));
      fireEvent.change(field, {
        target: { value: '  Keep editable values  ' },
      });
      fireEvent.click(screen.getByRole('button', { name: message('create') }));
      await screen.findByText(message('invalid'));
      expect(field).toHaveValue('  Keep editable values  ');
      expect(field).toBeEnabled();
      expect(() =>
        assertMessageCoverage('contractVersion', contractVersionMessages),
      ).not.toThrow();
    },
  );
  it('C6 discards a late revision result after the Opportunity changes', async () => {
    window.localStorage.setItem(interfaceLocaleStorageKey, 'en');
    let complete: ((response: Response) => void) | undefined;
    const original = fixture();
    const current = actor(true);
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      if (init?.method === 'POST')
        return new Promise<Response>((resolve) => {
          complete = resolve;
        });
      return input.toString().endsWith('/versions')
        ? response({ items: [original.version], nextCursor: null })
        : response({
            contract: {
              ...original,
              opportunityId: input.toString().includes('opportunity-two')
                ? 'opportunity-two'
                : 'opportunity-one',
            },
          });
    });
    const props = {
      actor: current,
      identity,
      onCompanyContextRejected: () => undefined,
    };
    const { rerender } = render(
      <InterfaceLocaleProvider>
        <ContractPanel {...props} opportunityId="opportunity-one" />
      </InterfaceLocaleProvider>,
    );
    fireEvent.change(
      await screen.findByLabelText('Revised special conditions'),
      { target: { value: 'Old context edit' } },
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'Create new Contract Version' }),
    );
    await waitFor(() => expect(complete).toBeTypeOf('function'));
    rerender(
      <InterfaceLocaleProvider>
        <ContractPanel {...props} opportunityId="opportunity-two" />
      </InterfaceLocaleProvider>,
    );
    await waitFor(() =>
      expect(
        screen.getByLabelText('Revised special conditions'),
      ).not.toHaveValue('Old context edit'),
    );
    await act(async () => complete?.(response({}, 500)));
    expect(
      screen.queryByText(
        'The revision result is uncertain. Retry the identical version command.',
      ),
    ).not.toBeInTheDocument();
    expect(screen.getByLabelText('Revised special conditions')).toBeEnabled();
  });
  it.each([
    { status: 403, code: 'FORBIDDEN', message: 'denied' },
    { status: 404, code: 'NOT_FOUND', message: 'unavailable' },
    { status: 409, code: 'STALE_CONTRACT_REVISION', message: 'stale' },
    { status: 409, code: 'CONTRACT_EXECUTED', message: 'executed' },
    { status: 409, code: 'IDEMPOTENCY_CONFLICT', message: 'conflict' },
  ] as const)(
    'C6 presents safe $code without an uncertain retry',
    async ({ status, code, message }) => {
      window.localStorage.setItem(interfaceLocaleStorageKey, 'en');
      const current = actor(true);
      const original = fixture();
      vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) =>
        input.toString().includes('/access/current-actor')
          ? response(current)
          : init?.method === 'POST'
            ? response({ code }, status)
            : input.toString().endsWith('/versions')
              ? response({ items: [original.version], nextCursor: null })
              : response({ contract: original }),
      );
      render(
        <InterfaceLocaleProvider>
          <ContractPanel
            actor={current}
            identity={identity}
            opportunityId="opportunity-one"
            onCompanyContextRejected={() => undefined}
          />
        </InterfaceLocaleProvider>,
      );
      fireEvent.change(
        await screen.findByLabelText('Revised special conditions'),
        { target: { value: 'Keep entered conditions' } },
      );
      fireEvent.click(
        screen.getByRole('button', { name: 'Create new Contract Version' }),
      );
      await screen.findByText(
        resolveMessage(contractVersionMessages, 'en', message),
      );
      expect(screen.getByLabelText('Revised special conditions')).toHaveValue(
        'Keep entered conditions',
      );
      expect(
        screen.getByRole('button', { name: 'Create new Contract Version' }),
      ).toBeDisabled();
      expect(
        screen.queryByRole('button', {
          name: 'Retry identical version command',
        }),
      ).not.toBeInTheDocument();
    },
  );
  it.each(['candidates', 'link'] as const)(
    'discards a late Project %s response after Company changes',
    async (stage) => {
      window.localStorage.setItem(interfaceLocaleStorageKey, 'en');
      let complete: ((response: Response) => void) | undefined;
      const candidateResponse = () =>
        response({ items: [candidateUiFixture()] });
      const fetch = vi
        .spyOn(globalThis, 'fetch')
        .mockImplementation(async (input) => {
          const path = input.toString();
          if (
            (stage === 'candidates' && path.endsWith('/project-candidates')) ||
            (stage === 'link' && path.endsWith('/projects'))
          )
            return new Promise<Response>((resolve) => {
              complete = resolve;
            });
          if (path.endsWith('/project-candidates')) return candidateResponse();
          return response({ contract: executedUiFixture() });
        });
      const props = {
        identity,
        opportunityId: 'opportunity-one',
        onCompanyContextRejected: () => undefined,
      };
      const { rerender } = render(
        <InterfaceLocaleProvider>
          <ContractPanel {...props} actor={projectActor()} />
        </InterfaceLocaleProvider>,
      );
      if (stage === 'link') {
        fireEvent.click(
          await screen.findByRole('radio', { name: /Existing Project/ }),
        );
        fireEvent.click(
          screen.getByRole('button', { name: 'Link selected Project' }),
        );
      }
      await waitFor(() => expect(complete).toBeDefined());
      const changed = projectActor();
      if (!changed.activeCompany) throw new Error('Missing Company');
      changed.activeCompany.id = 'company-two';
      fetch.mockResolvedValue(response({ contract: null }));
      rerender(
        <InterfaceLocaleProvider>
          <ContractPanel {...props} actor={changed} />
        </InterfaceLocaleProvider>,
      );
      await act(async () =>
        complete?.(
          stage === 'candidates'
            ? candidateResponse()
            : response(
                {
                  id: 'link-one',
                  contractId: 'contract-one',
                  projectId: 'project-one',
                  revision: 4,
                  created: false,
                  actorWorkspaceMembershipId: 'member-one',
                  linkedAt: '2026-10-07T10:00:00.000Z',
                },
                201,
              ),
        ),
      );
      expect(
        screen.queryByRole('radio', { name: /Existing Project/ }),
      ).not.toBeInTheDocument();
      expect(screen.queryByText('Project linked.')).not.toBeInTheDocument();
    },
  );
  it('selects an existing Project and preserves the exact uncertain link retry', async () => {
    window.localStorage.setItem(interfaceLocaleStorageKey, 'en');
    const current = actor(true);
    if (!current.activeCompany) throw new Error('Missing Company');
    current.activeCompany.contractPermissions?.push(
      'commercial.contract.project.link',
    );
    current.activeCompany.projectPermissions = [
      'project.read',
      'project.create',
    ];
    const approved = approvedUiFixture();
    const executed = {
      ...approved,
      revision: 3,
      linkedProjects: [],
      version: {
        ...approved.version,
        executionState: 'EXECUTED',
        signature: {
          id: 'signature-one',
          contractVersionId: 'version-one',
          revision: 3,
          evidenceKind: 'SIMULATED',
          provenance: 'ILLUSTRATIVE',
          provisional: true,
          actorWorkspaceMembershipId: 'member-one',
          recordedAt: '2026-10-07T09:00:00.000Z',
          providerSignatoryLabel: 'Provider declaration',
          clientSignatoryLabel: 'Client declaration',
          providerSignedOn: '2026-10-07',
          clientSignedOn: '2026-10-07',
          note: null,
          qualityRun: qualityRun(),
          acknowledgedWarningCodes: [],
          representationChecksum: '1'.repeat(64),
        },
      },
    };
    const sent: Array<{ body: unknown; key: string | null }> = [];
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      if (input.toString().endsWith('/project-candidates'))
        return response({
          items: [
            {
              id: 'project-one',
              title: 'Existing synthetic Project',
              status: 'preparatory',
              createdAt: '2026-10-01T09:00:00.000Z',
              alreadyLinked: false,
              otherContracts: [],
            },
          ],
        });
      if (input.toString().endsWith('/projects')) {
        sent.push({
          body: init?.body,
          key: new Headers(init?.headers).get('idempotency-key'),
        });
        if (sent.length === 1)
          throw new Error('Synthetic lost acknowledgement');
        return response(
          {
            id: 'link-one',
            contractId: 'contract-one',
            projectId: 'project-one',
            revision: 4,
            created: false,
            actorWorkspaceMembershipId: 'member-one',
            linkedAt: '2026-10-07T10:00:00.000Z',
          },
          201,
        );
      }
      return response({ contract: executed });
    });
    render(
      <InterfaceLocaleProvider>
        <ContractPanel
          actor={current}
          identity={identity}
          opportunityId="opportunity-one"
          onCompanyContextRejected={() => undefined}
        />
      </InterfaceLocaleProvider>,
    );
    fireEvent.click(
      await screen.findByRole('radio', { name: /Existing synthetic Project/ }),
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'Link selected Project' }),
    );
    const retry = await screen.findByRole('button', {
      name: 'Retry the same Project link',
    });
    expect(
      screen.getByRole('radio', { name: /Existing synthetic Project/ }),
    ).toBeDisabled();
    fireEvent.click(retry);
    expect(await screen.findByText('Project linked.')).toBeInTheDocument();
    expect(sent).toHaveLength(2);
    expect(sent[1]).toEqual(sent[0]);
    expect(sent[0]?.body).toBe(
      JSON.stringify({ projectId: 'project-one', expectedContractRevision: 3 }),
    );
  });
  it('requires signature message coverage in every offered locale', () => {
    expect(() =>
      assertMessageCoverage('contractSignature', contractSignatureMessages),
    ).not.toThrow();
  });
  it.each(interfaceLocales)(
    'localizes Project candidates and navigation in %s',
    async (locale) => {
      window.localStorage.setItem(interfaceLocaleStorageKey, locale);
      const copy = (key: (typeof contractProjectsMessages.keys)[number]) =>
        resolveMessage(contractProjectsMessages, locale, key);
      const open = vi.fn();
      const createdAt = '2026-10-01T09:00:00.000Z';
      vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) =>
        input.toString().includes('/contracts/projects/')
          ? response({
              items: [
                {
                  id: 'contract-one',
                  opportunityId: 'opportunity-one',
                  clientRequestId: 'request-one',
                  illustrativeReference: 4,
                  kind: 'CONTRACT',
                  provisional: true,
                  linkedAt: createdAt,
                },
              ],
            })
          : input.toString().endsWith('/project-candidates')
            ? response({
                items: [
                  {
                    id: 'project-one',
                    title: 'Existing Project',
                    status: 'preparatory',
                    createdAt,
                    alreadyLinked: true,
                    otherContracts: [
                      {
                        id: 'contract-other',
                        opportunityId: 'opportunity-other',
                        clientRequestId: 'request-other',
                        illustrativeReference: 9,
                        kind: 'CONTRACT',
                        provisional: true,
                        linkedAt: createdAt,
                      },
                    ],
                  },
                ],
              })
            : response({ contract: executedUiFixture() }),
      );
      render(
        <InterfaceLocaleProvider>
          <ContractPanel
            actor={projectActor()}
            identity={identity}
            opportunityId="opportunity-one"
            onCompanyContextRejected={() => undefined}
          />
          <ProjectContracts
            actor={projectActor()}
            identity={identity}
            projectId="project-one"
            onOpenContract={open}
          />
        </InterfaceLocaleProvider>,
      );
      const choice = await screen.findByRole('radio', {
        name: /Existing Project/,
      });
      expect(choice).toBeDisabled();
      expect(choice).toHaveAccessibleName(new RegExp(copy('alreadyLinked')));
      const navigation = await screen.findByRole('button', {
        name: copy('openContract'),
      });
      const dates = document.querySelectorAll(
        'time[datetime="' + createdAt + '"]',
      );
      expect(dates).toHaveLength(2);
      expect(dates[0]?.textContent).toEqual(dates[1]?.textContent);
      expect(dates[0]?.textContent).toBe(
        new Intl.DateTimeFormat(locale, {
          dateStyle: 'medium',
          timeStyle: 'short',
        }).format(new Date(createdAt)),
      );
      fireEvent.click(navigation);
      expect(open).toHaveBeenCalledWith('request-one');
      expect(() =>
        assertMessageCoverage('contractProjects', contractProjectsMessages),
      ).not.toThrow();
    },
  );
  it.each([
    {
      status: 400,
      code: 'INVALID_CONTRACT_INPUT',
      message: 'Select one eligible Project and check the request.',
    },
    {
      status: 403,
      code: 'FORBIDDEN',
      message: 'Project linking access is unavailable.',
    },
    {
      status: 404,
      code: 'NOT_FOUND',
      message: 'The selected Project or Contract is unavailable.',
    },
    {
      status: 409,
      code: 'STALE_CONTRACT_REVISION',
      message: 'The Contract changed. Reload before linking.',
    },
    {
      status: 409,
      code: 'PROJECT_NOT_ELIGIBLE',
      message: 'This Project is no longer eligible. Reload the candidates.',
    },
    {
      status: 409,
      code: 'CONTRACT_PROJECT_ALREADY_LINKED',
      message: 'This Project is already linked. Reload the relationship.',
    },
    {
      status: 409,
      code: 'CONTRACT_PROJECT_LINK_CAPACITY_EXCEEDED',
      message: 'This Contract already has 50 linked Projects.',
    },
    {
      status: 409,
      code: 'IDEMPOTENCY_CONFLICT',
      message:
        'The request conflicts with an earlier command. Reload before linking.',
    },
  ])(
    'presents safe Project link refusal $code without an uncertain retry',
    async ({ status, code, message }) => {
      window.localStorage.setItem(interfaceLocaleStorageKey, 'en');
      vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) =>
        input.toString().includes('/access/current-actor')
          ? response(projectActor())
          : input.toString().endsWith('/projects')
            ? response({ code }, status)
            : input.toString().endsWith('/project-candidates')
              ? response({ items: [candidateUiFixture()] })
              : response({ contract: executedUiFixture() }),
      );
      render(
        <InterfaceLocaleProvider>
          <ContractPanel
            actor={projectActor()}
            identity={identity}
            opportunityId="opportunity-one"
            onCompanyContextRejected={() => undefined}
          />
        </InterfaceLocaleProvider>,
      );
      fireEvent.click(
        await screen.findByRole('radio', { name: /Existing Project/ }),
      );
      fireEvent.click(
        screen.getByRole('button', { name: 'Link selected Project' }),
      );
      expect(await screen.findByText(message)).toBeInTheDocument();
      expect(
        screen.queryByRole('button', { name: 'Retry the same Project link' }),
      ).not.toBeInTheDocument();
    },
  );
  it('hides linked Contract identities when authority changes and ignores the old Project response', async () => {
    window.localStorage.setItem(interfaceLocaleStorageKey, 'en');
    let complete: ((response: Response) => void) | undefined;
    const fetch = vi.spyOn(globalThis, 'fetch').mockImplementation(
      () =>
        new Promise<Response>((resolve) => {
          complete = resolve;
        }),
    );
    const { rerender } = render(
      <InterfaceLocaleProvider>
        <ProjectContracts
          actor={projectActor()}
          identity={identity}
          projectId="project-one"
        />
      </InterfaceLocaleProvider>,
    );
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    const denied = projectActor();
    if (!denied.activeCompany) throw new Error('Missing Company');
    denied.activeCompany.contractPermissions = [];
    rerender(
      <InterfaceLocaleProvider>
        <ProjectContracts
          actor={denied}
          identity={identity}
          projectId="project-one"
        />
      </InterfaceLocaleProvider>,
    );
    await act(async () =>
      complete?.(
        response({
          items: [
            {
              id: 'hidden-contract',
              opportunityId: 'hidden-opportunity',
              clientRequestId: 'hidden-request',
              illustrativeReference: 999,
              kind: 'CONTRACT',
              provisional: true,
              linkedAt: '2026-10-01T09:00:00.000Z',
            },
          ],
        }),
      ),
    );
    expect(screen.queryByText(/999/)).not.toBeInTheDocument();
    expect(
      screen.queryByRole('region', { name: 'Linked Contracts' }),
    ).not.toBeInTheDocument();
  });
  it('shows an explicit empty Project selection without offering a link command', async () => {
    window.localStorage.setItem(interfaceLocaleStorageKey, 'en');
    const fetch = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(async (input) =>
        input.toString().endsWith('/project-candidates')
          ? response({ items: [] })
          : response({ contract: executedUiFixture() }),
      );
    render(
      <InterfaceLocaleProvider>
        <ContractPanel
          actor={projectActor()}
          identity={identity}
          opportunityId="opportunity-one"
          onCompanyContextRejected={() => undefined}
        />
      </InterfaceLocaleProvider>,
    );
    expect(
      await screen.findByText('No eligible existing Project is available.'),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Link selected Project' }),
    ).not.toBeInTheDocument();
    expect(fetch.mock.calls.some((call) => call[1]?.method === 'POST')).toBe(
      false,
    );
  });
  it.each([
    {
      locale: 'ro',
      descriptions: [
        'Identitatea înregistrată corespunde sursei',
        'Identitatea înregistrată corespunde identității actuale',
        'Termenii și condițiile adăugate necesită confirmare',
        'Termenul final nu a trecut (UTC)',
      ],
    },
    {
      locale: 'ru',
      descriptions: [
        'Записанные данные соответствуют источнику',
        'Записанные данные соответствуют текущим данным',
        'Добавленные условия требуют подтверждения',
        'Дата окончания не прошла (UTC)',
      ],
    },
    {
      locale: 'fr',
      descriptions: [
        'L’identité enregistrée correspond à la source',
        'L’identité enregistrée correspond à l’identité actuelle',
        'Les conditions ajoutées doivent être confirmées',
        'La date de fin n’est pas passée (UTC)',
      ],
    },
    {
      locale: 'en',
      descriptions: [
        'Recorded identity matches the source',
        'Recorded identity matches current identity',
        'Added terms and conditions need confirmation',
        'Term end has not passed (UTC)',
      ],
    },
  ] as const)(
    'localizes fresh signature warning descriptions in $locale',
    async ({ locale, descriptions }) => {
      window.localStorage.setItem(interfaceLocaleStorageKey, locale);
      const approved = approvedUiFixture();
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        response({
          contract: {
            ...approved,
            version: {
              ...approved.version,
              termEndsOn: '2026-10-07',
              decision: {
                ...approved.version.decision,
                acknowledgedWarningCodes: [],
                qualityRun: {
                  ...qualityRun(),
                  results: [
                    ...qualityRun()
                      .results.slice(0, -1)
                      .map((item) => ({ ...item, status: 'PASS' })),
                    { code: 'TERM_END_NOT_PASSED', status: 'PASS' },
                    { code: 'PROVISIONAL_MARKER_PRESENT', status: 'PASS' },
                  ],
                },
              },
              latestQualityRun: {
                ...qualityRun(),
                id: 'fresh-run',
                results: [
                  ...qualityRun()
                    .results.slice(0, -1)
                    .map((item) => ({
                      ...item,
                      status: [
                        'PARTY_IDENTITY_MATCHES_SOURCE',
                        'PARTY_IDENTITY_CURRENT',
                        'ADDED_CONDITIONS_CONFIRMED',
                      ].includes(item.code)
                        ? 'WARNING'
                        : 'PASS',
                    })),
                  { code: 'TERM_END_NOT_PASSED', status: 'WARNING' },
                  { code: 'PROVISIONAL_MARKER_PRESENT', status: 'PASS' },
                ],
              },
            },
          },
        }),
      );
      render(
        <InterfaceLocaleProvider>
          <ContractPanel
            actor={signatureActor()}
            identity={identity}
            opportunityId="opportunity-one"
            onCompanyContextRejected={() => undefined}
          />
        </InterfaceLocaleProvider>,
      );
      for (const description of descriptions)
        expect(
          await screen.findByRole('checkbox', {
            name:
              resolveMessage(contractSignatureMessages, locale, 'acknowledge') +
              ': ' +
              description,
          }),
        ).toBeVisible();
    },
  );
  it.each([
    { locale: 'ro', provider: '1 ian. 1', client: '31 dec. 2026' },
    { locale: 'ru', provider: '1 янв. 1 г.', client: '31 дек. 2026 г.' },
    { locale: 'fr', provider: '1 janv. 1', client: '31 déc. 2026' },
    { locale: 'en', provider: 'Jan 1, 1', client: 'Dec 31, 2026' },
  ] as const)(
    'localizes declared calendar dates without shifting their UTC day in $locale',
    async ({ locale, provider, client }) => {
      vi.stubEnv('TZ', 'America/Los_Angeles');
      window.localStorage.setItem(interfaceLocaleStorageKey, locale);
      const approved = approvedUiFixture();
      const approval = {
        ...approved.version.decision,
        decidedAt: '0001-01-01T00:00:00.000Z',
        qualityRun: {
          ...qualityRun(),
          evaluatedAt: '0001-01-01T00:00:00.000Z',
        },
      };
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        response({
          contract: {
            ...approved,
            revision: 3,
            version: {
              ...approved.version,
              decision: approval,
              executionState: 'EXECUTED',
              signature: {
                id: 'signature-one',
                contractVersionId: 'version-one',
                revision: 3,
                evidenceKind: 'SIMULATED',
                provenance: 'ILLUSTRATIVE',
                provisional: true,
                actorWorkspaceMembershipId: 'member-one',
                recordedAt: '2027-01-01T00:00:00.000Z',
                providerSignatoryLabel: 'Provider declaration',
                clientSignatoryLabel: 'Client declaration',
                providerSignedOn: '0001-01-01',
                clientSignedOn: '2026-12-31',
                note: null,
                qualityRun: {
                  ...qualityRun(),
                  evaluatedAt: '2027-01-01T00:00:00.000Z',
                },
                acknowledgedWarningCodes: [],
                representationChecksum: '1'.repeat(64),
              },
            },
          },
        }),
      );
      render(
        <InterfaceLocaleProvider>
          <ContractPanel
            actor={signatureActor()}
            identity={identity}
            opportunityId="opportunity-one"
            onCompanyContextRejected={() => undefined}
          />
        </InterfaceLocaleProvider>,
      );
      const panel = await screen.findByRole('region', {
        name: resolveMessage(contractSignatureMessages, locale, 'title'),
      });
      expect(await within(panel).findByText(provider)).toHaveAttribute(
        'datetime',
        '0001-01-01',
      );
      expect(within(panel).getByText(client)).toHaveAttribute(
        'datetime',
        '2026-12-31',
      );
    },
  );
  it('preserves entered signature fields and the identical uncertain command across all locale switches', async () => {
    window.localStorage.setItem(interfaceLocaleStorageKey, 'en');
    const commands: Array<{ body: unknown; key: string | null }> = [];
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (_input, init) => {
      if (init?.method === 'POST') {
        commands.push({
          body: init.body,
          key: new Headers(init.headers).get('idempotency-key'),
        });
        return response({}, 500);
      }
      return response({ contract: approvedUiFixture() });
    });
    render(
      <InterfaceLocaleProvider>
        <SignatureLocaleChoices />
        <ContractPanel
          actor={signatureActor()}
          identity={identity}
          opportunityId="opportunity-one"
          onCompanyContextRejected={() => undefined}
        />
      </InterfaceLocaleProvider>,
    );
    await fillSignatureFields();
    for (const locale of interfaceLocales) {
      fireEvent.click(screen.getByRole('button', { name: 'Choose ' + locale }));
      expect(
        screen.getByLabelText(
          resolveMessage(contractSignatureMessages, locale, 'provider'),
        ),
      ).toHaveValue('Provider declaration');
      expect(
        screen.getByLabelText(
          resolveMessage(contractSignatureMessages, locale, 'client'),
        ),
      ).toHaveValue('Client declaration');
      expect(
        screen.getByLabelText(
          resolveMessage(contractSignatureMessages, locale, 'providerDate'),
        ),
      ).toHaveValue('2026-10-07');
      expect(
        screen.getByLabelText(
          resolveMessage(contractSignatureMessages, locale, 'clientDate'),
        ),
      ).toHaveValue('2026-10-07');
      expect(
        screen.getByLabelText(
          resolveMessage(contractSignatureMessages, locale, 'note'),
        ),
      ).toHaveValue('Declared note');
    }
    fireEvent.click(
      screen.getByRole('button', {
        name: resolveMessage(contractSignatureMessages, 'en', 'record'),
      }),
    );
    await screen.findByText(
      resolveMessage(contractSignatureMessages, 'en', 'uncertain'),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Choose fr' }));
    fireEvent.click(
      screen.getByRole('button', {
        name: resolveMessage(contractSignatureMessages, 'fr', 'retry'),
      }),
    );
    await waitFor(() => expect(commands).toHaveLength(2));
    expect(commands[1]).toEqual(commands[0]);
  });
  it.each(interfaceLocales)(
    'localizes both declared signature parties and the recording action in %s',
    async (locale) => {
      window.localStorage.setItem(interfaceLocaleStorageKey, locale);
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        response({ contract: approvedUiFixture() }),
      );
      render(
        <InterfaceLocaleProvider>
          <ContractPanel
            actor={signatureActor()}
            identity={identity}
            opportunityId="opportunity-one"
            onCompanyContextRejected={() => undefined}
          />
        </InterfaceLocaleProvider>,
      );
      expect(
        await screen.findByLabelText(
          resolveMessage(contractSignatureMessages, locale, 'provider'),
        ),
      ).toBeVisible();
      expect(
        screen.getByLabelText(
          resolveMessage(contractSignatureMessages, locale, 'client'),
        ),
      ).toBeVisible();
      expect(
        screen.getByRole('button', {
          name: resolveMessage(contractSignatureMessages, locale, 'record'),
        }),
      ).toBeVisible();
    },
  );
  it.each([
    { code: 'QUALITY_CHECK_ERRORS', key: 'errors', terminal: false },
    {
      code: 'QUALITY_CHECK_WARNINGS_UNACKNOWLEDGED',
      key: 'warnings',
      terminal: false,
    },
    { code: 'STALE_CONTRACT_REVISION', key: 'stale', terminal: true },
    {
      code: 'CONTRACT_VERSION_ALREADY_EXECUTED',
      key: 'already',
      terminal: true,
    },
    {
      code: 'CONTRACT_VERSION_NOT_APPROVED',
      key: 'notApproved',
      terminal: true,
    },
    { code: 'REPRESENTATION_MISMATCH', key: 'mismatch', terminal: true },
    { code: 'INVALID_CONTRACT_INPUT', key: 'invalid', terminal: false },
  ] as const)(
    'preserves declared signature fields after $code and blocks only terminal outcomes',
    async ({ code, key, terminal }) => {
      window.localStorage.setItem(interfaceLocaleStorageKey, 'en');
      vi.spyOn(globalThis, 'fetch').mockImplementation(async (_input, init) =>
        init?.method === 'POST'
          ? response(
              { code, field: 'providerSignedOn' },
              key === 'invalid' ? 400 : 409,
            )
          : response({ contract: approvedUiFixture() }),
      );
      render(
        <InterfaceLocaleProvider>
          <ContractPanel
            actor={signatureActor()}
            identity={identity}
            opportunityId="opportunity-one"
            onCompanyContextRejected={() => undefined}
          />
        </InterfaceLocaleProvider>,
      );
      await fillSignatureFields();
      fireEvent.click(
        screen.getByRole('button', {
          name: 'Record both simulated signatures',
        }),
      );
      expect(
        await screen.findByText(
          resolveMessage(contractSignatureMessages, 'en', key),
        ),
      ).toBeVisible();
      expect(screen.getByLabelText('Provider signatory label')).toHaveValue(
        'Provider declaration',
      );
      expect(screen.getByLabelText('Client signatory label')).toHaveValue(
        'Client declaration',
      );
      expect(screen.getByLabelText('Signature note')).toHaveValue(
        'Declared note',
      );
      const action = screen.getByRole('button', {
        name: 'Record both simulated signatures',
      });
      if (terminal) expect(action).toBeDisabled();
      else expect(action).toBeEnabled();
    },
  );
  it('invalidates an in-flight signature after a Company change and suppresses its late result', async () => {
    window.localStorage.setItem(interfaceLocaleStorageKey, 'en');
    let finish: ((value: Response) => void) | undefined;
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (_input, init) =>
      init?.method === 'POST'
        ? new Promise<Response>((resolve) => {
            finish = resolve;
          })
        : response({ contract: approvedUiFixture() }),
    );
    const current = signatureActor();
    const mounted = render(
      <InterfaceLocaleProvider>
        <ContractPanel
          actor={current}
          identity={identity}
          opportunityId="opportunity-one"
          onCompanyContextRejected={() => undefined}
        />
      </InterfaceLocaleProvider>,
    );
    await fillSignatureFields();
    fireEvent.click(
      screen.getByRole('button', { name: 'Record both simulated signatures' }),
    );
    await waitFor(() => expect(finish).toBeDefined());
    mounted.rerender(
      <InterfaceLocaleProvider>
        <ContractPanel
          actor={{
            ...current,
            activeCompany: current.activeCompany
              ? { ...current.activeCompany, id: 'another-company' }
              : undefined,
          }}
          identity={identity}
          opportunityId="opportunity-one"
          onCompanyContextRejected={() => undefined}
        />
      </InterfaceLocaleProvider>,
    );
    await act(async () => {
      if (!finish) throw new Error('Missing delayed command');
      finish(response({ id: 'late-hidden-signature' }, 201));
    });
    expect(screen.queryByText('Provider declaration')).not.toBeInTheDocument();
    expect(
      screen.queryByText('Both simulated signatures recorded.'),
    ).not.toBeInTheDocument();
  });
  it('preserves the entire uncertain simulated signature for explicit identical retry and shows both declarations', async () => {
    window.localStorage.setItem(interfaceLocaleStorageKey, 'en');
    const current = actor(false);
    if (!current.activeCompany) throw new Error('Missing Company');
    current.activeCompany.contractPermissions = [
      'commercial.contract.read',
      'commercial.contract.approve',
      'commercial.contract.signature.record',
    ];
    current.activeCompany.contractApproverAssignmentId = 'approver-one';
    current.activeCompany.contractApproverPermissionSetVersion = 'v1';
    const approval = {
      id: 'approval-one',
      contractVersionId: 'version-one',
      revision: 2,
      kind: 'APPROVE',
      actorWorkspaceMembershipId: 'member-one',
      decidedAt: '2026-10-07T09:00:00.000Z',
      qualityRun: qualityRun(),
      acknowledgedWarningCodes: ['ADDED_CONDITIONS_CONFIRMED'],
      representationChecksum: '1'.repeat(64),
    };
    const commands: Array<{ body: unknown; key: string | null }> = [];
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      if (input.toString().endsWith('/signature')) {
        commands.push({
          body: init?.body,
          key: new Headers(init?.headers).get('idempotency-key'),
        });
        if (commands.length === 1) return response({}, 500);
        return response(
          {
            id: 'signature-one',
            contractVersionId: 'version-one',
            revision: 3,
            evidenceKind: 'SIMULATED',
            provenance: 'ILLUSTRATIVE',
            provisional: true,
            actorWorkspaceMembershipId: 'member-one',
            recordedAt: '2026-10-08T10:00:00.000Z',
            providerSignatoryLabel: '  Provider É  ',
            clientSignatoryLabel: 'Client 🙂',
            providerSignedOn: '2026-10-07',
            clientSignedOn: '2026-10-08',
            note: 'Declared only',
            qualityRun: {
              ...qualityRun(),
              id: 'signature-run',
              evaluatedAt: '2026-10-08T10:00:00.000Z',
            },
            acknowledgedWarningCodes: [],
            representationChecksum: '1'.repeat(64),
          },
          201,
        );
      }
      const stored = fixture();
      return response({
        contract: {
          ...stored,
          revision: 2,
          version: {
            ...stored.version,
            decisionState: 'APPROVED',
            decision: approval,
            latestQualityRun: qualityRun(),
          },
        },
      });
    });
    render(
      <InterfaceLocaleProvider>
        <ContractPanel
          actor={current}
          identity={identity}
          opportunityId="opportunity-one"
          onCompanyContextRejected={() => undefined}
        />
      </InterfaceLocaleProvider>,
    );
    fireEvent.change(await screen.findByLabelText('Provider signatory label'), {
      target: { value: '  Provider É  ' },
    });
    fireEvent.change(screen.getByLabelText('Client signatory label'), {
      target: { value: 'Client 🙂' },
    });
    fireEvent.change(screen.getByLabelText('Provider signing date'), {
      target: { value: '2026-10-07' },
    });
    fireEvent.change(screen.getByLabelText('Client signing date'), {
      target: { value: '2026-10-08' },
    });
    fireEvent.change(screen.getByLabelText('Signature note'), {
      target: { value: 'Declared only' },
    });
    fireEvent.click(
      screen.getByRole('button', { name: 'Record both simulated signatures' }),
    );
    fireEvent.click(
      await screen.findByRole('button', {
        name: 'Retry the same simulated signature',
      }),
    );
    const signatures = screen.getByRole('region', {
      name: 'Simulated Contract signatures',
    });
    expect(
      await within(signatures).findByText('Executed — simulated evidence only'),
    ).toBeVisible();
    expect(
      within(signatures).getByText('Provider É', { exact: true }),
    ).toBeVisible();
    expect(screen.getByText('Client 🙂')).toBeVisible();
    expect(commands).toHaveLength(2);
    expect(commands[1]).toEqual(commands[0]);
    expect(
      screen.queryByRole('button', {
        name: 'Record both simulated signatures',
      }),
    ).not.toBeInTheDocument();
  });
  it.each([false, true])(
    'shows the committed approval checks immediately with prior run %s and keeps reopened history',
    async (hasPriorRun) => {
      const current = actor(false);
      if (!current.activeCompany) throw new Error('Missing Company');
      current.activeCompany.contractPermissions = [
        'commercial.contract.read',
        'commercial.contract.approve',
      ];
      const historical = qualityRun();
      const committed = {
        ...historical,
        id: 'approval-run',
        evaluatedAt: '2026-10-07T10:00:00.000Z',
        actorWorkspaceMembershipId: 'approval-member',
        results: historical.results.map((item) => ({
          ...item,
          status: 'PASS',
        })),
      };
      vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
        const path = input.toString();
        if (path.endsWith('/approve'))
          return response(
            {
              id: 'decision-one',
              contractVersionId: 'version-one',
              revision: 2,
              actorWorkspaceMembershipId: committed.actorWorkspaceMembershipId,
              decidedAt: committed.evaluatedAt,
              kind: 'APPROVE',
              qualityRun: committed,
              acknowledgedWarningCodes: [],
              representationChecksum: '1'.repeat(64),
            },
            201,
          );
        if (path.endsWith('/quality-checks'))
          return response({ items: [historical], nextCursor: null });
        if (path.endsWith('/quality-checks/run-one'))
          return response(historical);
        const stored = fixture();
        return response({
          contract: {
            ...stored,
            version: {
              ...stored.version,
              latestQualityRun: hasPriorRun ? historical : null,
            },
          },
        });
      });
      render(
        <ContractPanel
          actor={current}
          identity={identity}
          opportunityId="opportunity-one"
          onCompanyContextRejected={() => undefined}
        />,
      );
      fireEvent.click(
        await screen.findByRole('button', {
          name: resolveMessage(contractDecisionMessages, 'ro', 'approve'),
        }),
      );
      await screen.findByText('1'.repeat(64));
      const checks = within(
        screen.getByRole('region', { name: 'Contract Quality Checks' }),
      );
      expect(
        await checks.findByText(committed.actorWorkspaceMembershipId),
      ).toBeVisible();
      expect(checks.getByText(committed.evaluatedAt)).toBeVisible();
      expect(
        checks.queryByText('No Contract Quality Check run yet.'),
      ).not.toBeInTheDocument();
      const reopenHistory = checks.getByRole('button', {
        name: 'Reopen recorded checks',
      });
      await waitFor(() => expect(reopenHistory).toBeEnabled());
      fireEvent.click(reopenHistory);
      fireEvent.click(
        await checks.findByRole('button', { name: /Reopen run/u }),
      );
      expect(
        await checks.findByText(historical.actorWorkspaceMembershipId),
      ).toBeVisible();
      expect(
        checks.queryByText(committed.actorWorkspaceMembershipId),
      ).not.toBeInTheDocument();
    },
  );
  it.each(interfaceLocales)(
    'formats the new decision instant in %s with UTC preserved',
    async (locale) => {
      const decidedAt = '2026-10-07T23:15:42.000Z';
      window.localStorage.setItem(interfaceLocaleStorageKey, locale);
      const stored = fixture();
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        response({
          contract: {
            ...stored,
            revision: 2,
            version: {
              ...stored.version,
              decisionState: 'REJECTED',
              decision: {
                id: 'decision-one',
                contractVersionId: 'version-one',
                revision: 2,
                actorWorkspaceMembershipId: 'member-one',
                decidedAt,
                kind: 'REJECT',
                reason: 'Synthetic rejection',
              },
            },
          },
        }),
      );
      render(
        <InterfaceLocaleProvider>
          <ContractPanel
            actor={actor(false)}
            identity={identity}
            opportunityId="opportunity-one"
            onCompanyContextRejected={() => undefined}
          />
        </InterfaceLocaleProvider>,
      );
      const expected = new Intl.DateTimeFormat(locale, {
        dateStyle: 'medium',
        timeStyle: 'medium',
        timeZone: 'UTC',
      }).format(new Date(decidedAt));
      expect(await screen.findByText(expected)).toBeVisible();
      expect(
        screen.getByText(
          resolveMessage(contractDecisionMessages, locale, 'instant'),
        ),
      ).toHaveTextContent('UTC');
      expect(screen.queryByText(decidedAt)).not.toBeInTheDocument();
      window.localStorage.removeItem(interfaceLocaleStorageKey);
    },
  );
  it('submits only warnings still displayed after a fresh review', async () => {
    const current = actor(false);
    if (!current.activeCompany) throw new Error('Missing Company');
    current.activeCompany.contractPermissions = [
      'commercial.contract.read',
      'commercial.contract.approve',
    ];
    const freshRun = {
      ...qualityRun(),
      id: 'fresh-run',
      results: qualityRun().results.map((result) => ({
        ...result,
        status: 'PASS',
      })),
    };
    let submitted: BodyInit | null | undefined;
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      if (input.toString().endsWith('/quality-checks'))
        return response(freshRun, 201);
      if (input.toString().endsWith('/approve')) {
        submitted = init?.body;
        return response(
          {
            id: 'decision-one',
            contractVersionId: 'version-one',
            revision: 2,
            actorWorkspaceMembershipId: 'member-one',
            decidedAt: freshRun.evaluatedAt,
            kind: 'APPROVE',
            qualityRun: freshRun,
            acknowledgedWarningCodes: [],
            representationChecksum: '1'.repeat(64),
          },
          201,
        );
      }
      const stored = fixture();
      return response({
        contract: {
          ...stored,
          version: { ...stored.version, latestQualityRun: qualityRun() },
        },
      });
    });
    render(
      <ContractPanel
        actor={current}
        identity={identity}
        opportunityId="opportunity-one"
        onCompanyContextRejected={() => undefined}
      />,
    );
    fireEvent.click(await screen.findByRole('checkbox'));
    fireEvent.click(
      screen.getByRole('button', { name: 'Run Contract Quality Checks' }),
    );
    await waitFor(() =>
      expect(screen.queryByRole('checkbox')).not.toBeInTheDocument(),
    );
    const approve = screen.getByRole('button', {
      name: resolveMessage(contractDecisionMessages, 'ro', 'approve'),
    });
    await waitFor(() => expect(approve).toBeEnabled());
    fireEvent.click(approve);
    expect(await screen.findByText('1'.repeat(64))).toBeInTheDocument();
    expect(submitted).toBe(
      JSON.stringify({
        expectedContractRevision: 1,
        acknowledgedWarningCodes: [],
      }),
    );
  });
  it('keeps a malformed successful decision uncertain and retries the exact submitted intent', async () => {
    const current = actor(false);
    if (!current.activeCompany) throw new Error('Missing Company');
    current.activeCompany.contractPermissions = [
      'commercial.contract.read',
      'commercial.contract.approve',
    ];
    const attempts: Array<{
      body: BodyInit | null | undefined;
      key: string | null;
    }> = [];
    const recorded = {
      id: 'decision-one',
      contractVersionId: 'version-one',
      revision: 2,
      actorWorkspaceMembershipId: 'member-one',
      decidedAt: '2026-10-07T09:00:00.000Z',
      kind: 'REJECT',
      reason: 'Synthetic preserved rejection',
    };
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      if (input.toString().endsWith('/reject')) {
        attempts.push({
          body: init?.body,
          key: new Headers(init?.headers).get('idempotency-key'),
        });
        return response(
          attempts.length === 1
            ? { ...recorded, contractVersionId: 'another-version' }
            : recorded,
          201,
        );
      }
      return response({ contract: fixture() });
    });
    render(
      <ContractPanel
        actor={current}
        identity={identity}
        opportunityId="opportunity-one"
        onCompanyContextRejected={() => undefined}
      />,
    );
    const reason = await screen.findByRole('textbox', {
      name: resolveMessage(contractDecisionMessages, 'ro', 'reason'),
    });
    fireEvent.change(reason, { target: { value: recorded.reason } });
    fireEvent.click(
      screen.getByRole('button', {
        name: resolveMessage(contractDecisionMessages, 'ro', 'reject'),
      }),
    );
    const retry = await screen.findByRole('button', {
      name: resolveMessage(contractDecisionMessages, 'ro', 'retry'),
    });
    expect(reason).toHaveValue(recorded.reason);
    expect(reason).toBeDisabled();
    expect(
      screen.queryByText(
        resolveMessage(contractDecisionMessages, 'ro', 'rejected'),
      ),
    ).not.toBeInTheDocument();
    fireEvent.click(retry);
    expect(
      await screen.findByText(
        resolveMessage(contractDecisionMessages, 'ro', 'rejected'),
      ),
    ).toBeInTheDocument();
    expect(screen.getByText(recorded.reason)).toBeInTheDocument();
    expect(attempts[1]).toEqual(attempts[0]);
  });
  it('discards an in-flight decision when the active Company changes', async () => {
    const current = actor(false);
    if (!current.activeCompany) throw new Error('Missing Company');
    current.activeCompany.contractPermissions = [
      'commercial.contract.read',
      'commercial.contract.approve',
    ];
    let finish: ((response: Response) => void) | undefined;
    let reads = 0;
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      if (input.toString().endsWith('/reject'))
        return new Promise<Response>((resolve) => {
          finish = resolve;
        });
      if (++reads > 1) return new Promise<Response>(() => undefined);
      return response({ contract: fixture() });
    });
    const properties = {
      actor: current,
      identity,
      opportunityId: 'opportunity-one',
      onCompanyContextRejected: () => undefined,
    };
    const view = render(<ContractPanel {...properties} />);
    fireEvent.change(
      await screen.findByRole('textbox', {
        name: resolveMessage(contractDecisionMessages, 'ro', 'reason'),
      }),
      { target: { value: 'Synthetic private reason' } },
    );
    fireEvent.click(
      screen.getByRole('button', {
        name: resolveMessage(contractDecisionMessages, 'ro', 'reject'),
      }),
    );
    await waitFor(() => expect(finish).toBeDefined());
    view.rerender(
      <ContractPanel
        {...properties}
        actor={{
          ...current,
          activeCompany: { ...current.activeCompany, id: 'another-company' },
        }}
      />,
    );
    await act(async () => {
      if (!finish) throw new Error('Missing pending decision');
      finish(
        response(
          {
            id: 'decision-one',
            contractVersionId: 'version-one',
            revision: 2,
            actorWorkspaceMembershipId: 'member-one',
            decidedAt: '2026-10-07T09:00:00.000Z',
            kind: 'REJECT',
            reason: 'Synthetic private reason',
          },
          201,
        ),
      );
    });
    expect(
      screen.queryByText('Synthetic private reason'),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText(
        resolveMessage(contractDecisionMessages, 'ro', 'rejected'),
      ),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', {
        name: resolveMessage(contractDecisionMessages, 'ro', 'retry'),
      }),
    ).not.toBeInTheDocument();
  });
  it('exposes an approver-only decision, preserves an uncertain exact retry and reloads approval evidence', async () => {
    const current = actor(false);
    if (!current.activeCompany) throw new Error('Missing fixture Company');
    current.activeCompany.contractPermissions = [
      'commercial.contract.read',
      'commercial.contract.approve',
      'commercial.contract.signature.record',
    ];
    current.activeCompany.contractPermissionAssignmentId = undefined;
    current.activeCompany.contractPermissionSetVersion = undefined;
    current.activeCompany.contractApproverAssignmentId = 'approver-one';
    current.activeCompany.contractApproverPermissionSetVersion = 'v1';
    const attempts: Array<{
      body: BodyInit | null | undefined;
      key: string | null;
    }> = [];
    const freshRun = {
      ...qualityRun(),
      results: qualityRun().results.map((result) => ({
        ...result,
        status: 'PASS',
      })),
    };
    const approved = {
      id: 'decision-one',
      contractVersionId: 'version-one',
      revision: 2,
      actorWorkspaceMembershipId: 'member-one',
      decidedAt: '2026-10-07T09:00:00.000Z',
      kind: 'APPROVE',
      qualityRun: freshRun,
      acknowledgedWarningCodes: [],
      representationChecksum: '1'.repeat(64),
    };
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      if (input.toString().endsWith('/approve')) {
        attempts.push({
          body: init?.body,
          key: new Headers(init?.headers).get('idempotency-key'),
        });
        if (attempts.length === 1) throw new Error('Lost response');
        return response(approved, 201);
      }
      return response({ contract: fixture() });
    });
    render(
      <ContractPanel
        actor={current}
        identity={identity}
        opportunityId="opportunity-one"
        onCompanyContextRejected={() => undefined}
      />,
    );
    const copy = (key: 'approve' | 'retry' | 'approved') =>
      resolveMessage(contractDecisionMessages, 'ro', key);
    fireEvent.click(
      await screen.findByRole('button', { name: copy('approve') }),
    );
    fireEvent.click(await screen.findByRole('button', { name: copy('retry') }));
    await waitFor(() => expect(attempts).toHaveLength(2));
    expect(attempts[1]).toEqual(attempts[0]);
    expect(attempts[0]?.body).toBe(
      JSON.stringify({
        expectedContractRevision: 1,
        acknowledgedWarningCodes: [],
      }),
    );
    expect(await screen.findByText('1'.repeat(64))).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: copy('approve') }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Create Contract' }),
    ).not.toBeInTheDocument();
  });
  it.each(
    (
      [
        ['QUALITY_CHECK_ERRORS', 'errors'],
        ['QUALITY_CHECK_WARNINGS_UNACKNOWLEDGED', 'warnings'],
        ['STALE_CONTRACT_REVISION', 'stale'],
        ['CONTRACT_VERSION_ALREADY_DECIDED', 'already'],
      ] as const
    ).flatMap(([code, message]) =>
      (['history', 'history error'] as const).map(
        (history) => [code, message, history] as const,
      ),
    ),
  )(
    'preserves reason text on %s (%s) beside %s and disables stale decisions',
    async (code, message, history) => {
      const current = actor(false);
      if (!current.activeCompany) throw new Error('Missing Company');
      current.activeCompany.contractPermissions = [
        'commercial.contract.read',
        'commercial.contract.approve',
      ];
      vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
        const path = input.toString();
        if (path.endsWith('/approve')) return response({ code }, 409);
        if (path.endsWith('/versions'))
          return history === 'history'
            ? response({ items: [fixture().version], nextCursor: null })
            : response({ code: 'SERVICE_UNAVAILABLE' }, 503);
        return response({ contract: fixture() });
      });
      render(
        <ContractPanel
          actor={current}
          identity={identity}
          opportunityId="opportunity-one"
          onCompanyContextRejected={() => undefined}
        />,
      );
      const decision = await screen.findByRole('region', {
        name: resolveMessage(contractDecisionMessages, 'ro', 'title'),
      });
      const approve = await within(decision).findByRole('button', {
        name: resolveMessage(contractDecisionMessages, 'ro', 'approve'),
      });
      const reason = within(decision).getByRole('textbox', {
        name: resolveMessage(contractDecisionMessages, 'ro', 'reason'),
      });
      const historyRegion = screen.getByRole('region', {
        name: resolveMessage(contractVersionMessages, 'ro', 'history'),
      });
      if (history === 'history error')
        expect(
          await within(historyRegion).findByRole('alert'),
        ).toHaveTextContent(
          resolveMessage(contractVersionMessages, 'ro', 'error'),
        );
      else
        expect(
          await within(historyRegion).findByRole('button', {
            name: `${resolveMessage(contractVersionMessages, 'ro', 'version')} 1`,
          }),
        ).toBeInTheDocument();
      fireEvent.change(reason, {
        target: { value: 'Synthetic entered reason' },
      });
      fireEvent.click(approve);
      expect(await within(decision).findByRole('alert')).toHaveTextContent(
        resolveMessage(contractDecisionMessages, 'ro', message),
      );
      expect(within(decision).getAllByRole('alert')).toHaveLength(1);
      expect(within(historyRegion).queryAllByRole('alert')).toHaveLength(
        history === 'history error' ? 1 : 0,
      );
      expect(reason).toHaveValue('Synthetic entered reason');
      if (
        code === 'STALE_CONTRACT_REVISION' ||
        code === 'CONTRACT_VERSION_ALREADY_DECIDED'
      )
        expect(approve).toBeDisabled();
    },
  );

  it.each([
    'opportunity',
    'identity',
    'contract-authority',
    'opportunity-authority',
  ])(
    'hides a currently visible exact document on %s replacement',
    async (replacement) => {
      let calls = 0;
      vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
        if (input.toString().endsWith('/versions'))
          return response({ items: [fixture().version], nextCursor: null });
        calls++;
        if (calls > 2) return new Promise<Response>(() => undefined);
        return response(
          input.toString().endsWith('/representation')
            ? representation()
            : { contract: fixture() },
        );
      });
      const current = actor(false);
      const properties = {
        actor: current,
        identity,
        opportunityId: 'opportunity-one',
        onCompanyContextRejected: () => undefined,
      };
      const view = render(<ContractPanel {...properties} />);
      fireEvent.click(
        await screen.findByRole('button', {
          name: 'Open exact Contract document',
        }),
      );
      expect(
        await screen.findByTitle('Illustrative Contract document'),
      ).toBeInTheDocument();
      view.rerender(
        <ContractPanel
          {...properties}
          opportunityId={
            replacement === 'opportunity'
              ? 'opportunity-two'
              : properties.opportunityId
          }
          identity={
            replacement === 'identity'
              ? deterministicBrowserIdentity({
                  'x-test-external-subject': 'replacement-reader',
                })
              : identity
          }
          actor={
            replacement.endsWith('authority')
              ? {
                  ...current,
                  activeCompany: {
                    ...current.activeCompany,
                    id: 'company-one',
                    displayName: 'Company',
                    ...(replacement === 'contract-authority'
                      ? { contractPermissions: [] }
                      : { commercialIntakePermissions: [] }),
                  },
                }
              : current
          }
        />,
      );
      expect(
        screen.queryByTitle('Illustrative Contract document'),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByText(representation().sha256),
      ).not.toBeInTheDocument();
    },
  );
  it('opens and reloads the exact isolated document with its checksum', async () => {
    const fetch = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(async (input) =>
        response(
          input.toString().endsWith('/representation')
            ? representation()
            : { contract: fixture() },
        ),
      );
    renderEnglishReader();
    fireEvent.click(
      await screen.findByRole('button', {
        name: 'Open exact Contract document',
      }),
    );
    expect(
      await within(documentRegion()).findByText(
        'Pending approval · Not executed',
      ),
    ).toBeVisible();
    const document = screen.getByTitle('Illustrative Contract document');
    expect(document).toHaveAttribute('srcdoc', representation().html);
    expect(document).toHaveAttribute('sandbox', '');
    expect(document).toHaveAttribute('referrerpolicy', 'no-referrer');
    expect(screen.getByText(representation().sha256)).toBeVisible();
    fireEvent.click(
      screen.getByRole('button', { name: 'Reload exact Contract document' }),
    );
    await waitFor(() =>
      expect(
        screen.getByTitle('Illustrative Contract document'),
      ).toHaveAttribute('srcdoc', representation().html),
    );
    expect(
      fetch.mock.calls.filter(([path]) =>
        path.toString().endsWith('/representation'),
      ),
    ).toHaveLength(2);
  });
  it.each([
    {
      state: 'pending',
      contract: fixture,
      label: 'Pending approval · Not executed',
    },
    {
      state: 'rejected',
      contract: rejectedUiFixture,
      label: 'Rejected internally · Not executed',
    },
    {
      state: 'approved',
      contract: approvedUiFixture,
      label: 'Approved internally · Not executed',
    },
    {
      state: 'executed',
      contract: executedUiFixture,
      label: 'Approved internally · Executed — simulated evidence only',
    },
  ])(
    'labels the opened document with its $state version state and unchanged checksum',
    async ({ contract, label, state }) => {
      vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) =>
        response(
          input.toString().endsWith('/representation')
            ? representation()
            : { contract: contract() },
        ),
      );
      renderEnglishReader();
      fireEvent.click(
        await screen.findByRole('button', {
          name: 'Open exact Contract document',
        }),
      );
      const viewer = documentRegion();
      expect(await within(viewer).findByText(label)).toBeVisible();
      expect(within(viewer).getByText(representation().sha256)).toBeVisible();
      expect(
        within(viewer).queryByText(/legally signed/u),
      ).not.toBeInTheDocument();
      if (state === 'pending')
        expect(within(viewer).getByText('Draft — not approved')).toBeVisible();
      else
        expect(
          within(viewer).queryByText('Draft — not approved'),
        ).not.toBeInTheDocument();
      expect(
        screen.getByTitle('Illustrative Contract document'),
      ).toHaveAttribute('srcdoc', representation().html);
    },
  );
  it('labels a reopened superseded version with its own recorded state', async () => {
    const stored = fixture();
    const current = {
      ...stored,
      revision: 3,
      version: {
        ...stored.version,
        id: 'version-two',
        versionNumber: 2,
        createdContractRevision: 3,
        predecessorVersionId: 'version-one',
        differences: [],
      },
    };
    const rejected = rejectedUiFixture();
    const superseded = {
      ...rejected,
      revision: 3,
      version: { ...rejected.version, supersededByVersionId: 'version-two' },
    };
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const path = input.toString();
      if (path.endsWith('/versions'))
        return response({
          items: [
            { id: 'version-two', versionNumber: 2 },
            { id: 'version-one', versionNumber: 1 },
          ],
          nextCursor: null,
        });
      if (path.endsWith('/versions/version-one/representation'))
        return response(representation());
      if (path.endsWith('/versions/version-two/representation'))
        return response({
          ...representation(),
          contractVersionId: 'version-two',
          sha256: '2'.repeat(64),
        });
      if (path.endsWith('/versions/version-one'))
        return response({ contract: superseded });
      return response({ contract: current });
    });
    renderEnglishReader();
    fireEvent.click(
      await screen.findByRole('button', {
        name: 'Open exact Contract document',
      }),
    );
    expect(
      await within(documentRegion()).findByText(
        'Pending approval · Not executed',
      ),
    ).toBeVisible();
    fireEvent.click(
      await screen.findByRole('button', { name: 'Open Contract Version 1' }),
    );
    fireEvent.click(
      await screen.findByRole('button', {
        name: 'Open exact Contract document',
      }),
    );
    const viewer = documentRegion();
    expect(
      await within(viewer).findByText('Rejected internally · Not executed'),
    ).toBeVisible();
    expect(within(viewer).getByText(representation().sha256)).toBeVisible();
    expect(
      within(viewer).queryByText('Pending approval · Not executed'),
    ).not.toBeInTheDocument();
  });
  it('labels the reopened document with the reloaded state of the same version and its unchanged checksum', async () => {
    const reads = [fixture(), approvedUiFixture(), executedUiFixture()];
    let current = 0;
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) =>
      response(
        input.toString().endsWith('/representation')
          ? representation()
          : { contract: reads[current] },
      ),
    );
    renderEnglishReader();
    for (const [index, label] of [
      'Pending approval · Not executed',
      'Approved internally · Not executed',
      'Approved internally · Executed — simulated evidence only',
    ].entries()) {
      if (index > 0) {
        current = index;
        fireEvent.click(
          screen.getByRole('button', { name: 'Reload Contract' }),
        );
      }
      fireEvent.click(
        await screen.findByRole('button', {
          name: 'Open exact Contract document',
        }),
      );
      const viewer = documentRegion();
      expect(await within(viewer).findByText(label)).toBeVisible();
      expect(within(viewer).getByText(representation().sha256)).toBeVisible();
      if (index === 0)
        expect(within(viewer).getByText('Draft — not approved')).toBeVisible();
      else
        expect(
          within(viewer).queryByText('Draft — not approved'),
        ).not.toBeInTheDocument();
      expect(
        screen.getByTitle('Illustrative Contract document'),
      ).toHaveAttribute('srcdoc', representation().html);
    }
  });
  it.each([
    'opportunity',
    'identity',
    'contract-authority',
    'opportunity-authority',
  ])(
    'removes an open document immediately on %s replacement and suppresses late responses',
    async (replacement) => {
      let resolveLate: ((response: Response) => void) | undefined;
      let documentRequests = 0;
      vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
        if (input.toString().endsWith('/representation')) {
          documentRequests++;
          if (documentRequests === 1) return response(representation());
          return new Promise<Response>((resolve) => {
            resolveLate = resolve;
          });
        }
        if (input.toString().includes('opportunity-two'))
          return response({ contract: null });
        return response({ contract: fixture() });
      });
      const current = actor(false);
      const properties = {
        actor: current,
        identity,
        opportunityId: 'opportunity-one',
        onCompanyContextRejected: () => undefined,
      };
      const view = render(<ContractPanel {...properties} />);
      fireEvent.click(
        await screen.findByRole('button', {
          name: 'Open exact Contract document',
        }),
      );
      await screen.findByTitle('Illustrative Contract document');
      fireEvent.click(
        screen.getByRole('button', { name: 'Reload exact Contract document' }),
      );
      await waitFor(() => expect(resolveLate).toBeDefined());
      view.rerender(
        <ContractPanel
          {...properties}
          opportunityId={
            replacement === 'opportunity'
              ? 'opportunity-two'
              : properties.opportunityId
          }
          identity={
            replacement === 'identity'
              ? deterministicBrowserIdentity({
                  'x-test-external-subject': 'replacement-reader',
                })
              : identity
          }
          actor={
            replacement.endsWith('authority')
              ? {
                  ...current,
                  activeCompany: {
                    ...current.activeCompany,
                    id: 'company-one',
                    displayName: 'Company',
                    ...(replacement === 'contract-authority'
                      ? { contractPermissions: [] }
                      : { commercialIntakePermissions: [] }),
                  },
                }
              : current
          }
        />,
      );
      expect(
        screen.queryByTitle('Illustrative Contract document'),
      ).not.toBeInTheDocument();
      resolveLate?.(response(representation()));
      await waitFor(() =>
        expect(
          screen.queryByText(representation().sha256),
        ).not.toBeInTheDocument(),
      );
      expect(
        screen.queryByTitle('Illustrative Contract document'),
      ).not.toBeInTheDocument();
    },
  );
  it.each([
    { contractVersionId: 'other-version' },
    { contractId: 'other-contract' },
    { templateVersion: 2 },
    { clauseVersions: [] },
    { clauseVersions: [{ code: 'CL_GENERAL', version: 1 }] },
    { sha256: 'invalid' },
    { html: '' },
  ])('refuses incompatible exact document responses %j', async (invalid) => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) =>
      response(
        input.toString().endsWith('/representation')
          ? { ...representation(), ...invalid }
          : { contract: fixture() },
      ),
    );
    render(
      <ContractPanel
        actor={actor(false)}
        identity={identity}
        opportunityId="opportunity-one"
        onCompanyContextRejected={() => undefined}
      />,
    );
    fireEvent.click(
      await screen.findByRole('button', {
        name: 'Open exact Contract document',
      }),
    );
    expect(
      await screen.findByText(
        'The exact Contract document could not be loaded. Try again.',
      ),
    ).toBeVisible();
    expect(
      screen.queryByTitle('Illustrative Contract document'),
    ).not.toBeInTheDocument();
  });
  it('reads the recorded Contract without any Offer or live Client read', async () => {
    const fetch = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(response({ contract: fixture() }));
    render(
      <ContractPanel
        actor={actor(false)}
        identity={identity}
        opportunityId="opportunity-one"
        onCompanyContextRejected={() => undefined}
      />,
    );
    expect(await screen.findByText('Synthetic accepted scope')).toBeVisible();
    expect(screen.getByText('Source Offer')).toBeVisible();
    expect(
      screen.getByText('Illustrative reference 7 · version 2'),
    ).toBeVisible();
    expect(screen.getByText(/Synthetic recorded party/u)).toBeVisible();
    expect(
      screen.queryByRole('button', { name: 'Create Contract' }),
    ).not.toBeInTheDocument();
    expect(
      fetch.mock.calls.every(([path]) =>
        path.toString().includes('/contracts/'),
      ),
    ).toBe(true);
  });
  it('retains the exact command and key for an uncertain retry', async () => {
    const bodies: Array<{ body: unknown; key: string | null }> = [];
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      if (init?.method === 'POST') {
        bodies.push({
          body: init.body,
          key: new Headers(init.headers).get('idempotency-key'),
        });
        if (bodies.length === 1) return response({}, 500);
        return response(fixture(), 201);
      }
      if (input.toString().includes('/offers/'))
        return response({
          offer: {
            version: {
              id: 'accepted-version',
              clientResponseState: 'ACCEPTED',
              provenance: 'ILLUSTRATIVE',
              provisional: true,
              decisionState: 'APPROVED',
              supersededByVersionId: null,
            },
          },
        });
      return response({ contract: null });
    });
    render(
      <ContractPanel
        actor={actor(true)}
        identity={identity}
        opportunityId="opportunity-one"
        onCompanyContextRejected={() => undefined}
      />,
    );
    fireEvent.change(await screen.findByLabelText('Special conditions'), {
      target: { value: 'Synthetic added conditions' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Create Contract' }));
    expect(
      await screen.findByText(
        'The result is uncertain. Retry the same Contract command.',
      ),
    ).toBeVisible();
    expect(screen.getByLabelText('Special conditions')).toBeDisabled();
    fireEvent.click(
      screen.getByRole('button', { name: 'Retry the same Contract command' }),
    );
    await screen.findByText('Synthetic accepted scope');
    expect(bodies).toHaveLength(2);
    expect(bodies[1]).toEqual(bodies[0]);
  });
  it('runs without Offer or Client read, preserves uncertain retry and reopens immutable attribution', async () => {
    const commands: Array<{ body: unknown; key: string | null }> = [];
    const run = qualityRun();
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      if (init?.method === 'POST') {
        commands.push({
          body: init.body,
          key: new Headers(init.headers).get('idempotency-key'),
        });
        return commands.length === 1 ? response({}, 500) : response(run, 201);
      }
      if (input.toString().endsWith('/quality-checks'))
        return response({ items: [run], nextCursor: null });
      if (input.toString().endsWith('/quality-checks/run-one'))
        return response(run);
      return response({ contract: fixture() });
    });
    render(
      <ContractPanel
        actor={actor(false)}
        identity={identity}
        opportunityId="opportunity-one"
        onCompanyContextRejected={() => undefined}
      />,
    );
    fireEvent.click(
      await screen.findByRole('button', {
        name: 'Run Contract Quality Checks',
      }),
    );
    const retryQuality = await screen.findByRole('button', {
      name: 'Retry the same Contract Quality Checks',
    });
    expect(
      screen.getByRole('button', { name: 'Reload Contract' }),
    ).toBeDisabled();
    fireEvent.click(retryQuality);
    expect(
      await screen.findByText('Contract checks completed with warnings.'),
    ).toBeVisible();
    expect(commands[1]).toEqual(commands[0]);
    expect(screen.getByText('2026-10-07T09:00:00.000Z')).toBeVisible();
    expect(screen.getByText('member-one')).toBeVisible();
    fireEvent.click(
      screen.getByRole('button', { name: 'Reopen recorded checks' }),
    );
    fireEvent.click(await screen.findByRole('button', { name: /Reopen run/u }));
    expect(
      await screen.findByText('Contract checks completed with warnings.'),
    ).toBeVisible();
    expect(screen.getAllByText('WARNING')).toHaveLength(1);
  });
  it('retires a run after the Company or Contract Version context is replaced', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      response({
        contract: {
          ...fixture(),
          version: { ...fixture().version, latestQualityRun: qualityRun() },
        },
      }),
    );
    const view = render(
      <ContractPanel
        actor={actor(false)}
        identity={identity}
        opportunityId="opportunity-one"
        onCompanyContextRejected={() => undefined}
      />,
    );
    await screen.findByText('member-one');
    view.rerender(
      <ContractPanel
        actor={actor(false)}
        identity={identity}
        opportunityId="opportunity-two"
        onCompanyContextRejected={() => undefined}
      />,
    );
    await waitFor(() =>
      expect(screen.queryByText('member-one')).not.toBeInTheDocument(),
    );
  });
  it('hides Contract content after Contract authority is revoked', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      response({ contract: fixture() }),
    );
    const current = actor(false);
    const view = render(
      <ContractPanel
        actor={current}
        identity={identity}
        opportunityId="opportunity-one"
        onCompanyContextRejected={() => undefined}
      />,
    );
    await screen.findByText('Synthetic accepted scope');
    view.rerender(
      <ContractPanel
        actor={{
          ...current,
          activeCompany: {
            id: 'company-one',
            displayName: 'Company',
            contractPermissions: [],
            commercialIntakePermissions: ['commercial.opportunity.read'],
          },
        }}
        identity={identity}
        opportunityId="opportunity-one"
        onCompanyContextRejected={() => undefined}
      />,
    );
    await waitFor(() =>
      expect(
        screen.queryByText('Synthetic accepted scope'),
      ).not.toBeInTheDocument(),
    );
  });
  describe('adjusted Pricing Snapshots (#561)', () => {
    function renderStored(contract: unknown) {
      vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) =>
        input.toString().includes('/offers/')
          ? acceptedOfferResponse()
          : response({ contract, precontract: null }),
      );
      render(
        <InterfaceLocaleProvider>
          <ContractPanel
            actor={actor(true)}
            identity={identity}
            opportunityId="opportunity-one"
            onCompanyContextRejected={() => undefined}
          />
        </InterfaceLocaleProvider>,
      );
    }
    it.each(interfaceLocales)(
      'labels the bound rule set v2 and its runs in %s',
      async (locale) => {
        window.localStorage.setItem(interfaceLocaleStorageKey, locale);
        renderStored(adjustedFixture());
        const label = await screen.findByText(
          resolveMessage(contractRuleSetMessages, locale, 'ruleSet'),
        );
        expect(label.nextElementSibling).toHaveTextContent(
          'CONTRACT_QUALITY_ILLUSTRATIVE v2',
        );
        expect(
          screen.getByText(
            resolveMessage(contractRuleSetMessages, locale, 'adjustedSnapshot'),
          ),
        ).toBeVisible();
        const checks = screen.getByRole('region', {
          name: 'Contract Quality Checks',
        });
        expect(
          within(checks).getByText('CONTRACT_QUALITY_ILLUSTRATIVE v2'),
        ).toBeVisible();
        expect(screen.getByText(/335\.08 EUR/u)).toBeVisible();
      },
    );
    it('keeps an unadjusted Contract on v1 without the adjusted notice', async () => {
      window.localStorage.setItem(interfaceLocaleStorageKey, 'en');
      renderStored({
        ...fixture(),
        version: { ...fixture().version, latestQualityRun: qualityRun() },
      });
      const label = await screen.findByText('Quality Check rule set');
      expect(label.nextElementSibling).toHaveTextContent(
        'CONTRACT_QUALITY_ILLUSTRATIVE v1',
      );
      expect(
        screen.queryByText(/references an adjusted Pricing Snapshot/u),
      ).not.toBeInTheDocument();
    });
    it('keeps an older v1 run readable on a pending version bound to v2', async () => {
      window.localStorage.setItem(interfaceLocaleStorageKey, 'en');
      const stored = adjustedFixture();
      renderStored({
        ...stored,
        version: { ...stored.version, latestQualityRun: qualityRun() },
      });
      const checks = await screen.findByRole('region', {
        name: 'Contract Quality Checks',
      });
      expect(
        within(checks).getByText('CONTRACT_QUALITY_ILLUSTRATIVE v1'),
      ).toBeVisible();
    });
    it.each([
      [
        'an unadjusted version that claims v2',
        {
          ...fixture(),
          version: { ...fixture().version, qualityRuleSetVersion: 2 },
        },
      ],
      [
        'an adjusted version that claims v1',
        {
          ...adjustedFixture(),
          version: {
            ...adjustedFixture().version,
            qualityRuleSetVersion: 1,
            latestQualityRun: null,
          },
        },
      ],
      [
        'an unknown rule set version',
        {
          ...adjustedFixture(),
          version: { ...adjustedFixture().version, qualityRuleSetVersion: 3 },
        },
      ],
      [
        'a JSON string rule set version',
        {
          ...adjustedFixture(),
          version: { ...adjustedFixture().version, qualityRuleSetVersion: '2' },
        },
      ],
      [
        'a v2 run on a version bound to v1',
        {
          ...fixture(),
          version: {
            ...fixture().version,
            latestQualityRun: { ...qualityRun(), ruleSetVersion: 2 },
          },
        },
      ],
    ])('fails closed for %s', async (_name, contract) => {
      window.localStorage.setItem(interfaceLocaleStorageKey, 'en');
      renderStored(contract);
      expect(
        await screen.findByText('The Contract could not be loaded. Try again.'),
      ).toBeVisible();
      expect(
        screen.queryByText('Synthetic accepted scope'),
      ).not.toBeInTheDocument();
    });
  });
});
function adjustedFixture() {
  const stored = fixture();
  return {
    ...stored,
    version: {
      ...stored.version,
      qualityRuleSetVersion: 2,
      latestQualityRun: { ...qualityRun(), ruleSetVersion: 2 },
      pricingSnapshot: {
        ...stored.version.pricingSnapshot,
        subtotal: '291.37',
        taxTotal: '43.71',
        total: '335.08',
        lines: [
          {
            serviceName: 'Illustrative service',
            quantity: '1',
            lineNet: '300.00',
            lineTax: '45.00',
            adjustment: {
              type: 'FIXED_NET_DISCOUNT',
              netReduction: '8.63',
              taxReduction: '1.29',
              reason: 'Synthetic discount',
              appliedByWorkspaceMembershipId: 'member-one',
              appliedAt: '2026-10-07T08:00:00.000Z',
            },
            adjustedLineNet: '291.37',
            adjustedLineTax: '43.71',
          },
        ],
      },
    },
  };
}
function actor(prepare: boolean): ActorContext {
  return {
    internalUserId: 'user-one',
    workspaceMembershipId: 'member-one',
    workspaceId: 'workspace-one',
    workspaceName: 'Workspace',
    displayName: 'Reader',
    email: 'reader@example.test',
    active: true,
    workspacePermissions: [],
    activeCompany: {
      id: 'company-one',
      displayName: 'Company',
      contractPermissions: [
        'commercial.contract.read',
        'commercial.contract.prepare',
      ],
      contractPermissionAssignmentId: 'contract-assignment',
      contractPermissionSetVersion: 'v1',
      commercialIntakePermissions: ['commercial.opportunity.read'],
      ...(prepare
        ? {
            clientPermissions: ['client.read'],
            offerPermissions: ['commercial.offer.read'],
          }
        : {}),
    },
  };
}
function signatureActor(): ActorContext {
  const result = actor(false);
  if (!result.activeCompany) throw new Error('Missing Company');
  result.activeCompany.contractPermissions = [
    'commercial.contract.read',
    'commercial.contract.approve',
    'commercial.contract.signature.record',
  ];
  result.activeCompany.contractApproverAssignmentId = 'approver-one';
  result.activeCompany.contractApproverPermissionSetVersion = 'v1';
  return result;
}
function projectActor(): ActorContext {
  const result = actor(true);
  if (!result.activeCompany) throw new Error('Missing Company');
  result.activeCompany.contractPermissions?.push(
    'commercial.contract.project.link',
  );
  result.activeCompany.projectPermissions = ['project.read', 'project.create'];
  return result;
}
function candidateUiFixture() {
  return {
    id: 'project-one',
    title: 'Existing Project',
    status: 'preparatory',
    createdAt: '2026-10-01T09:00:00.000Z',
    alreadyLinked: false,
    otherContracts: [],
  };
}
function executedUiFixture() {
  const approved = approvedUiFixture();
  return {
    ...approved,
    revision: 3,
    linkedProjects: [],
    version: {
      ...approved.version,
      executionState: 'EXECUTED',
      signature: {
        id: 'signature-one',
        contractVersionId: 'version-one',
        revision: 3,
        evidenceKind: 'SIMULATED',
        provenance: 'ILLUSTRATIVE',
        provisional: true,
        actorWorkspaceMembershipId: 'member-one',
        recordedAt: '2026-10-07T09:00:00.000Z',
        providerSignatoryLabel: 'Provider declaration',
        clientSignatoryLabel: 'Client declaration',
        providerSignedOn: '2026-10-07',
        clientSignedOn: '2026-10-07',
        note: null,
        qualityRun: qualityRun(),
        acknowledgedWarningCodes: [],
        representationChecksum: '1'.repeat(64),
      },
    },
  };
}
function approvedUiFixture() {
  const stored = fixture();
  return {
    ...stored,
    revision: 2,
    version: {
      ...stored.version,
      decisionState: 'APPROVED',
      latestQualityRun: qualityRun(),
      decision: {
        id: 'approval-one',
        contractVersionId: 'version-one',
        revision: 2,
        kind: 'APPROVE',
        actorWorkspaceMembershipId: 'member-one',
        decidedAt: '2026-10-07T09:00:00.000Z',
        qualityRun: qualityRun(),
        acknowledgedWarningCodes: ['ADDED_CONDITIONS_CONFIRMED'],
        representationChecksum: '1'.repeat(64),
      },
    },
  };
}
function rejectedUiFixture() {
  const stored = fixture();
  return {
    ...stored,
    revision: 2,
    version: {
      ...stored.version,
      decisionState: 'REJECTED',
      decision: {
        id: 'rejection-one',
        contractVersionId: 'version-one',
        revision: 2,
        kind: 'REJECT',
        actorWorkspaceMembershipId: 'member-one',
        decidedAt: '2026-10-07T09:00:00.000Z',
        reason: 'Synthetic rejection',
      },
    },
  };
}
function renderEnglishReader() {
  window.localStorage.setItem(interfaceLocaleStorageKey, 'en');
  return render(
    <InterfaceLocaleProvider>
      <ContractPanel
        actor={actor(false)}
        identity={identity}
        opportunityId="opportunity-one"
        onCompanyContextRejected={() => undefined}
      />
    </InterfaceLocaleProvider>,
  );
}
function documentRegion() {
  return screen.getByRole('region', { name: 'Illustrative Contract document' });
}
async function fillSignatureFields() {
  fireEvent.change(await screen.findByLabelText('Provider signatory label'), {
    target: { value: 'Provider declaration' },
  });
  fireEvent.change(screen.getByLabelText('Client signatory label'), {
    target: { value: 'Client declaration' },
  });
  for (const field of ['Provider signing date', 'Client signing date'])
    fireEvent.change(screen.getByLabelText(field), {
      target: { value: '2026-10-07' },
    });
  fireEvent.change(screen.getByLabelText('Signature note'), {
    target: { value: 'Declared note' },
  });
}
const copyEmpty = 'No Contract has been prepared for this Opportunity.';
function acceptedOfferResponse() {
  return response({
    offer: {
      version: {
        id: 'accepted-version',
        clientResponseState: 'ACCEPTED',
        provenance: 'ILLUSTRATIVE',
        provisional: true,
        decisionState: 'APPROVED',
        supersededByVersionId: null,
      },
    },
  });
}
function precontractUiFixture() {
  const base = fixture();
  return {
    ...base,
    id: 'precontract-one',
    kind: 'PRECONTRACT',
    precontract: null,
    addenda: [],
    linkedProjects: [],
    version: {
      ...base.version,
      termEndsOn: '2026-12-31',
      specialConditions: null,
      preliminaryWork: {
        scope: 'Synthetic preliminary scope',
        financialConditions: 'Synthetic advance',
        limits: 'Synthetic limit',
      },
    },
  };
}
function response(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}
function fixture() {
  return {
    id: 'contract-one',
    companyId: 'company-one',
    opportunityId: 'opportunity-one',
    kind: 'CONTRACT',
    origin: 'ACCEPTED_OFFER',
    sourceOfferId: 'offer-one',
    sourceOfferVersionId: 'accepted-version',
    sourceOffer: { illustrativeReference: 7, versionNumber: 2 },
    revision: 1,
    illustrativeReference: 1,
    provisional: true,
    version: {
      id: 'version-one',
      versionNumber: 1,
      recipient: {
        kind: 'PRIMARY',
        legalName: 'Synthetic recorded party',
        taxId: 'SYNTHETIC',
        legalAddress: 'Example Street',
      },
      qualityRuleSet: 'CONTRACT_QUALITY_ILLUSTRATIVE',
      qualityRuleSetVersion: 1,
      issuingCompanyLabel: 'Company',
      scopeNote: 'Synthetic accepted scope',
      commercialConditions: 'Accepted conditions',
      termStartsOn: null,
      termEndsOn: null,
      specialConditions: 'Synthetic added conditions',
      latestQualityRun: null,
      decisionState: 'PENDING',
      executionState: 'NOT_EXECUTED',
      provenance: 'ILLUSTRATIVE',
      provisional: true,
      pricingSnapshotId: 'snapshot-one',
      pricingSnapshot: {
        id: 'snapshot-one',
        currency: 'EUR',
        subtotal: '300.00',
        taxTotal: '45.00',
        total: '345.00',
        lines: [
          {
            serviceName: 'Illustrative service',
            quantity: '1',
            lineNet: '300.00',
            lineTax: '45.00',
          },
        ],
      },
    },
  };
}
function representation() {
  return {
    contractId: 'contract-one',
    contractVersionId: 'version-one',
    templateCode: 'CONTRACT_ILLUSTRATIVE',
    templateVersion: 1,
    clauseVersions: [
      { code: 'CL_SUBJECT', version: 1 },
      { code: 'CL_PRICE', version: 1 },
      { code: 'CL_TERM', version: 1 },
      { code: 'CL_CONDITIONS', version: 1 },
      { code: 'CL_GENERAL', version: 1 },
    ],
    html: '<!doctype html><html lang="en"><body><p>Illustrative exact document</p></body></html>',
    sha256: '1'.repeat(64),
  };
}

function qualityRun() {
  return {
    id: 'run-one',
    contractVersionId: 'version-one',
    ruleSet: 'CONTRACT_QUALITY_ILLUSTRATIVE',
    ruleSetVersion: 1,
    actorWorkspaceMembershipId: 'member-one',
    evaluatedAt: '2026-10-07T09:00:00.000Z',
    results: [
      { code: 'SOURCE_COMPANY_MATCHES', status: 'PASS' },
      { code: 'PARTY_AVAILABLE', status: 'PASS' },
      { code: 'PARTY_MATCHES_SOURCE', status: 'PASS' },
      { code: 'PARTY_IDENTITY_MATCHES_SOURCE', status: 'PASS' },
      { code: 'PARTY_IDENTITY_CURRENT', status: 'PASS' },
      { code: 'PARTY_TAX_ID_RECORDED', status: 'PASS' },
      { code: 'PRICE_MATCHES_ACCEPTED_OFFER', status: 'PASS' },
      { code: 'PRICING_SNAPSHOT_COHERENT', status: 'PASS' },
      { code: 'CONDITIONS_MATCH_ACCEPTED_OFFER', status: 'PASS' },
      { code: 'ADDED_CONDITIONS_CONFIRMED', status: 'WARNING' },
      { code: 'PROVISIONAL_MARKER_PRESENT', status: 'PASS' },
    ],
  };
}
