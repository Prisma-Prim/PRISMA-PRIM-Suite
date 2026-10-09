import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { InterfaceLocaleProvider } from '../localization/interface-locale';
import { ContractProjectCreatePanel } from './ContractProjectCreatePanel';
import { deterministicBrowserIdentity } from '../access-composition';
import { interfaceLocaleStorageKey } from '../localization/interface-locale';
import { interfaceLocales } from '../localization/interface-locale';
import {
  assertMessageCoverage,
  resolveMessage,
} from '../localization/messages';
import { contractProjectCreateMessages } from './contract-project-create.copy';
const identity = deterministicBrowserIdentity({
  'x-test-external-subject': 'contract-reader',
});
const project = {
  id: 'project-created',
  title: 'Chosen Project',
  status: 'preparatory',
  createdAt: '2026-10-09T09:00:00.000Z',
};
const result = {
  project,
  link: {
    id: 'link-created',
    contractId: 'contract-one',
    projectId: project.id,
    revision: 4,
    created: true,
    actorWorkspaceMembershipId: 'member-one',
    linkedAt: project.createdAt,
  },
};
beforeEach(() => window.localStorage.setItem(interfaceLocaleStorageKey, 'en'));
afterEach(() => {
  vi.restoreAllMocks();
  window.localStorage.removeItem(interfaceLocaleStorageKey);
});
describe('Contract Project creation', () => {
  it.each(interfaceLocales)(
    'shows accessible creation fields in %s without changing entered meaning',
    (locale) => {
      window.localStorage.setItem(interfaceLocaleStorageKey, locale);
      assertMessageCoverage(
        'contractProjectCreate',
        contractProjectCreateMessages,
      );
      render(
        <InterfaceLocaleProvider>
          <ContractProjectCreatePanel
            identity={identity}
            companyId="company-one"
            opportunityId="opportunity-one"
            contractId="contract-one"
            revision={3}
            initialTitle="Opportunity title"
            candidates={[]}
            protectedCommand={false}
            reject={async () => undefined}
            onCreated={() => undefined}
            onCandidatesChanged={() => undefined}
            onProtectionChange={() => undefined}
          />
        </InterfaceLocaleProvider>,
      );
      expect(
        screen.getByRole('textbox', {
          name: resolveMessage(
            contractProjectCreateMessages,
            locale,
            'projectTitle',
          ),
        }),
      ).toHaveValue('Opportunity title');
      expect(
        screen.getByRole('checkbox', {
          name: resolveMessage(
            contractProjectCreateMessages,
            locale,
            'acknowledge',
          ),
        }),
      ).not.toBeChecked();
    },
  );
  it('discards a late creation response when the owning context unmounts', async () => {
    let finish: ((response: Response) => void) | undefined;
    const created = vi.fn();
    vi.spyOn(globalThis, 'fetch').mockImplementation(
      () =>
        new Promise<Response>((resolve) => {
          finish = resolve;
        }),
    );
    const view = render(
      <InterfaceLocaleProvider>
        <ContractProjectCreatePanel
          identity={identity}
          companyId="company-one"
          opportunityId="opportunity-one"
          contractId="contract-one"
          revision={3}
          initialTitle="Opportunity title"
          candidates={[]}
          protectedCommand={false}
          reject={async () => undefined}
          onCreated={created}
          onCandidatesChanged={() => undefined}
          onProtectionChange={() => undefined}
        />
      </InterfaceLocaleProvider>,
    );
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(
      screen.getByRole('button', { name: 'Create and link Project' }),
    );
    await waitFor(() => expect(finish).toBeDefined());
    view.unmount();
    finish?.(new Response(JSON.stringify(result), { status: 201 }));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(created).not.toHaveBeenCalled();
  });
  it('requires explicit current-set acknowledgement and retains the exact uncertain creation for retry', async () => {
    const sent: Array<{ body: unknown; key: string | null }> = [],
      linked = vi.fn();
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (_input, init) => {
      sent.push({
        body: init?.body,
        key: new Headers(init?.headers).get('idempotency-key'),
      });
      if (sent.length === 1) throw new Error('Synthetic lost response');
      return new Response(JSON.stringify(result), { status: 201 });
    });
    render(
      <InterfaceLocaleProvider>
        <ContractProjectCreatePanel
          identity={identity}
          companyId="company-one"
          opportunityId="opportunity-one"
          contractId="contract-one"
          revision={3}
          initialTitle="Opportunity title"
          candidates={[]}
          protectedCommand={false}
          reject={async () => undefined}
          onCreated={linked}
          onCandidatesChanged={() => undefined}
          onProtectionChange={() => undefined}
        />
      </InterfaceLocaleProvider>,
    );
    expect(
      screen.getByRole('button', { name: 'Create and link Project' }),
    ).toBeDisabled();
    fireEvent.change(
      screen.getByRole('textbox', { name: 'New Project title' }),
      { target: { value: 'Chosen Project' } },
    );
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(
      screen.getByRole('button', { name: 'Create and link Project' }),
    );
    const retry = await screen.findByRole('button', {
      name: 'Retry the same Project creation',
    });
    expect(screen.getByRole('textbox')).toBeDisabled();
    fireEvent.click(retry);
    await screen.findByText('Preparatory Project created and linked.');
    expect(sent).toHaveLength(2);
    expect(sent[1]).toEqual(sent[0]);
    expect(JSON.parse(String(sent[0]?.body))).toEqual({
      title: 'Chosen Project',
      acknowledgedCandidateProjectIds: [],
      expectedContractRevision: 3,
    });
    expect(linked).toHaveBeenCalledWith(result.link, project);
  });
  it('keeps the chosen title and clears acknowledgement after changed-set refusal', async () => {
    const reload = vi.fn();
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ code: 'PROJECT_CANDIDATES_CHANGED' }), {
        status: 409,
      }),
    );
    render(
      <InterfaceLocaleProvider>
        <ContractProjectCreatePanel
          identity={identity}
          companyId="company-one"
          opportunityId="opportunity-one"
          contractId="contract-one"
          revision={3}
          initialTitle="Opportunity title"
          candidates={[]}
          protectedCommand={false}
          reject={async () => undefined}
          onCreated={() => undefined}
          onCandidatesChanged={reload}
          onProtectionChange={() => undefined}
        />
      </InterfaceLocaleProvider>,
    );
    fireEvent.change(screen.getByRole('textbox'), {
      target: { value: 'Chosen Project' },
    });
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(
      screen.getByRole('button', { name: 'Create and link Project' }),
    );
    await screen.findByText(
      'The candidates changed. Review the refreshed list and confirm again.',
    );
    expect(screen.getByRole('textbox')).toHaveValue('Chosen Project');
    expect(screen.getByRole('checkbox')).not.toBeChecked();
    await waitFor(() => expect(reload).toHaveBeenCalledOnce());
  });
});
