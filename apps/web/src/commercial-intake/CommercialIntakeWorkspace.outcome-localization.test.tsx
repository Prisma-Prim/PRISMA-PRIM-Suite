import { fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { deterministicBrowserIdentity } from '../access-composition';
import type { ActorContext } from '../access-types';
import { InterfaceLocaleProvider } from '../localization/interface-locale';
import { InterfaceLocaleSelect } from '../localization/InterfaceLocaleSelect';
import {
  buildClientRequest,
  requestListItemFor,
} from '../test/commercial-intake-responses';
import { CommercialIntakeWorkspace } from './CommercialIntakeWorkspace';
import { selectOption } from '../test/select-option';
import { buildOutcomeHistoryEntry } from '../test/commercial-intake-responses';

const locales = [
  {
    code: 'ro',
    putOnHold: 'Pune în așteptare',
    cancel: 'Anulează',
    reload: 'Reîncărcați Solicitarea',
    conflict:
      'Această Oportunitate s-a schimbat de la încărcare. Reîncărcați Solicitarea înainte de a schimba starea.',
    denied:
      'Nu mai aveți permisiunea de a schimba starea acestei Oportunități.',
    notice:
      'Solicitarea Client cerută se va deschide după salvarea sau anularea schimbării stării.',

    language: 'Limba interfeței',
    change: 'Schimbă starea',
    transition: 'Schimbarea stării',
    lose: 'Marchează ca pierdută',
    loss: 'Motivul pierderii',
    other: 'Altul',
    note: 'Notă (obligatorie pentru Altul)',
    reason: 'Motiv',
    save: 'Salvează starea',
    retry: 'Reîncearcă actualizarea',
    validation:
      'Alegeți o schimbare de stare și completați câmpurile obligatorii, fiecare cu 1–500 de caractere.',
    uncertain:
      'Schimbarea stării nu s-a finalizat. Reîncercați pentru a confirma rezultatul.',
    success: 'Stare schimbată.',
    history: 'Istoricul stărilor',
    older: 'Arată schimbările de stare mai vechi',
    olderError:
      'Schimbările de stare mai vechi nu au putut fi încărcate. Reîncercați.',
    lost: 'Deschisă → Pierdută',
    resumed: 'În așteptare → Deschisă',
    hold: 'Deschisă → În așteptare',
    date: '23 sept. 2026, 10:00',
  },
  {
    code: 'ru',
    putOnHold: 'Приостановить',
    cancel: 'Отмена',
    reload: 'Перезагрузить Запрос',
    conflict:
      'Эта Возможность изменилась с момента загрузки. Перезагрузите Запрос перед изменением статуса.',
    denied: 'У вас больше нет права изменять статус этой Возможности.',
    notice:
      'Запрошенный Запрос Клиента откроется после сохранения или отмены изменения статуса.',

    language: 'Язык интерфейса',
    change: 'Изменить статус',
    transition: 'Изменение статуса',
    lose: 'Отметить как проигранную',
    loss: 'Причина проигрыша',
    other: 'Другая',
    note: 'Примечание (обязательно для другой причины)',
    reason: 'Причина',
    save: 'Сохранить статус',
    retry: 'Повторить обновление',
    validation:
      'Выберите изменение статуса и заполните обязательные поля, каждое длиной от 1 до 500 символов.',
    uncertain:
      'Изменение статуса не завершено. Повторите попытку, чтобы подтвердить результат.',
    success: 'Статус изменён.',
    history: 'История статусов',
    older: 'Показать более ранние изменения статуса',
    olderError:
      'Не удалось загрузить более ранние изменения статуса. Повторите попытку.',
    lost: 'Открыта → Проиграна',
    resumed: 'Приостановлена → Открыта',
    hold: 'Открыта → Приостановлена',
    date: '23 сент. 2026 г., 10:00',
  },
  {
    code: 'fr',
    putOnHold: 'Mettre en attente',
    cancel: 'Annuler',
    reload: 'Recharger la Demande',
    conflict:
      'Cette Opportunité a changé depuis son chargement. Rechargez la Demande avant de modifier le statut.',
    denied:
      'Vous n’avez plus l’autorisation de modifier le statut de cette Opportunité.',
    notice:
      'La Demande Client demandée s’ouvrira après l’enregistrement ou l’annulation du changement de statut.',

    language: 'Langue de l’interface',
    change: 'Modifier le statut',
    transition: 'Changement de statut',
    lose: 'Marquer comme perdue',
    loss: 'Motif de perte',
    other: 'Autre',
    note: 'Note (obligatoire pour Autre)',
    reason: 'Motif',
    save: 'Enregistrer le statut',
    retry: 'Réessayer la mise à jour',
    validation:
      'Choisissez un changement de statut et renseignez les champs obligatoires, chacun de 1 à 500 caractères.',
    uncertain:
      'Le changement de statut n’a pas abouti. Réessayez pour confirmer le résultat.',
    success: 'Statut modifié.',
    history: 'Historique des statuts',
    older: 'Afficher les changements de statut plus anciens',
    olderError:
      'Impossible de charger les changements de statut plus anciens. Réessayez.',
    lost: 'Ouverte → Perdue',
    resumed: 'En attente → Ouverte',
    hold: 'Ouverte → En attente',
    date: '23 sept. 2026, 10:00',
  },
  {
    code: 'en',
    putOnHold: 'Put on hold',
    cancel: 'Cancel',
    reload: 'Reload Request',
    conflict:
      'This Opportunity changed since you loaded it. Reload the Request before changing the status.',
    denied:
      'You no longer have permission to change the status of this Opportunity.',
    notice:
      'The requested Client Request opens after the status change is saved or cancelled.',

    language: 'Interface language',
    change: 'Change status',
    transition: 'Status change',
    lose: 'Mark as lost',
    loss: 'Loss reason',
    other: 'Other',
    note: 'Note (required for Other)',
    reason: 'Reason',
    save: 'Save status',
    retry: 'Retry update',
    validation:
      'Choose a status change and enter its required fields, each between 1 and 500 characters.',
    uncertain:
      'The status change did not complete. Retry to confirm the result.',
    success: 'Status changed.',
    history: 'Status history',
    older: 'Show older status changes',
    olderError: 'Older status changes could not be loaded. Try again.',
    lost: 'Open → Lost',
    resumed: 'On hold → Open',
    hold: 'Open → On hold',
    date: 'Sep 23, 2026, 10:00 AM',
  },
] as const;

function changeLocale(code: string) {
  const control = document.getElementById('interface-locale');
  if (!control) throw new Error('The interface locale control must be visible');
  selectOption(control, code);
}

const literalNote = '  {Motiv} / Причина păstrată  ';
const literalReason = '  Așteaptă {bugetul} / бюджет  ';
const recordedActor = {
  workspaceMembershipId: 'membership-1',
  displayLabel: 'Ana {nume} / Имя',
};
const held = buildOutcomeHistoryEntry({
  reason: literalReason,
  actor: recordedActor,
});
const resumed = buildOutcomeHistoryEntry({
  previousStatus: 'ON_HOLD',
  newStatus: 'OPEN',
  reason: null,
  version: 3,
  changedAt: '2026-09-22T10:00:00.000Z',
  actor: recordedActor,
});
const lost = buildOutcomeHistoryEntry({
  previousStatus: 'OPEN',
  newStatus: 'LOST',
  reason: null,
  lossReasonCode: 'OTHER',
  note: literalNote,
  version: 4,
  changedAt: '2026-09-23T10:00:00.000Z',
  actor: recordedActor,
});

function initialRequest() {
  return buildClientRequest({
    subject: 'Solicitare {originală}',
    originalText: 'Original {sursă} / источник',
    initialOpportunity: {
      outcomeHistory: { entries: [resumed], nextCursor: 'older-2' },
    },
  });
}

type Command = {
  body: BodyInit | null | undefined;
  key: string | null;
  company: string | null;
  path: string;
};

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
    opportunityManagerPermissions: [
      'commercial.opportunity.assign',
      'commercial.opportunity.outcome.change',
    ],
    opportunityManagerPermissionAssignmentId: 'manager-assignment',
    opportunityManagerPermissionSetVersion: 'v2',
  },
};

function renderWorkspace() {
  let currentActor = actor;
  let requestedRequest:
    { clientRequestId: string; requestId: number } | undefined;
  const identity = deterministicBrowserIdentity();
  const element = () => (
    <InterfaceLocaleProvider>
      <InterfaceLocaleSelect />
      <CommercialIntakeWorkspace
        actor={currentActor}
        identity={identity}
        onCompanyContextRejected={vi.fn()}
        requestedRequest={requestedRequest}
      />
    </InterfaceLocaleProvider>
  );
  const view = render(element());
  return {
    selectActor(next: ActorContext) {
      currentActor = next;
      view.rerender(element());
    },
    requestAnother() {
      requestedRequest = { clientRequestId: 'request-another', requestId: 1 };
      view.rerender(element());
    },
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
});

describe('localized Opportunity outcome and history', () => {
  it('offers the existing status change and empty history in Romanian', async () => {
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
      await screen.findByRole('button', { name: 'Schimbă starea' }),
    ).toBeVisible();
    expect(
      screen.getByRole('heading', { name: 'Istoricul stărilor' }),
    ).toBeVisible();
    expect(
      screen.getByText('Nu există încă schimbări de stare înregistrate.'),
    ).toBeVisible();
  });

  it('preserves a loss draft, required Other note, exact uncertain retry and older-history recovery through four languages', async () => {
    let saved = initialRequest();
    const commands: Command[] = [];
    let olderReads = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof fetch>(async (input, init) => {
        const path = String(input);
        if (init?.method === 'POST') {
          commands.push({
            path,
            body: init.body,
            key: new Headers(init.headers).get('idempotency-key'),
            company: new Headers(init.headers).get('x-company-context-id'),
          });
          if (commands.length === 1) return new Response(null, { status: 503 });
          saved = buildClientRequest({
            ...saved,
            initialOpportunity: {
              ...saved.initialOpportunity,
              status: 'LOST',
              statusEnteredAt: lost.changedAt,
              version: 4,
              outcomeHistory: {
                entries: [lost, resumed],
                nextCursor: 'older-2',
              },
            },
          });
          return Response.json({
            receipt: {
              opportunityId: 'opportunity-1',
              previousStatus: 'OPEN',
              status: 'LOST',
              version: 4,
            },
            request: saved,
          });
        }
        if (path.includes('outcome-history?cursor=older-2')) {
          olderReads += 1;
          return olderReads === 1
            ? new Response(null, { status: 503 })
            : Response.json({ entries: [held] });
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
      await screen.findByRole('button', { name: 'Schimbă starea' }),
    );
    selectOption(
      screen.getByRole('combobox', { name: locales[0].transition }),
      'lose',
    );
    selectOption(
      screen.getByRole('combobox', { name: locales[0].loss }),
      'OTHER',
    );
    fireEvent.click(screen.getByRole('button', { name: locales[0].save }));
    expect(await screen.findByText(locales[0].validation)).toBeVisible();
    for (const locale of locales) {
      changeLocale(locale.code);
      expect(screen.getByText(locale.validation)).toBeVisible();
      expect(
        screen.getByRole('combobox', { name: locale.transition }),
      ).toHaveTextContent(locale.lose);
      expect(
        screen.getByRole('combobox', { name: locale.loss }),
      ).toHaveTextContent(locale.other);
      expect(screen.getByRole('textbox', { name: locale.note })).toHaveValue(
        '',
      );
      expect(commands).toHaveLength(0);
    }
    fireEvent.change(screen.getByRole('textbox', { name: locales[3].note }), {
      target: { value: literalNote },
    });
    for (const locale of locales) {
      changeLocale(locale.code);
      expect(screen.getByRole('textbox', { name: locale.note })).toHaveValue(
        literalNote,
      );
    }
    fireEvent.click(screen.getByRole('button', { name: locales[3].save }));
    expect(await screen.findByText(locales[3].uncertain)).toBeVisible();
    for (const locale of locales) {
      changeLocale(locale.code);
      expect(screen.getByText(locale.uncertain)).toBeVisible();
      expect(screen.getByRole('textbox', { name: locale.note })).toHaveValue(
        literalNote,
      );
      expect(screen.getByRole('textbox', { name: locale.note })).toBeDisabled();
      expect(
        screen.getByRole('combobox', { name: locale.transition }),
      ).toHaveTextContent(locale.lose);
      expect(
        screen.getByRole('combobox', { name: locale.loss }),
      ).toHaveTextContent(locale.other);
      expect(screen.getByRole('button', { name: locale.retry })).toBeEnabled();
      expect(commands).toHaveLength(1);
      expect(olderReads).toBe(0);
    }
    fireEvent.click(screen.getByRole('button', { name: locales[3].retry }));
    expect(await screen.findByText(locales[3].success)).toBeVisible();
    expect(commands).toHaveLength(2);
    expect(commands[1]).toEqual(commands[0]);
    expect(commands[0]).toMatchObject({
      path: '/api/commercial-intake/opportunities/opportunity-1/outcome',
      company: 'company-1',
      body: JSON.stringify({
        expectedVersion: 3,
        status: 'LOST',
        lossReasonCode: 'OTHER',
        note: literalNote,
      }),
    });
    expect(commands[0]?.key).toEqual(expect.any(String));
    expect(commands[0]?.key).not.toBe('');
    fireEvent.click(screen.getByRole('button', { name: locales[3].older }));
    expect(await screen.findByText(locales[3].olderError)).toBeVisible();
    for (const locale of locales) {
      changeLocale(locale.code);
      expect(screen.getByText(locale.success)).toBeVisible();
      expect(screen.getByText(locale.olderError)).toBeVisible();
      const history = screen.getByRole('list', { name: locale.history });
      expect(within(history).getAllByRole('listitem')).toHaveLength(2);
      expect(within(history).getByText(locale.lost)).toBeVisible();
      expect(within(history).getByText(locale.resumed)).toBeVisible();
      expect(history).toHaveTextContent('Ana {nume} / Имя');
      expect(history).toHaveTextContent('{Motiv} / Причина păstrată');
      const time = history.querySelector('time');
      expect(time).toHaveAttribute('datetime', '2026-09-23T10:00:00.000Z');
      expect(time).toHaveTextContent(locale.date);
      expect(olderReads).toBe(1);
    }
    fireEvent.click(screen.getByRole('button', { name: locales[3].older }));
    expect(
      await screen.findByText(/Așteaptă \{bugetul\} \/ бюджет/u),
    ).toBeVisible();
    for (const locale of locales) {
      changeLocale(locale.code);
      const rows = within(
        screen.getByRole('list', { name: locale.history }),
      ).getAllByRole('listitem');
      expect(rows).toHaveLength(3);
      expect(rows[0]).toHaveTextContent(locale.lost);
      expect(rows[1]).toHaveTextContent(locale.resumed);
      expect(rows[2]).toHaveTextContent(locale.hold);
      expect(rows[2]).toHaveTextContent('Așteaptă {bugetul} / бюджет');
      expect(olderReads).toBe(2);
      expect(commands).toHaveLength(2);
      expect(
        screen.queryByRole('button', { name: locale.older }),
      ).not.toBeInTheDocument();
    }
  });

  it('preserves required reason text and the protected Request notice through all four languages', async () => {
    const saved = initialRequest();
    const reads: string[] = [];
    const commands: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof fetch>(async (input, init) => {
        if (init?.method === 'POST') commands.push(String(input));
        else reads.push(String(input));
        return Response.json(
          String(input).includes('?limit=25')
            ? { items: [requestListItemFor(saved)] }
            : saved,
        );
      }),
    );
    const view = renderWorkspace();
    fireEvent.click(
      await screen.findByRole('button', { name: /Solicitare \{originală\}/u }),
    );
    fireEvent.click(
      await screen.findByRole('button', { name: locales[0].change }),
    );
    selectOption(
      screen.getByRole('combobox', { name: locales[0].transition }),
      'hold',
    );
    fireEvent.click(screen.getByRole('button', { name: locales[0].save }));
    expect(await screen.findByText(locales[0].validation)).toBeVisible();
    fireEvent.change(screen.getByRole('textbox', { name: locales[0].reason }), {
      target: { value: literalReason },
    });
    view.requestAnother();
    for (const locale of locales) {
      changeLocale(locale.code);
      expect(screen.getByText(locale.notice)).toBeVisible();
      expect(screen.getByRole('textbox', { name: locale.reason })).toHaveValue(
        literalReason,
      );
      expect(
        screen.getByRole('combobox', { name: locale.transition }),
      ).toHaveTextContent(locale.putOnHold);
      expect(commands).toHaveLength(0);
      expect(reads).not.toContain(
        '/api/commercial-intake/requests/request-another',
      );
    }
  });

  it('reacts to lost outcome authority in each language and never revives or resends the retired draft', async () => {
    const saved = initialRequest();
    const fetchMock = vi.fn<typeof fetch>(async (input) =>
      Response.json(
        String(input).includes('?limit=25')
          ? { items: [requestListItemFor(saved)] }
          : saved,
      ),
    );
    vi.stubGlobal('fetch', fetchMock);
    const view = renderWorkspace();
    fireEvent.click(
      await screen.findByRole('button', { name: /Solicitare \{originală\}/u }),
    );
    fireEvent.click(
      await screen.findByRole('button', { name: locales[0].change }),
    );
    selectOption(
      screen.getByRole('combobox', { name: locales[0].transition }),
      'hold',
    );
    fireEvent.change(screen.getByRole('textbox', { name: locales[0].reason }), {
      target: { value: literalReason },
    });
    if (!actor.activeCompany)
      throw new Error('Synthetic actor requires a Company');
    view.selectActor({
      ...actor,
      activeCompany: {
        ...actor.activeCompany,
        opportunityManagerPermissions: [],
        opportunityManagerPermissionAssignmentId: undefined,
        opportunityManagerPermissionSetVersion: undefined,
      },
    });
    expect(await screen.findByText(locales[0].denied)).toBeVisible();
    const readCount = fetchMock.mock.calls.length;
    for (const locale of locales) {
      changeLocale(locale.code);
      expect(screen.getByText(locale.denied)).toBeVisible();
      expect(
        screen.queryByRole('textbox', { name: locale.reason }),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole('button', { name: locale.change }),
      ).not.toBeInTheDocument();
      expect(fetchMock).toHaveBeenCalledTimes(readCount);
    }
    view.selectActor(actor);
    fireEvent.click(
      await screen.findByRole('button', { name: locales[3].change }),
    );
    expect(
      screen.queryByRole('textbox', { name: locales[3].reason }),
    ).not.toBeInTheDocument();
    expect(
      fetchMock.mock.calls.filter(([, init]) => init?.method === 'POST'),
    ).toHaveLength(0);
  });

  it('keeps a stale outcome blocked through all locales until explicit Request reload', async () => {
    const saved = initialRequest();
    let detailReads = 0;
    const commands: Array<BodyInit | null | undefined> = [];
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof fetch>(async (input, init) => {
        if (init?.method === 'POST') {
          commands.push(init.body);
          return new Response(null, { status: 409 });
        }
        if (String(input).includes('?limit=25'))
          return Response.json({ items: [requestListItemFor(saved)] });
        detailReads += 1;
        return Response.json(saved);
      }),
    );
    renderWorkspace();
    fireEvent.click(
      await screen.findByRole('button', { name: /Solicitare \{originală\}/u }),
    );
    fireEvent.click(
      await screen.findByRole('button', { name: locales[0].change }),
    );
    selectOption(
      screen.getByRole('combobox', { name: locales[0].transition }),
      'hold',
    );
    fireEvent.change(screen.getByRole('textbox', { name: locales[0].reason }), {
      target: { value: literalReason },
    });
    fireEvent.click(screen.getByRole('button', { name: locales[0].save }));
    expect(await screen.findByText(locales[0].conflict)).toBeVisible();
    for (const locale of locales) {
      changeLocale(locale.code);
      expect(screen.getByText(locale.conflict)).toBeVisible();
      expect(screen.getByRole('button', { name: locale.reload })).toBeEnabled();
      expect(
        screen.queryByRole('button', { name: locale.change }),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole('button', { name: locale.retry }),
      ).not.toBeInTheDocument();
      expect(commands).toHaveLength(1);
      expect(detailReads).toBe(1);
    }
    expect(commands[0]).toBe(
      JSON.stringify({
        expectedVersion: 3,
        status: 'ON_HOLD',
        reason: literalReason,
      }),
    );
    fireEvent.click(screen.getByRole('button', { name: locales[3].reload }));
    expect(
      await screen.findByRole('button', { name: locales[3].change }),
    ).toBeVisible();
    expect(detailReads).toBe(2);
    expect(commands).toHaveLength(1);
  });
});
