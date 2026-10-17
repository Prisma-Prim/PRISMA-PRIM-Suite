import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { deterministicBrowserIdentity } from '../access-composition';
import {
  clearWorkspaceSelection,
  selectWorkspace,
  selectedWorkspaceId,
} from '../access/workspace-selection';
import {
  InterfaceLocaleProvider,
  interfaceLocales,
  interfaceLocaleStorageKey,
  useInterfaceLocale,
} from '../localization/interface-locale';
import { resolveMessage } from '../localization/messages';
import {
  contractLocaleActor,
  contractLocaleIds,
  contractLocaleLiteral,
  contractLocalePath,
  contractLocaleRecord,
  readContractLocaleFixture,
} from '../test/contract-localization-fixture';
import { ContractPanel } from './ContractPanel';
import { contractMessages } from './contract.copy';

afterEach(() => {
  vi.restoreAllMocks();
  clearWorkspaceSelection();
  localStorage.clear();
  sessionStorage.clear();
  window.history.replaceState(null, '', '/');
});
function LocaleChoices() {
  const { changeLocale } = useInterfaceLocale();
  return (
    <>
      {interfaceLocales.map((locale) => (
        <button key={locale} onClick={() => changeLocale(locale)}>
          Use {locale}
        </button>
      ))}
    </>
  );
}
function respond(body: unknown, status = 200) {
  return Response.json(body, { status });
}

// Test authoring only: no evidence is claimed until the coordinator leases execution.
it.each([false, true])(
  'preserves an explicitly selected Workspace UUID and complete exact retry with literal draft=%s',
  async (hasLiteral) => {
    selectWorkspace(contractLocaleIds.workspace);
    localStorage.setItem(interfaceLocaleStorageKey, 'en');
    const actor = contractLocaleActor();
    const identity = deterministicBrowserIdentity({
      'x-test-external-subject': 'contract-657',
    });
    const attempts: Array<{
      path: string;
      body: BodyInit | null | undefined;
      key: string | null;
      company: string | null;
      workspace: string | null;
      subject: string | null;
    }> = [];
    const onCompanyContextRejected = vi.fn();
    const onActorRevalidated = vi.fn();
    const onWorkspaceAccessRejected = vi.fn();
    let recorded = false;
    const fetch = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(async (input, init) => {
        const path = new URL(input.toString(), 'http://localhost').pathname;
        if (init?.method === 'POST') {
          const headers = new Headers(init.headers);
          attempts.push({
            path,
            body: init.body,
            key: headers.get('idempotency-key'),
            company: headers.get('x-company-context-id'),
            workspace: headers.get('x-workspace-context-id'),
            subject: headers.get('x-test-external-subject'),
          });
          const stored = contractLocaleRecord();
          recorded = attempts.length > 1;
          return attempts.length === 1
            ? respond({}, 503)
            : respond(
                {
                  ...stored,
                  version: {
                    ...stored.version,
                    termStartsOn: hasLiteral ? '2028-02-29' : null,
                    termEndsOn: hasLiteral ? '2028-03-01' : null,
                    specialConditions: hasLiteral
                      ? contractLocaleLiteral
                      : null,
                  },
                },
                201,
              );
        }
        return respond(
          readContractLocaleFixture({ path, hasCompany: true, recorded }),
        );
      });
    render(
      <InterfaceLocaleProvider>
        <LocaleChoices />
        <ContractPanel
          actor={actor}
          identity={identity}
          opportunityId={contractLocaleIds.opportunity}
          onCompanyContextRejected={onCompanyContextRejected}
          onActorRevalidated={onActorRevalidated}
          onWorkspaceAccessRejected={onWorkspaceAccessRejected}
        />
      </InterfaceLocaleProvider>,
    );
    const field = await screen.findByRole('textbox', {
      name: 'Special conditions',
    });
    if (hasLiteral) {
      fireEvent.change(field, { target: { value: contractLocaleLiteral } });
      fireEvent.change(screen.getByLabelText('Term start'), {
        target: { value: '2028-02-29' },
      });
      fireEvent.change(screen.getByLabelText('Term end'), {
        target: { value: '2028-03-01' },
      });
    }
    fireEvent.click(screen.getByRole('button', { name: 'Create Contract' }));
    await screen.findByText(
      'The result is uncertain. Retry the same Contract command.',
    );
    const beforeLocale = fetch.mock.calls.length;
    for (const locale of interfaceLocales) {
      fireEvent.click(screen.getByRole('button', { name: 'Use ' + locale }));
      expect(
        screen.getByRole('textbox', {
          name: resolveMessage(contractMessages, locale, 'conditions'),
        }),
      ).toBe(field);
      expect(field).toHaveValue(hasLiteral ? contractLocaleLiteral : '');
      expect(field).toBeDisabled();
      expect(screen.getByRole('alert')).toHaveTextContent(
        resolveMessage(contractMessages, locale, 'uncertain'),
      );
      expect(selectedWorkspaceId()).toBe(contractLocaleIds.workspace);
      expect(fetch).toHaveBeenCalledTimes(beforeLocale);
    }
    fireEvent.click(
      screen.getByRole('button', { name: 'Retry the same Contract command' }),
    );
    await screen.findByText('Contract created.');
    expect(attempts).toHaveLength(2);
    expect(attempts[1]).toEqual(attempts[0]);
    expect(attempts[0]).toEqual({
      path: contractLocalePath,
      body: JSON.stringify({
        acceptedOfferVersionId: 'accepted-offer-version-657',
        termStartsOn: hasLiteral ? '2028-02-29' : null,
        termEndsOn: hasLiteral ? '2028-03-01' : null,
        specialConditions: hasLiteral ? contractLocaleLiteral : null,
      }),
      key: expect.any(String),
      company: contractLocaleIds.company,
      workspace: contractLocaleIds.workspace,
      subject: 'contract-657',
    });
    expect(attempts[0]?.key).not.toBe('');
    expect(onCompanyContextRejected).not.toHaveBeenCalled();
    expect(onActorRevalidated).not.toHaveBeenCalled();
    expect(onWorkspaceAccessRejected).not.toHaveBeenCalled();
    expect(
      fetch.mock.calls.filter(([, init]) => init?.method === 'POST'),
    ).toHaveLength(2);
  },
);
