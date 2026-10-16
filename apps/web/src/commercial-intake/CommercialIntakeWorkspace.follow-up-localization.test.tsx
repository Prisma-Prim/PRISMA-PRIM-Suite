import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { deterministicBrowserIdentity } from '../access-composition';
import type { ActorContext } from '../access-types';
import {
  InterfaceLocaleProvider,
  useInterfaceLocale,
} from '../localization/interface-locale';
import {
  buildClientRequest,
  requestListItemFor,
} from '../test/commercial-intake-responses';
import { CommercialIntakeWorkspace } from './CommercialIntakeWorkspace';
import { selectOption } from '../test/select-option';

const actor: ActorContext = {
  internalUserId: 'user-1',
  workspaceMembershipId: 'membership-1',
  workspaceId: 'workspace-1',
  workspaceName: 'Workspace',
  displayName: 'Ana',
  email: 'ana@example.test',
  active: true,
  workspacePermissions: [],
  activeCompany: {
    id: 'company-1',
    displayName: 'PRISMA-PRIM',
    commercialIntakePermissions: [
      'commercial.request.read',
      'commercial.request.create',
      'commercial.opportunity.read',
      'commercial.opportunity.create',
      'commercial.opportunity.next_action.update',
    ],
    commercialIntakePermissionAssignmentId: 'intake-assignment',
    commercialIntakePermissionSetVersion: 'v2',
    opportunityManagerPermissions: ['commercial.opportunity.assign'],
    opportunityManagerPermissionAssignmentId: 'manager-assignment',
    opportunityManagerPermissionSetVersion: 'v1',
  },
};

const locales = [
  {
    name: 'Română',
    nextAction: 'Acțiunea următoare',
    save: 'Salvează acțiunea următoare',
    retry: 'Reîncearcă actualizarea',
    uncertain:
      'Actualizarea acțiunii următoare nu s-a finalizat. Reîncercați pentru a confirma rezultatul.',
    responsibleChoice: 'Noul responsabil',
    saveResponsible: 'Salvează responsabilul',
    responsibleUncertain:
      'Schimbarea responsabilului nu s-a finalizat. Reîncercați pentru a confirma rezultatul.',
  },
  {
    name: 'Русский',
    nextAction: 'Следующее действие',
    save: 'Сохранить следующее действие',
    retry: 'Повторить обновление',
    uncertain:
      'Обновление следующего действия не завершено. Повторите попытку, чтобы подтвердить результат.',
    responsibleChoice: 'Новый ответственный',
    saveResponsible: 'Сохранить ответственного',
    responsibleUncertain:
      'Смена ответственного не завершена. Повторите попытку, чтобы подтвердить результат.',
  },
  {
    name: 'Français',
    nextAction: 'Prochaine action',
    save: 'Enregistrer la prochaine action',
    retry: 'Réessayer la mise à jour',
    uncertain:
      'La mise à jour de la prochaine action n’a pas abouti. Réessayez pour confirmer le résultat.',
    responsibleChoice: 'Nouveau responsable',
    saveResponsible: 'Enregistrer le responsable',
    responsibleUncertain:
      'Le changement de responsable n’a pas abouti. Réessayez pour confirmer le résultat.',
  },
  {
    name: 'English',
    nextAction: 'Next action',
    save: 'Save next action',
    retry: 'Retry update',
    uncertain:
      'The next action update did not complete. Retry to confirm the result.',
    responsibleChoice: 'New responsible actor',
    saveResponsible: 'Save responsible',
    responsibleUncertain:
      'The responsible actor change did not complete. Retry to confirm the result.',
  },
] as const;

function LocaleChoices() {
  const { changeLocale } = useInterfaceLocale();
  return (
    <>
      <button type="button" onClick={() => changeLocale('ro')}>
        Română
      </button>
      <button type="button" onClick={() => changeLocale('ru')}>
        Русский
      </button>
      <button type="button" onClick={() => changeLocale('fr')}>
        Français
      </button>
      <button type="button" onClick={() => changeLocale('en')}>
        English
      </button>
    </>
  );
}

function renderWorkspace() {
  return render(
    <InterfaceLocaleProvider>
      <LocaleChoices />
      <CommercialIntakeWorkspace
        actor={actor}
        identity={deterministicBrowserIdentity()}
        onCompanyContextRejected={vi.fn()}
      />
    </InterfaceLocaleProvider>,
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
});

describe('localized Opportunity follow-up', () => {
  it('offers next-action and responsible-actor editing in Romanian', async () => {
    const saved = buildClientRequest({ subject: 'Solicitare {originală}' });
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof fetch>(async (input) =>
        Response.json(
          String(input).includes('?limit=25')
            ? { items: [requestListItemFor(saved)] }
            : saved,
        ),
      ),
    );
    renderWorkspace();
    fireEvent.click(
      await screen.findByRole('button', { name: /Solicitare \{originală\}/u }),
    );
    expect(
      await screen.findByRole('button', {
        name: 'Editează acțiunea următoare',
      }),
    ).toBeVisible();
    expect(
      screen.getByRole('button', { name: 'Schimbă responsabilul' }),
    ).toBeVisible();
  });

  it('preserves the exact next-action draft and uncertain command while feedback changes through all four locales', async () => {
    const draft = '  Sună {clientul} / Позвонить  ';
    let saved = buildClientRequest({
      subject: 'Solicitare {originală}',
      originalText: 'Original {sursă} / источник',
    });
    const commands: Array<{
      path: string;
      body: BodyInit | null | undefined;
      key: string | null;
      companyId: string | null;
    }> = [];
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof fetch>(async (input, init) => {
        if (init?.method === 'POST') {
          commands.push({
            path: String(input),
            body: init.body,
            key: new Headers(init.headers).get('idempotency-key'),
            companyId: new Headers(init.headers).get('x-company-context-id'),
          });
          if (commands.length === 1) return new Response(null, { status: 503 });
          saved = buildClientRequest({
            ...saved,
            initialOpportunity: {
              ...saved.initialOpportunity,
              nextAction: draft,
              version: 2,
            },
          });
          return Response.json({
            receipt: {
              opportunityId: 'opportunity-1',
              nextAction: draft,
              version: 2,
              outcome: 'updated',
            },
            request: saved,
          });
        }
        return Response.json(
          String(input).includes('?limit=25')
            ? { items: [requestListItemFor(saved)] }
            : saved,
        );
      }),
    );
    renderWorkspace();
    fireEvent.click(
      await screen.findByRole('button', { name: /Solicitare \{originală\}/u }),
    );
    fireEvent.click(
      await screen.findByRole('button', {
        name: 'Editează acțiunea următoare',
      }),
    );
    fireEvent.change(screen.getByLabelText('Acțiunea următoare'), {
      target: { value: draft },
    });
    for (const locale of locales) {
      fireEvent.click(screen.getByRole('button', { name: locale.name }));
      expect(screen.getByLabelText(locale.nextAction)).toHaveValue(draft);
      expect(screen.getByRole('button', { name: locale.save })).toBeVisible();
      expect(commands).toHaveLength(0);
    }
    fireEvent.click(screen.getByRole('button', { name: 'Save next action' }));
    expect(
      await screen.findByText(locales[3].uncertain, {
        selector: '[role="alert"]',
      }),
    ).toBeVisible();
    for (const locale of locales) {
      fireEvent.click(screen.getByRole('button', { name: locale.name }));
      expect(
        screen.getByText(locale.uncertain, {
          selector: '[role="alert"]',
        }),
      ).toBeVisible();
      expect(screen.getByLabelText(locale.nextAction)).toHaveValue(draft);
      expect(screen.getByLabelText(locale.nextAction)).toBeDisabled();
      expect(screen.getByRole('button', { name: locale.retry })).toBeVisible();
      expect(commands).toHaveLength(1);
    }
    fireEvent.click(screen.getByRole('button', { name: 'Retry update' }));
    expect(
      await screen.findByText('Next action saved.', {
        selector: '[role="alert"]',
      }),
    ).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Français' }));
    expect(
      screen.getByText('Prochaine action enregistrée.', {
        selector: '[role="alert"]',
      }),
    ).toBeVisible();
    expect(screen.getByText('Original {sursă} / источник')).toBeVisible();
    expect(commands).toHaveLength(2);
    expect(commands[0]).toEqual(commands[1]);
    expect(commands[0]?.key).toBeTruthy();
    expect(commands[0]?.path).toBe(
      '/api/commercial-intake/opportunities/opportunity-1/next-action',
    );
    expect(commands[0]?.companyId).toBe('company-1');
    expect(commands[0]?.body).toBe(
      JSON.stringify({ expectedVersion: 1, nextAction: draft }),
    );
  });

  it('preserves eligible-member selection and the exact uncertain reassignment across all four locales', async () => {
    const member = {
      workspaceMembershipId: 'membership-2',
      displayName: 'Nou {responsabil} / Новый',
    };
    const memberLabel = `${member.displayName} · 2B`;
    let saved = buildClientRequest({
      subject: 'Solicitare {originală}',
      originalText: 'Original {sursă} / источник',
      initialOpportunity: { nextAction: '  Original {următorul pas}  ' },
    });
    let memberReads = 0;
    const commands: Array<{
      path: string;
      body: BodyInit | null | undefined;
      key: string | null;
      companyId: string | null;
    }> = [];
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof fetch>(async (input, init) => {
        const path = String(input);
        if (init?.method === 'POST') {
          commands.push({
            path,
            body: init.body,
            key: new Headers(init.headers).get('idempotency-key'),
            companyId: new Headers(init.headers).get('x-company-context-id'),
          });
          if (commands.length === 1) return new Response(null, { status: 503 });
          saved = buildClientRequest({
            ...saved,
            initialOpportunity: {
              ...saved.initialOpportunity,
              responsibleActor: member,
              responsibleWorkspaceMembershipId: member.workspaceMembershipId,
              version: 2,
            },
          });
          return Response.json({
            receipt: {
              opportunityId: 'opportunity-1',
              workspaceMembershipId: member.workspaceMembershipId,
              version: 2,
              outcome: 'updated',
            },
            request: saved,
          });
        }
        if (path.endsWith('/eligible-responsible-actors')) {
          memberReads += 1;
          return Response.json({
            members: [
              {
                workspaceMembershipId: 'membership-1',
                displayLabel: 'Iurie · 1A',
              },
              {
                workspaceMembershipId: member.workspaceMembershipId,
                displayLabel: memberLabel,
              },
            ],
          });
        }
        return Response.json(
          path.includes('?limit=25')
            ? { items: [requestListItemFor(saved)] }
            : saved,
        );
      }),
    );
    renderWorkspace();
    fireEvent.click(
      await screen.findByRole('button', { name: /Solicitare \{originală\}/u }),
    );
    fireEvent.click(
      await screen.findByRole('button', { name: 'Schimbă responsabilul' }),
    );
    selectOption(
      await screen.findByRole('combobox', { name: 'Noul responsabil' }),
      member.workspaceMembershipId,
    );
    for (const locale of locales) {
      fireEvent.click(screen.getByRole('button', { name: locale.name }));
      const choice = screen.getByRole('combobox', {
        name: locale.responsibleChoice,
      });
      expect(choice).toHaveAttribute(
        'data-value',
        member.workspaceMembershipId,
      );
      expect(choice).toHaveTextContent(memberLabel);
      expect(
        screen.getByRole('button', { name: locale.saveResponsible }),
      ).toBeVisible();
      expect(memberReads).toBe(1);
      expect(commands).toHaveLength(0);
    }
    fireEvent.click(screen.getByRole('button', { name: 'Save responsible' }));
    expect(
      await screen.findByText(locales[3].responsibleUncertain, {
        selector: '[role="alert"]',
      }),
    ).toBeVisible();
    for (const locale of locales) {
      fireEvent.click(screen.getByRole('button', { name: locale.name }));
      expect(
        screen.getByText(locale.responsibleUncertain, {
          selector: '[role="alert"]',
        }),
      ).toBeVisible();
      const choice = screen.getByRole('combobox', {
        name: locale.responsibleChoice,
      });
      expect(choice).toHaveAttribute(
        'data-value',
        member.workspaceMembershipId,
      );
      expect(choice).toHaveTextContent(memberLabel);
      expect(choice).toBeDisabled();
      expect(screen.getByRole('button', { name: locale.retry })).toBeVisible();
      expect(memberReads).toBe(1);
      expect(commands).toHaveLength(1);
    }
    fireEvent.click(screen.getByRole('button', { name: 'Retry update' }));
    expect(
      await screen.findByText('Responsible actor changed.', {
        selector: '[role="alert"]',
      }),
    ).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Français' }));
    expect(
      screen.getByText('Responsable modifié.', { selector: '[role="alert"]' }),
    ).toBeVisible();
    expect(screen.getByText('Original {sursă} / источник')).toBeVisible();
    expect(
      screen.getByText('Responsable: ' + member.displayName),
    ).toBeVisible();
    expect(commands).toHaveLength(2);
    expect(commands[0]).toEqual(commands[1]);
    expect(commands[0]?.key).toBeTruthy();
    expect(commands[0]?.path).toBe(
      '/api/commercial-intake/opportunities/opportunity-1/responsible',
    );
    expect(commands[0]?.companyId).toBe('company-1');
    expect(commands[0]?.body).toBe(
      JSON.stringify({
        expectedVersion: 1,
        workspaceMembershipId: member.workspaceMembershipId,
      }),
    );
  });

  it('keeps a stale next-action conflict blocked across locale changes until the explicit reload', async () => {
    const saved = buildClientRequest({ subject: 'Solicitare {originală}' });
    const refreshed = buildClientRequest({
      ...saved,
      initialOpportunity: {
        ...saved.initialOpportunity,
        nextAction: 'Server {new action}',
        version: 2,
      },
    });
    let detailReads = 0;
    let commands = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof fetch>(async (input, init) => {
        if (init?.method === 'POST') {
          commands += 1;
          return new Response(null, { status: 409 });
        }
        if (String(input).includes('?limit=25'))
          return Response.json({ items: [requestListItemFor(saved)] });
        detailReads += 1;
        return Response.json(detailReads === 1 ? saved : refreshed);
      }),
    );
    renderWorkspace();
    fireEvent.click(
      await screen.findByRole('button', { name: /Solicitare \{originală\}/u }),
    );
    fireEvent.click(
      await screen.findByRole('button', {
        name: 'Editează acțiunea următoare',
      }),
    );
    fireEvent.change(screen.getByLabelText('Acțiunea următoare'), {
      target: { value: 'Local {draft}' },
    });
    fireEvent.click(
      screen.getByRole('button', { name: 'Salvează acțiunea următoare' }),
    );
    const states = [
      {
        name: 'Română',
        reload: 'Reîncărcați Solicitarea',
        message:
          'Această Oportunitate s-a modificat după încărcare. Reîncărcați Solicitarea înainte de a edita din nou.',
      },
      {
        name: 'Русский',
        reload: 'Перезагрузить Запрос',
        message:
          'Эта Возможность изменилась после загрузки. Перезагрузите Запрос перед повторным редактированием.',
      },
      {
        name: 'Français',
        reload: 'Recharger la Demande',
        message:
          'Cette Opportunité a changé depuis son chargement. Rechargez la Demande avant de la modifier à nouveau.',
      },
      {
        name: 'English',
        reload: 'Reload Request',
        message:
          'This Opportunity changed since you loaded it. Reload the Request before editing again.',
      },
    ];
    await screen.findByText(states[0].message, { selector: '[role="alert"]' });
    for (const state of states) {
      fireEvent.click(screen.getByRole('button', { name: state.name }));
      expect(
        screen.getByText(state.message, { selector: '[role="alert"]' }),
      ).toBeVisible();
      expect(screen.getByRole('button', { name: state.reload })).toBeVisible();
      expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
      expect(commands).toBe(1);
      expect(detailReads).toBe(1);
    }
    fireEvent.click(screen.getByRole('button', { name: 'Reload Request' }));
    fireEvent.click(
      await screen.findByRole('button', { name: 'Edit next action' }),
    );
    expect(screen.getByLabelText('Next action')).toHaveValue(
      'Server {new action}',
    );
    expect(detailReads).toBe(2);
    expect(commands).toBe(1);
  });

  it('translates eligible-member load recovery and keeps an ineligible recorded actor literal', async () => {
    const saved = buildClientRequest({
      subject: 'Solicitare {originală}',
      initialOpportunity: {
        responsibleActor: {
          workspaceMembershipId: 'membership-1',
          displayName: 'Iurie {original} / Ион',
        },
      },
    });
    let memberReads = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof fetch>(async (input) => {
        const path = String(input);
        if (path.endsWith('/eligible-responsible-actors')) {
          memberReads += 1;
          return memberReads === 1
            ? new Response(null, { status: 503 })
            : Response.json({ members: [] });
        }
        return Response.json(
          path.includes('?limit=25')
            ? { items: [requestListItemFor(saved)] }
            : saved,
        );
      }),
    );
    renderWorkspace();
    fireEvent.click(
      await screen.findByRole('button', { name: /Solicitare \{originală\}/u }),
    );
    fireEvent.click(
      await screen.findByRole('button', { name: 'Schimbă responsabilul' }),
    );
    const states = [
      {
        name: 'Română',
        reload: 'Reîncărcați lista',
        message:
          'Membrii eligibili nu au putut fi încărcați. Reîncărcați lista.',
      },
      {
        name: 'Русский',
        reload: 'Перезагрузить список',
        message:
          'Не удалось загрузить доступных участников. Перезагрузите список.',
      },
      {
        name: 'Français',
        reload: 'Recharger la liste',
        message:
          'Impossible de charger les membres éligibles. Rechargez la liste.',
      },
      {
        name: 'English',
        reload: 'Reload the list',
        message: 'The eligible members could not be loaded. Reload the list.',
      },
    ];
    await screen.findByText(states[0].message, { selector: '[role="alert"]' });
    for (const state of states) {
      fireEvent.click(screen.getByRole('button', { name: state.name }));
      expect(
        screen.getByText(state.message, { selector: '[role="alert"]' }),
      ).toBeVisible();
      expect(screen.getByRole('button', { name: state.reload })).toBeVisible();
      expect(memberReads).toBe(1);
    }
    fireEvent.click(screen.getByRole('button', { name: 'Reload the list' }));
    expect(
      await screen.findByText(
        'No other eligible member; the current responsible actor stays.',
      ),
    ).toBeVisible();
    expect(
      screen.getByText(
        'Current responsible actor: Iurie {original} / Ион — no longer eligible.',
      ),
    ).toBeVisible();
    expect(
      screen.queryByRole('button', { name: 'Save responsible' }),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Français' }));
    expect(
      screen.getByText(
        'Aucun autre membre éligible ; le responsable actuel reste inchangé.',
      ),
    ).toBeVisible();
    expect(
      screen.getByText(
        'Responsable actuel : Iurie {original} / Ион — n’est plus éligible.',
      ),
    ).toBeVisible();
    expect(memberReads).toBe(2);
  });
});
