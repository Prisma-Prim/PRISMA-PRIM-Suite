import type { ActorContext } from '../access-types';
import { baseActor } from '../production-shell/production-shell-context.test-fixtures';
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
import {
  InterfaceLocaleProvider,
  interfaceLocaleStorageKey,
  useInterfaceLocale,
  type InterfaceLocale,
} from '../localization/interface-locale';
import {
  historyCompanies,
  historyDetail,
  historyEvents,
  historyFirst,
  historyOriginalReason,
  historyProjection,
  historyReversalReason,
  historySecond,
  historySourceList,
  unionHistoryLocaleCases,
  type UnionHistoryLocaleCase,
} from '../test/client-union-history-localization.fixture';
import { ClientUnionPanel } from './ClientUnionPanel';

type PanelProps = Parameters<typeof ClientUnionPanel>[0];

function LocaleChoices() {
  const { changeLocale } = useInterfaceLocale();
  return (
    <div>
      {unionHistoryLocaleCases.map(({ code }) => (
        <button key={code} type="button" onClick={() => changeLocale(code)}>
          Use {code}
        </button>
      ))}
    </div>
  );
}

function response({
  value,
  status = 200,
}: {
  value: unknown;
  status?: number;
}) {
  return new Response(JSON.stringify(value), { status });
}

function deferred<T>() {
  let accept: ((value: T) => void) | undefined;
  let refuse: ((reason: Error) => void) | undefined;
  const promise = new Promise<T>((resolve, reject) => {
    accept = resolve;
    refuse = reject;
  });
  return {
    promise,
    resolve(value: T) {
      if (!accept) throw new Error('Expected a pending public response.');
      accept(value);
    },
    reject(reason: Error) {
      if (!refuse) throw new Error('Expected a pending public response.');
      refuse(reason);
    },
  };
}

function renderJourney({
  storedLocale = 'en',
  onChanged = vi.fn(async () => undefined),
}: {
  storedLocale?: string;
  onChanged?: PanelProps['onChanged'];
} = {}) {
  localStorage.setItem(interfaceLocaleStorageKey, storedLocale);
  const props = {
    clientId: undefined,
    companyContextId: historyCompanies[0].id,
    identity: deterministicBrowserIdentity(),
    canResolve: true,
    onChanged,
    onOpenCanonical: vi.fn(),
    onConfirmed: vi.fn(),
    onCompanyContextRejected: vi.fn(),
    onActorRevalidated: vi.fn(),
    onWorkspaceAccessRejected: vi.fn(),
  } satisfies PanelProps;
  function tree(nextProps: PanelProps) {
    return (
      <InterfaceLocaleProvider>
        <LocaleChoices />
        <ClientUnionPanel {...nextProps} />
      </InterfaceLocaleProvider>
    );
  }
  const rendered = render(tree(props));
  return {
    props,
    rerender(nextProps: PanelProps) {
      rendered.rerender(tree(nextProps));
    },
  };
}

async function chooseLocale(code: InterfaceLocale) {
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: `Use ${code}` }));
  });
}

function englishCase() {
  const value = unionHistoryLocaleCases.find(({ code }) => code === 'en');
  if (!value) throw new Error('Expected English public fixture.');
  return value;
}

async function discover({ copy }: { copy: UnionHistoryLocaleCase }) {
  fireEvent.click(screen.getByRole('button', { name: copy.sources }));
  fireEvent.click(
    await screen.findByRole('button', { name: historySecond.displayName }),
  );
  await screen.findByText(copy.confirmedAction);
}

async function openDetail({ copy }: { copy: UnionHistoryLocaleCase }) {
  await discover({ copy });
  fireEvent.click(screen.getByRole('button', { name: copy.details }));
  return screen.findByRole('form', { name: copy.reverse });
}

function historyFetcher() {
  return vi
    .fn()
    .mockResolvedValueOnce(response({ value: historySourceList }))
    .mockResolvedValueOnce(response({ value: historyEvents }));
}

function fillReversal({
  form,
  copy,
}: {
  form: HTMLElement;
  copy: UnionHistoryLocaleCase;
}) {
  fireEvent.change(within(form).getByRole('textbox', { name: copy.reason }), {
    target: { value: historyReversalReason },
  });
  fireEvent.click(within(form).getByRole('checkbox'));
}

describe('localized Client union history public states', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('falls back to Romanian without issuing a read on entry', () => {
    const fetcher = vi.fn();
    vi.stubGlobal('fetch', fetcher);
    renderJourney({ storedLocale: 'unsupported' });
    expect(
      screen.getByRole('region', {
        name: 'Unirea controlată a Clienților',
      }),
    ).toBeVisible();
    expect(fetcher).not.toHaveBeenCalled();
  });

  for (const copy of unionHistoryLocaleCases) {
    it(`keeps pending source/history reads and a loaded source node across locale changes in ${copy.code}`, async () => {
      const source = deferred<Response>();
      const history = deferred<Response>();
      const fetcher = vi
        .fn()
        .mockReturnValueOnce(source.promise)
        .mockReturnValueOnce(history.promise);
      vi.stubGlobal('fetch', fetcher);
      const { props } = renderJourney();
      fireEvent.click(
        screen.getByRole('button', { name: 'Superseded Client history' }),
      );
      await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1));
      await chooseLocale(copy.code);
      expect(screen.getByRole('status')).toHaveTextContent(copy.loading);
      await act(async () =>
        source.resolve(response({ value: historySourceList })),
      );
      const sourceButton = await screen.findByRole('button', {
        name: historySecond.displayName,
      });
      sourceButton.focus();
      await chooseLocale(copy.code === 'ro' ? 'fr' : 'ro');
      await chooseLocale(copy.code);
      expect(
        screen.getByRole('button', { name: historySecond.displayName }),
      ).toBe(sourceButton);
      expect(sourceButton).toHaveFocus();
      expect(fetcher).toHaveBeenCalledTimes(1);
      fireEvent.click(sourceButton);
      await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2));
      await chooseLocale(copy.code === 'ro' ? 'fr' : 'ro');
      await chooseLocale(copy.code);
      expect(screen.getByRole('status')).toHaveTextContent(copy.loading);
      await act(async () =>
        history.resolve(response({ value: historyEvents })),
      );
      expect(await screen.findByText(copy.confirmedAction)).toBeVisible();
      expect(screen.getByText(copy.reversedAction)).toBeVisible();
      expect(fetcher).toHaveBeenCalledTimes(2);
      expect(props.onChanged).not.toHaveBeenCalled();
      expect(props.onOpenCanonical).not.toHaveBeenCalled();
    });

    it(`keeps redacted history ordered and private in ${copy.code}`, async () => {
      const fetcher = historyFetcher();
      vi.stubGlobal('fetch', fetcher);
      const { props } = renderJourney();
      await discover({ copy: englishCase() });
      const requests = fetcher.mock.calls.slice();
      await chooseLocale(copy.code);
      const panel = screen.getByRole('region', { name: copy.title });
      expect(
        within(panel)
          .getAllByRole('listitem')
          .map((item) => item.querySelector('span')?.textContent),
      ).toEqual([copy.reversedAction, copy.confirmedAction]);
      expect(
        within(panel).getAllByRole('button', {
          name: copy.details,
        }),
      ).toHaveLength(1);
      expect(panel.querySelector('time')).not.toBeInTheDocument();
      expect(panel.textContent).not.toMatch(
        /PRIVATE|redacted-projection|scope=B|not-returned/,
      );
      expect(fetcher.mock.calls).toEqual(requests);
      expect(props.onOpenCanonical).not.toHaveBeenCalled();
      expect(props.onConfirmed).not.toHaveBeenCalled();
    });

    it(`renders a late authorized detail and retained validation in ${copy.code}`, async () => {
      const detail = deferred<Response>();
      const fetcher = historyFetcher().mockReturnValueOnce(detail.promise);
      vi.stubGlobal('fetch', fetcher);
      renderJourney();
      await discover({ copy: englishCase() });
      fireEvent.click(
        screen.getByRole('button', {
          name: 'View authorized union details',
        }),
      );
      await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(3));
      await chooseLocale(copy.code);
      await act(async () =>
        detail.resolve(
          response({
            value: {
              ...historyDetail,
              operationId: 'PRIVATE operation',
              identityBasis: 'PRIVATE identity basis',
              contactSources: ['PRIVATE Contact sources'],
            },
          }),
        ),
      );
      const form = await screen.findByRole('form', { name: copy.reverse });
      expect(screen.getByRole('heading', { name: copy.heading })).toBeVisible();
      expect(screen.getAllByRole('article')[0]).toHaveTextContent(copy.version);
      expect(screen.getAllByRole('article')[1]).toHaveTextContent(copy.absent);
      expect(
        screen.getByRole('region', { name: copy.title }).textContent,
      ).not.toMatch(/PRIVATE/);
      fireEvent.submit(form);
      const reason = within(form).getByRole('textbox', { name: copy.reason });
      const acknowledgement = within(form).getByRole('checkbox');
      expect(reason).toHaveAttribute('aria-invalid', 'true');
      expect(reason).toHaveAccessibleDescription(copy.incomplete);
      expect(acknowledgement).toHaveAccessibleDescription(copy.incomplete);
      const validation = within(form).getByRole('alert');
      await chooseLocale(copy.code === 'ro' ? 'fr' : 'ro');
      expect(within(form).getByRole('alert')).toBe(validation);
      expect(reason).toHaveAttribute('aria-invalid', 'true');
      await chooseLocale(copy.code);
      expect(validation).toHaveTextContent(copy.incomplete);
      fillReversal({ form, copy });
      reason.focus();
      const requests = fetcher.mock.calls.slice();
      await chooseLocale(copy.code === 'ro' ? 'fr' : 'ro');
      await chooseLocale(copy.code);
      expect(reason).toHaveFocus();
      expect(reason).toHaveValue(historyReversalReason);
      expect(acknowledgement).toBeChecked();
      expect(screen.getByRole('form', { name: copy.reverse })).toBe(form);
      expect(fetcher.mock.calls).toEqual(requests);
      expect(
        screen.getByText(historyOriginalReason, {
          normalizer: (value) => value,
        }).textContent,
      ).toBe(historyOriginalReason);
    });

    it(`keeps an exact uncertain retry and a confirmed reversal after late refresh failure in ${copy.code}`, async () => {
      const reversal = deferred<Response>();
      const refresh = deferred<void>();
      const onChanged = vi.fn(() => refresh.promise);
      const fetcher = historyFetcher()
        .mockResolvedValueOnce(response({ value: historyDetail }))
        .mockReturnValueOnce(reversal.promise)
        .mockResolvedValueOnce(
          response({
            value: {
              outcome: 'reversed',
              clientIds: [historyFirst.id, historySecond.id],
            },
            status: 201,
          }),
        );
      vi.stubGlobal('fetch', fetcher);
      const { props } = renderJourney({ onChanged });
      const form = await openDetail({ copy: englishCase() });
      fillReversal({ form, copy: englishCase() });
      fireEvent.submit(form);
      await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(4));
      await chooseLocale(copy.code);
      expect(
        within(form).getByRole('button', { name: copy.pending }),
      ).toBeDisabled();
      expect(fetcher).toHaveBeenCalledTimes(4);
      await act(async () =>
        reversal.resolve(response({ value: {}, status: 503 })),
      );
      expect(await within(form).findByRole('alert')).toHaveTextContent(
        copy.uncertain,
      );
      expect(
        within(form).getByRole('textbox', { name: copy.reason }),
      ).toHaveValue(historyReversalReason);
      expect(within(form).getByRole('checkbox')).toBeChecked();
      await chooseLocale(copy.code === 'ro' ? 'fr' : 'ro');
      await chooseLocale(copy.code);
      expect(fetcher).toHaveBeenCalledTimes(4);
      fireEvent.click(within(form).getByRole('button', { name: copy.retry }));
      expect(await screen.findByText(copy.confirmed)).toBeVisible();
      expect(fetcher).toHaveBeenCalledTimes(5);
      expect(fetcher.mock.calls[3]?.[0]).toBe(
        `/api/client-union-operations/${encodeURIComponent(historyProjection)}/reversal`,
      );
      expect(fetcher.mock.calls[4]?.[1]).toEqual(
        expect.objectContaining({
          method: 'POST',
          body: fetcher.mock.calls[3]?.[1].body,
          headers: fetcher.mock.calls[3]?.[1].headers,
        }),
      );
      expect(JSON.parse(fetcher.mock.calls[3]?.[1].body)).toEqual({
        reason: '  Restabilește / восстановить\nA și B separat.  ',
        companyIds: ['company-b-712', 'company-a-712'],
      });
      expect(fetcher.mock.calls[3]?.[1].headers['x-company-context-id']).toBe(
        'company-b-712',
      );
      expect(
        fetcher.mock.calls[3]?.[1].headers['idempotency-key'],
      ).toBeTruthy();
      await chooseLocale(copy.code === 'ro' ? 'fr' : 'ro');
      await chooseLocale(copy.code);
      await act(async () => refresh.reject(new Error('Refresh failed.')));
      expect(await screen.findByRole('alert')).toHaveTextContent(copy.refresh);
      expect(screen.getByText(copy.confirmed)).toBeVisible();
      expect(screen.queryByText(copy.uncertain)).not.toBeInTheDocument();
      expect(onChanged).toHaveBeenCalledWith();
      expect(onChanged).toHaveBeenCalledTimes(1);
      expect(props.onConfirmed).not.toHaveBeenCalled();
      fireEvent.click(screen.getByRole('button', { name: copy.close }));
      expect(screen.queryByText(copy.refresh)).not.toBeInTheDocument();
    });

    it.each([403, 404, 409])(
      `clears a late %s reversal response safely in ${copy.code}`,
      async (status) => {
        const reversal = deferred<Response>();
        const fetcher = historyFetcher()
          .mockResolvedValueOnce(response({ value: historyDetail }))
          .mockReturnValueOnce(reversal.promise)
          .mockResolvedValue(
            response({
              value: {
                ...baseActor,
                workspacePermissions: [],
                activeCompany: historyCompanies[0],
              } satisfies ActorContext,
            }),
          );
        vi.stubGlobal('fetch', fetcher);
        const { props } = renderJourney();
        const form = await openDetail({ copy: englishCase() });
        fillReversal({ form, copy: englishCase() });
        fireEvent.submit(form);
        await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(4));
        await chooseLocale(copy.code);
        await act(async () =>
          reversal.resolve(response({ value: {}, status })),
        );
        expect(await screen.findByRole('alert')).toHaveTextContent(
          status === 409 ? copy.stale : copy.unavailable,
        );
        expect(
          screen.queryByRole('form', { name: copy.reverse }),
        ).not.toBeInTheDocument();
        expect(
          screen.queryByText(historyOriginalReason, {
            normalizer: (value) => value,
          }),
        ).not.toBeInTheDocument();
        expect(props.onChanged).not.toHaveBeenCalled();
        expect(props.onConfirmed).not.toHaveBeenCalled();
        expect(fetcher).toHaveBeenCalledTimes(status === 403 ? 5 : 4);
        if (status === 403)
          expect(props.onActorRevalidated).toHaveBeenCalledTimes(1);
      },
    );

    it(`distinguishes source and history empty/failure states in ${copy.code}`, async () => {
      const fetcher = vi
        .fn()
        .mockResolvedValueOnce(response({ value: [] }))
        .mockResolvedValueOnce(response({ value: {}, status: 503 }))
        .mockResolvedValueOnce(response({ value: {}, status: 404 }))
        .mockResolvedValueOnce(response({ value: historySourceList }))
        .mockResolvedValueOnce(
          response({ value: { events: [], detailReferences: [] } }),
        );
      vi.stubGlobal('fetch', fetcher);
      renderJourney({ storedLocale: copy.code });
      fireEvent.click(screen.getByRole('button', { name: copy.sources }));
      expect(await screen.findByText(copy.noSources)).toBeVisible();
      fireEvent.click(screen.getByRole('button', { name: copy.sources }));
      expect(await screen.findByRole('alert')).toHaveTextContent(copy.error);
      fireEvent.click(screen.getByRole('button', { name: copy.sources }));
      expect(await screen.findByRole('alert')).toHaveTextContent(
        copy.unavailable,
      );
      fireEvent.click(screen.getByRole('button', { name: copy.sources }));
      fireEvent.click(
        await screen.findByRole('button', { name: historySecond.displayName }),
      );
      expect(await screen.findByText(copy.noHistory)).toBeVisible();
      expect(fetcher).toHaveBeenCalledTimes(5);
    });

    it.each(['blocked', 'reversed'])(
      `keeps %s detail and literal reversal attribution safe in ${copy.code}`,
      async (state) => {
        const value =
          state === 'blocked'
            ? { ...historyDetail, canReverse: false }
            : {
                ...historyDetail,
                state: 'reversed',
                canReverse: false,
                reversal: {
                  reason: '  Separat / раздельно\n{literal}  ',
                  actor: { displayName: 'Reversing actor / Я' },
                  occurredAt: '2026-01-28T01:15:00.000Z',
                },
              };
        const fetcher = historyFetcher().mockResolvedValueOnce(
          response({ value }),
        );
        vi.stubGlobal('fetch', fetcher);
        renderJourney({ storedLocale: copy.code });
        await discover({ copy });
        fireEvent.click(screen.getByRole('button', { name: copy.details }));
        await screen.findByRole('heading', { name: copy.heading });
        expect(
          screen.queryByRole('form', { name: copy.reverse }),
        ).not.toBeInTheDocument();
        if (state === 'blocked') {
          expect(screen.getByText(copy.blocked)).toBeVisible();
          expect(
            screen.getByRole('button', { name: copy.openCanonical }),
          ).toBeVisible();
        } else {
          expect(
            screen.getByText('  Separat / раздельно\n{literal}  ', {
              normalizer: (text) => text,
            }).textContent,
          ).toBe('  Separat / раздельно\n{literal}  ');
          expect(
            screen.queryByRole('button', { name: copy.openCanonical }),
          ).not.toBeInTheDocument();
          expect(
            screen.getByText('Reversing actor / Я', { exact: false }),
          ).toBeVisible();
        }
      },
    );
  }

  it.each([
    {
      events: [{ action: 'unknown', projectionReference: 'p', companyId: 'c' }],
      detailReferences: [],
    },
    { events: 'PRIVATE malformed events', detailReferences: [] },
    { ...historyDetail, state: 'unknown' },
    { ...historyDetail, originals: [historyFirst, historyFirst] },
    {
      ...historyDetail,
      originals: [
        {
          ...historyFirst,
          contacts: [{ name: 'X', decisionRoles: ['unknown'] }],
        },
        historySecond,
      ],
    },
  ])(
    'retains safe failure for malformed history or detail %#',
    async (malformed) => {
      const isHistory = 'events' in malformed;
      const fetcher = vi
        .fn()
        .mockResolvedValueOnce(response({ value: historySourceList }))
        .mockResolvedValueOnce(
          response({ value: isHistory ? malformed : historyEvents }),
        )
        .mockResolvedValueOnce(response({ value: malformed }));
      vi.stubGlobal('fetch', fetcher);
      renderJourney();
      fireEvent.click(
        screen.getByRole('button', { name: 'Superseded Client history' }),
      );
      fireEvent.click(
        await screen.findByRole('button', { name: historySecond.displayName }),
      );
      if (!isHistory) {
        fireEvent.click(
          await screen.findByRole('button', {
            name: 'View authorized union details',
          }),
        );
      }
      await screen.findByRole('alert');
      await chooseLocale('ro');
      expect(screen.getByRole('alert')).toHaveTextContent(
        'Cererea nu a putut fi finalizată. Poți reîncerca în siguranță.',
      );
      expect(
        screen.queryByRole('form', { name: 'Inversează unirea' }),
      ).not.toBeInTheDocument();
      expect(document.body.textContent).not.toMatch(/PRIVATE/);
    },
  );

  it.each(['Client', 'Company', 'identity', 'authority', 'Close'])(
    'suppresses a late detail after real %s retirement following a locale-only change',
    async (boundary) => {
      const late = deferred<Response>();
      const fetcher = historyFetcher().mockReturnValueOnce(late.promise);
      vi.stubGlobal('fetch', fetcher);
      const journey = renderJourney();
      await discover({ copy: englishCase() });
      fireEvent.click(
        screen.getByRole('button', { name: 'View authorized union details' }),
      );
      await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(3));
      await chooseLocale('fr');
      expect(fetcher.mock.calls[2]?.[1].signal.aborted).toBe(false);
      if (boundary === 'Close') {
        fireEvent.click(
          screen.getByRole('button', { name: 'Fermer l’examen' }),
        );
      } else {
        journey.rerender({
          ...journey.props,
          clientId: boundary === 'Client' ? historyFirst.id : undefined,
          companyContextId:
            boundary === 'Company'
              ? 'another-company'
              : journey.props.companyContextId,
          identity:
            boundary === 'identity'
              ? deterministicBrowserIdentity()
              : journey.props.identity,
          canResolve: boundary !== 'authority',
        });
      }
      expect(fetcher.mock.calls[2]?.[1].signal.aborted).toBe(true);
      await act(async () => late.resolve(response({ value: historyDetail })));
      expect(
        screen.queryByRole('form', { name: 'Annuler l’union' }),
      ).not.toBeInTheDocument();
      expect(document.body.textContent).not.toContain(historyOriginalReason);
      expect(journey.props.onChanged).not.toHaveBeenCalled();
    },
  );

  it('uses a new command only after the literal uncertain intention changes', async () => {
    const fetcher = historyFetcher()
      .mockResolvedValueOnce(response({ value: historyDetail }))
      .mockResolvedValue(response({ value: {}, status: 503 }));
    vi.stubGlobal('fetch', fetcher);
    renderJourney();
    const form = await openDetail({ copy: englishCase() });
    fillReversal({ form, copy: englishCase() });
    fireEvent.submit(form);
    await within(form).findByRole('alert');
    await chooseLocale('ro');
    fireEvent.change(
      within(form).getByRole('textbox', { name: 'Motivul inversării' }),
      {
        target: { value: '  Alt motiv / другой\n{literal}  ' },
      },
    );
    fireEvent.submit(form);
    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(5));
    expect(fetcher.mock.calls[4]?.[1].body).toBe(
      JSON.stringify({
        reason: '  Alt motiv / другой\n{literal}  ',
        companyIds: ['company-b-712', 'company-a-712'],
      }),
    );
    expect(fetcher.mock.calls[4]?.[1].headers['idempotency-key']).not.toBe(
      fetcher.mock.calls[3]?.[1].headers['idempotency-key'],
    );
  });

  it.each(['Client', 'Company', 'identity', 'authority', 'Close'])(
    'suppresses a late reversal after %s retirement without cancelling server receipt',
    async (boundary) => {
      const late = deferred<Response>();
      const fetcher = historyFetcher()
        .mockResolvedValueOnce(response({ value: historyDetail }))
        .mockReturnValueOnce(late.promise);
      vi.stubGlobal('fetch', fetcher);
      const journey = renderJourney();
      const form = await openDetail({ copy: englishCase() });
      fillReversal({ form, copy: englishCase() });
      fireEvent.submit(form);
      await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(4));
      await chooseLocale('fr');
      expect(fetcher.mock.calls[3]?.[1].signal.aborted).toBe(false);
      if (boundary === 'Close') {
        fireEvent.click(
          screen.getByRole('button', { name: 'Fermer l’examen' }),
        );
      } else {
        journey.rerender({
          ...journey.props,
          clientId: boundary === 'Client' ? historyFirst.id : undefined,
          companyContextId:
            boundary === 'Company'
              ? 'another-company'
              : journey.props.companyContextId,
          identity:
            boundary === 'identity'
              ? deterministicBrowserIdentity()
              : journey.props.identity,
          canResolve: boundary !== 'authority',
        });
      }
      expect(fetcher.mock.calls[3]?.[1].signal.aborted).toBe(true);
      await act(async () =>
        late.resolve(
          response({
            value: {
              outcome: 'reversed',
              clientIds: [historyFirst.id, historySecond.id],
            },
            status: 201,
          }),
        ),
      );
      expect(
        screen.queryByRole('form', { name: 'Annuler l’union' }),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByText('Union annulée.', { exact: false }),
      ).not.toBeInTheDocument();
      expect(journey.props.onChanged).not.toHaveBeenCalled();
      expect(journey.props.onConfirmed).not.toHaveBeenCalled();
    },
  );

  it.each(['Close', 'Company'])(
    'does not revive a late refresh warning after %s',
    async (boundary) => {
      const refresh = deferred<void>();
      const fetcher = historyFetcher()
        .mockResolvedValueOnce(response({ value: historyDetail }))
        .mockResolvedValueOnce(
          response({
            value: {
              outcome: 'reversed',
              clientIds: [historyFirst.id, historySecond.id],
            },
            status: 201,
          }),
        );
      vi.stubGlobal('fetch', fetcher);
      const journey = renderJourney({
        onChanged: vi.fn(() => refresh.promise),
      });
      const form = await openDetail({ copy: englishCase() });
      fillReversal({ form, copy: englishCase() });
      fireEvent.submit(form);
      await screen.findByText(englishCase().confirmed);
      await chooseLocale('ro');
      if (boundary === 'Close') {
        fireEvent.click(
          screen.getByRole('button', { name: 'Închide revizuirea' }),
        );
      } else {
        journey.rerender({
          ...journey.props,
          companyContextId: 'other-company',
        });
      }
      await act(async () => refresh.reject(new Error('Obsolete refresh.')));
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
      expect(
        screen.queryByText('Unirea a fost inversată.', { exact: false }),
      ).not.toBeInTheDocument();
    },
  );
});
