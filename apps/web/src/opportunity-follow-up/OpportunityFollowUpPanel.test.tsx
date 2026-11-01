import { afterEach, expect, it, vi } from 'vitest';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '../test/render-with-interface-locale';
import type { ActorContext } from '../access-types';
import {
  OpportunityFollowUpPanel,
  type OpportunityFollowUpPanelProps,
} from './OpportunityFollowUpPanel';
import {
  actor,
  absent,
  recorded,
  fact,
  format,
  baseProps,
} from './follow-up.fixture';
import { useInterfaceLocale } from '../localization/interface-locale';
import { assertMessageCoverage } from '../localization/messages';
import { followUpMessages } from './follow-up.copy';
import type {
  FollowUpHead,
  FollowUpHistoryEntry,
  RecordedFollowUp,
} from './follow-up-contract';

const props: OpportunityFollowUpPanelProps = {
  ...baseProps,
  onProtectedChange: vi.fn(),
  onActorRevalidated: vi.fn(),
  onCompanyContextRejected: vi.fn(),
  onWorkspaceAccessRejected: vi.fn(),
};
afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
  vi.restoreAllMocks();
});

it('records an explicit undated declaration and reloads its attributed immutable history', async () => {
  const requests: RequestInit[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (_url: unknown, init?: RequestInit) => {
      if (init?.method === 'POST') {
        requests.push(init);
        return Response.json({
          format,
          opportunityId: 'opportunity-a',
          outcome: 'updated',
          fact,
        });
      }
      return Response.json(requests.length ? recorded : absent);
    }),
  );
  render(<OpportunityFollowUpPanel {...props} />);
  expect(await screen.findByText('No follow-up declaration.')).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: 'Record follow-up' }));
  fireEvent.click(screen.getByRole('button', { name: 'Save follow-up' }));
  expect(await screen.findByText('Follow-up saved.')).toBeVisible();
  expect(
    screen.getAllByText('Recorded without a date.').length,
  ).toBeGreaterThan(0);
  expect(screen.getAllByText('Ada · literal').length).toBeGreaterThan(0);
  expect(requests[0]?.body).toBe(
    '{"expectedRevision":0,"observedOpportunityVersion":3,"followUpOn":null,"reason":null}',
  );
});

it('preserves a stale intention for deliberate review and returns focus to the follow-up heading', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (_url: unknown, init?: RequestInit) =>
      init?.method === 'POST'
        ? Response.json({ code: 'STALE_VERSION' }, { status: 409 })
        : Response.json(absent),
    ),
  );
  render(<OpportunityFollowUpPanel {...props} />);
  fireEvent.click(
    await screen.findByRole('button', { name: 'Record follow-up' }),
  );
  fireEvent.change(screen.getByLabelText('Follow-up date (optional)'), {
    target: { value: '2026-11-15' },
  });
  const save = screen.getByRole('button', { name: 'Save follow-up' });
  save.focus();
  fireEvent.click(save);
  expect(
    await screen.findByText(
      'The Opportunity or follow-up changed. Reload and review before a new intent.',
    ),
  ).toBeVisible();
  expect(screen.getByLabelText('Follow-up date (optional)')).toHaveValue(
    '2026-11-15',
  );
  expect(
    screen.getByRole('heading', { name: 'Opportunity follow-up' }),
  ).toHaveFocus();
});

it('retains only the exact uncertain command for an explicit unchanged retry', async () => {
  const commands: RequestInit[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (_url: unknown, init?: RequestInit) => {
      if (init?.method === 'POST') {
        commands.push(init);
        return commands.length === 1
          ? new Response(null, { status: 503 })
          : Response.json({
              format,
              opportunityId: 'opportunity-a',
              outcome: 'updated',
              fact,
            });
      }
      return Response.json(commands.length > 1 ? recorded : absent);
    }),
  );
  render(<OpportunityFollowUpPanel {...props} />);
  fireEvent.click(
    await screen.findByRole('button', { name: 'Record follow-up' }),
  );
  fireEvent.click(screen.getByRole('button', { name: 'Save follow-up' }));
  const retry = await screen.findByRole('button', {
    name: 'Retry identical follow-up',
  });
  expect(screen.getByLabelText('Reason')).toBeDisabled();
  fireEvent.click(retry);
  expect(await screen.findByText('Follow-up saved.')).toBeVisible();
  expect(commands).toHaveLength(2);
  expect(commands[1]?.body).toBe(commands[0]?.body);
  expect(commands[1]?.headers).toEqual(commands[0]?.headers);
});

it('keeps a confirmed save confirmed when its refreshed read fails, then retries only the read', async () => {
  const commands: RequestInit[] = [];
  let postRead = 0;
  vi.stubGlobal(
    'fetch',
    vi.fn(async (_url: unknown, init?: RequestInit) => {
      if (init?.method === 'POST') {
        commands.push(init);
        return Response.json({
          format,
          opportunityId: 'opportunity-a',
          outcome: 'updated',
          fact,
        });
      }
      if (commands.length && postRead++ === 0)
        return new Response(null, { status: 503 });
      return Response.json(commands.length ? recorded : absent);
    }),
  );
  render(<OpportunityFollowUpPanel {...props} />);
  fireEvent.click(
    await screen.findByRole('button', { name: 'Record follow-up' }),
  );
  fireEvent.click(screen.getByRole('button', { name: 'Save follow-up' }));
  expect(
    await screen.findByText(
      'The save is confirmed; the refreshed read failed. Retry only the read.',
    ),
  ).toBeVisible();
  expect(screen.getByText('Follow-up saved.')).toBeVisible();
  expect(
    screen.queryByText('No follow-up declaration.'),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByRole('button', {
      name: /^(Record follow-up|Edit or reconfirm follow-up)$/u,
    }),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByRole('button', { name: 'Retry identical follow-up' }),
  ).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Reload follow-up' }));
  await waitFor(() =>
    expect(
      screen.queryByText(
        'The save is confirmed; the refreshed read failed. Retry only the read.',
      ),
    ).not.toBeInTheDocument(),
  );
  expect(
    await screen.findByRole('button', { name: 'Edit or reconfirm follow-up' }),
  ).toBeVisible();
  expect(commands).toHaveLength(1);
});

function deferred<T>() {
  let resolve: ((value: T) => void) | undefined;
  const promise = new Promise<T>((complete) => {
    resolve = complete;
  });
  return {
    promise,
    resolve(value: T) {
      if (!resolve) throw new Error('Deferred not initialized');
      resolve(value);
    },
  };
}

it('irreversibly retires a pending date command across A→B→A and suppresses its late failure', async () => {
  const pending = deferred<Response>();
  vi.stubGlobal(
    'fetch',
    vi.fn(async (_url: unknown, init?: RequestInit) =>
      init?.method === 'POST' ? pending.promise : Response.json(absent),
    ),
  );
  const view = render(<OpportunityFollowUpPanel {...props} />);
  fireEvent.click(
    await screen.findByRole('button', { name: 'Record follow-up' }),
  );
  fireEvent.change(screen.getByLabelText('Reason'), {
    target: { value: 'Transient private reason' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Save follow-up' }));
  await screen.findByText('Saving follow-up…');
  const otherActor: ActorContext = {
    ...actor,
    activeCompany: { ...actor.activeCompany, id: 'company-b' },
  };
  view.rerender(<OpportunityFollowUpPanel {...props} actor={otherActor} />);
  await screen.findByText('No follow-up declaration.');
  view.rerender(<OpportunityFollowUpPanel {...props} />);
  await screen.findByText('No follow-up declaration.');
  await act(async () => {
    pending.resolve(new Response(null, { status: 403 }));
  });
  expect(
    screen.queryByText('Transient private reason'),
  ).not.toBeInTheDocument();
  expect(screen.queryByText('Saving follow-up…')).not.toBeInTheDocument();
  expect(props.onActorRevalidated).not.toHaveBeenCalled();
  expect(props.onCompanyContextRejected).not.toHaveBeenCalled();
  expect(
    await screen.findByRole('button', { name: 'Record follow-up' }),
  ).toBeEnabled();
});

it.each(['capture replacement', 'equivalent Actor observation'])(
  'does not install an older full Actor recovery after %s',
  async (change) => {
    const recovery = deferred<Response>();
    let readingActor = false;
    let followUpReads = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string | URL | Request) => {
        if (String(url).includes('/access/current-actor')) {
          readingActor = true;
          return recovery.promise;
        }
        return ++followUpReads === 1
          ? new Response(null, { status: 403 })
          : Response.json(absent);
      }),
    );
    const view = render(<OpportunityFollowUpPanel {...props} />);
    await waitFor(() => expect(readingActor).toBe(true));
    const newerActor: ActorContext = {
      ...actor,
      activeCompany: {
        ...actor.activeCompany,
        opportunityFollowUpReadCapture:
          change === 'capture replacement'
            ? `opportunity-follow-up-read.v1.${'b'.repeat(64)}`
            : actor.activeCompany.opportunityFollowUpReadCapture,
      },
    };
    view.rerender(<OpportunityFollowUpPanel {...props} actor={newerActor} />);
    await screen.findByText(
      change === 'capture replacement'
        ? 'No follow-up declaration.'
        : 'Follow-up is no longer available with current access.',
    );
    await act(async () => {
      recovery.resolve(Response.json(actor));
    });
    expect(props.onActorRevalidated).not.toHaveBeenCalled();
    expect(props.onCompanyContextRejected).not.toHaveBeenCalled();
    if (change === 'capture replacement')
      expect(
        screen.queryByText(
          'Follow-up is no longer available with current access.',
        ),
      ).not.toBeInTheDocument();
  },
);

it('retires the pending intention on a native outcome observation while preserving unrelated work', async () => {
  const pending = deferred<Response>();
  let transitioned = false;
  vi.stubGlobal(
    'fetch',
    vi.fn(async (_url: unknown, init?: RequestInit) =>
      init?.method === 'POST'
        ? pending.promise
        : Response.json(
            transitioned
              ? {
                  ...absent,
                  opportunityVersion: 5,
                  outcomeEpoch: 'epoch-reopened',
                }
              : absent,
          ),
    ),
  );
  const view = render(
    <>
      <input aria-label="Native work" defaultValue="" />
      <OpportunityFollowUpPanel {...props} />
    </>,
  );
  fireEvent.change(screen.getByLabelText('Native work'), {
    target: { value: 'Unrelated text remains' },
  });
  fireEvent.click(
    await screen.findByRole('button', { name: 'Record follow-up' }),
  );
  fireEvent.change(screen.getByLabelText('Reason'), {
    target: { value: 'Retired intention' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Save follow-up' }));
  await screen.findByText('Saving follow-up…');
  transitioned = true;
  view.rerender(
    <>
      <input aria-label="Native work" defaultValue="" />
      <OpportunityFollowUpPanel
        {...props}
        nativeVersion={5}
        nativeOutcomeObservation="OPEN:reopened"
      />
    </>,
  );
  await screen.findByText('No follow-up declaration.');
  await act(async () => {
    pending.resolve(
      Response.json({
        format,
        opportunityId: 'opportunity-a',
        outcome: 'updated',
        fact,
      }),
    );
  });
  expect(screen.queryByText('Follow-up saved.')).not.toBeInTheDocument();
  expect(screen.getByLabelText('Native work')).toHaveValue(
    'Unrelated text remains',
  );
  expect(screen.queryByLabelText('Reason')).not.toBeInTheDocument();
});

it('offers read-only current/history in a held outcome and does not revive old confirmation', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () =>
      Response.json({
        ...recorded,
        status: 'ON_HOLD',
        outcomeEpoch: 'epoch-held',
      }),
    ),
  );
  render(
    <OpportunityFollowUpPanel
      {...props}
      nativeStatus="ON_HOLD"
      nativeOutcomeObservation="ON_HOLD:held"
    />,
  );
  expect(
    await screen.findByText(
      'Confirmation is no longer current. Explicitly reconfirm after resuming or reopening.',
    ),
  ).toBeVisible();
  expect(
    screen.getByText(
      'Follow-up can be changed only while the Opportunity is open.',
    ),
  ).toBeVisible();
  expect(
    screen.getByRole('heading', { name: 'Follow-up history' }),
  ).toBeVisible();
  expect(
    screen.queryByRole('button', { name: 'Edit or reconfirm follow-up' }),
  ).not.toBeInTheDocument();
});

it('shares one-open-editor arbitration and fetches nothing when its independent read is unavailable', async () => {
  const fetch = vi.fn(async () => Response.json(absent));
  vi.stubGlobal('fetch', fetch);
  const view = render(
    <OpportunityFollowUpPanel {...props} editorAvailable={false} />,
  );
  expect(
    await screen.findByRole('button', { name: 'Record follow-up' }),
  ).toBeDisabled();
  view.rerender(
    <OpportunityFollowUpPanel
      {...props}
      actor={{
        ...actor,
        activeCompany: {
          ...actor.activeCompany,
          opportunityFollowUpReadCapture: null,
        },
      }}
    />,
  );
  expect(
    screen.queryByRole('heading', { name: 'Opportunity follow-up' }),
  ).not.toBeInTheDocument();
  expect(fetch).toHaveBeenCalledTimes(1);
});

function LocaleControls() {
  const { changeLocale } = useInterfaceLocale();
  return (
    <>
      {(['ro', 'ru', 'fr', 'en'] satisfies ('ro' | 'ru' | 'fr' | 'en')[]).map(
        (locale) => (
          <button key={locale} onClick={() => changeLocale(locale)}>
            {locale}
          </button>
        ),
      )}
    </>
  );
}
it('preserves literal input, focus and a live owner through all four interface locales', async () => {
  const fetch = vi.fn(async () => Response.json(absent));
  vi.stubGlobal('fetch', fetch);
  assertMessageCoverage('followUp', followUpMessages);
  render(
    <>
      <LocaleControls />
      <OpportunityFollowUpPanel {...props} />
    </>,
  );
  fireEvent.click(
    await screen.findByRole('button', { name: 'Record follow-up' }),
  );
  const date = screen.getByLabelText('Follow-up date (optional)');
  const reason = screen.getByLabelText('Reason');
  fireEvent.change(date, { target: { value: '0001-01-01' } });
  fireEvent.change(reason, { target: { value: '  Vérification Я 📅  ' } });
  reason.focus();
  for (const locale of ['ro', 'ru', 'fr', 'en']) {
    fireEvent.click(
      screen.getByRole('button', { name: new RegExp(`^${locale}$`, 'u') }),
    );
    expect(date).toHaveValue('0001-01-01');
    expect(reason).toHaveValue('  Vérification Я 📅  ');
    expect(reason).toHaveFocus();
  }
  expect(fetch).toHaveBeenCalledTimes(1);
});

function completeHistory(count = 27) {
  const entries: FollowUpHistoryEntry[] = [];
  let before: FollowUpHead = { state: 'UNRECORDED', revision: 0 };
  for (let revision = 1; revision <= count; revision += 1) {
    const after: RecordedFollowUp = {
      ...fact,
      state: 'RECORDED',
      revision,
      followUpOn: revision % 2 === 0 ? '2026-11-15' : '2026-11-16',
    };
    entries.unshift({
      format,
      opportunityId: 'opportunity-a',
      revision,
      before,
      after,
      reason: revision === 1 ? null : `Reason ${revision}`,
      commandId: `command-${revision}`,
      actor: fact.recordedBy,
      occurredAt: fact.recordedAt,
    });
    before = after;
  }
  return { entries, head: before };
}

it('continues complete head-bound history and rejects a changed head until deliberate full reload', async () => {
  const { entries, head } = completeHistory();
  const current = {
    ...recorded,
    head,
    history: {
      ...recorded.history,
      headRevision: 27,
      entries: entries.slice(0, 25),
      nextCursor: 'history-cursor',
    },
  };
  const fresh = completeHistory(28);
  const refreshed = {
    ...current,
    head: fresh.head,
    history: {
      ...current.history,
      headRevision: 28,
      entries: fresh.entries.slice(0, 25),
      nextCursor: 'history-cursor-28',
    },
  };
  let reads = 0;
  let continuations = 0;
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string | URL | Request) => {
      if (String(url).includes('/history?'))
        return ++continuations === 1
          ? Response.json(
              { code: 'FOLLOW_UP_HISTORY_CHANGED' },
              { status: 409 },
            )
          : Response.json({
              ...refreshed.history,
              entries: fresh.entries.slice(25),
              nextCursor: null,
            });
      return Response.json(++reads === 1 ? current : refreshed);
    }),
  );
  render(<OpportunityFollowUpPanel {...props} />);
  fireEvent.click(
    await screen.findByRole('button', { name: 'Show older declarations' }),
  );
  expect(
    await screen.findByText(
      'History changed. Reload the complete follow-up to review.',
    ),
  ).toBeVisible();
  expect(
    screen.getByRole('button', { name: 'Show older declarations' }),
  ).toBeDisabled();
  expect(
    screen.queryByRole('button', { name: 'Edit or reconfirm follow-up' }),
  ).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Reload follow-up' }));
  expect(
    await screen.findByRole('button', { name: 'Edit or reconfirm follow-up' }),
  ).toBeEnabled();
  const older = await screen.findByRole('button', {
    name: 'Show older declarations',
  });
  fireEvent.click(older);
  expect(await screen.findByText('End of history.')).toBeVisible();
  expect(screen.getByText('Reason 2')).toBeVisible();
  expect(
    screen.getByRole('heading', { name: 'Follow-up history' }),
  ).toHaveFocus();
});

it('requires a literal reason for new-epoch reconfirmation even when the date remains null', async () => {
  const commands: RequestInit[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (_url: unknown, init?: RequestInit) => {
      if (init?.method === 'POST') {
        commands.push(init);
        return new Response(null, { status: 503 });
      }
      return Response.json({ ...recorded, outcomeEpoch: 'epoch-resumed' });
    }),
  );
  render(
    <OpportunityFollowUpPanel
      {...props}
      nativeOutcomeObservation="OPEN:resumed"
    />,
  );
  fireEvent.click(
    await screen.findByRole('button', { name: 'Edit or reconfirm follow-up' }),
  );
  fireEvent.click(screen.getByRole('button', { name: 'Save follow-up' }));
  expect(screen.getByLabelText('Reason')).toHaveAttribute(
    'aria-invalid',
    'true',
  );
  expect(commands).toHaveLength(0);
  fireEvent.change(screen.getByLabelText('Reason'), {
    target: { value: '  Reprendre Я 📅  ' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Save follow-up' }));
  await screen.findByRole('button', { name: 'Retry identical follow-up' });
  expect(commands[0]?.body).toBe(
    '{"expectedRevision":1,"observedOpportunityVersion":3,"followUpOn":null,"reason":"  Reprendre Я 📅  "}',
  );
});

it('keeps private uncertainty transient through locale changes, retirement and a cold remount', async () => {
  const navigation = [
    vi.spyOn(window.history, 'pushState'),
    vi.spyOn(window.history, 'replaceState'),
  ];
  const storage = vi.spyOn(Storage.prototype, 'setItem');
  const indexedOpen = vi.fn();
  const cacheOpen = vi.fn();
  vi.stubGlobal('indexedDB', { open: indexedOpen });
  vi.stubGlobal('caches', { open: cacheOpen });
  const commands: RequestInit[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (_url: unknown, init?: RequestInit) => {
      if (init?.method === 'POST') {
        commands.push(init);
        return new Response(null, { status: 503 });
      }
      return Response.json(absent);
    }),
  );
  const beforeUrl = window.location.href;
  const view = render(
    <>
      <LocaleControls />
      <OpportunityFollowUpPanel {...props} />
    </>,
  );
  fireEvent.click(
    await screen.findByRole('button', { name: 'Record follow-up' }),
  );
  fireEvent.change(screen.getByLabelText('Follow-up date (optional)'), {
    target: { value: '2031-12-29' },
  });
  fireEvent.change(screen.getByLabelText('Reason'), {
    target: { value: 'Literal private intent 📅' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Save follow-up' }));
  await screen.findByRole('button', { name: 'Retry identical follow-up' });
  fireEvent.click(screen.getByRole('button', { name: /^fr$/u }));
  expect(screen.getByLabelText('Motif')).toHaveValue(
    'Literal private intent 📅',
  );
  view.rerender(
    <>
      <LocaleControls />
      <OpportunityFollowUpPanel
        {...props}
        actor={{
          ...actor,
          activeCompany: {
            ...actor.activeCompany,
            opportunityFollowUpReadCapture: undefined,
          },
        }}
      />
    </>,
  );
  expect(screen.queryByLabelText('Motif')).not.toBeInTheDocument();
  view.unmount();
  render(<OpportunityFollowUpPanel {...props} />);
  expect(await screen.findByText('No follow-up declaration.')).toBeVisible();
  expect(screen.queryByLabelText('Reason')).not.toBeInTheDocument();
  expect(commands).toHaveLength(1);
  expect(navigation.every((spy) => spy.mock.calls.length === 0)).toBe(true);
  expect(window.location.href).toBe(beforeUrl);
  const stored = JSON.stringify(storage.mock.calls);
  for (const marker of [
    '2031-12-29',
    'Literal private intent',
    'opportunity-a',
    String(commands[0]?.body),
  ])
    expect(stored).not.toContain(marker);
  expect(indexedOpen).not.toHaveBeenCalled();
  expect(cacheOpen).not.toHaveBeenCalled();
  storage.mockRestore();
  navigation.forEach((spy) => spy.mockRestore());
});

it('preserves draft and exact uncertain retry under equivalent Actor copies, callback rerenders and locale changes', async () => {
  const commands: RequestInit[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (_url: unknown, init?: RequestInit) => {
      if (init?.method === 'POST') {
        commands.push(init);
        return commands.length === 1
          ? new Response(null, { status: 503 })
          : Response.json({
              format,
              opportunityId: 'opportunity-a',
              outcome: 'updated',
              fact,
            });
      }
      return Response.json(commands.length > 1 ? recorded : absent);
    }),
  );
  const view = render(
    <>
      <LocaleControls />
      <OpportunityFollowUpPanel {...props} />
    </>,
  );
  fireEvent.click(
    await screen.findByRole('button', { name: 'Record follow-up' }),
  );
  const reason = screen.getByLabelText('Reason');
  fireEvent.change(reason, {
    target: { value: '  Still the same intent Я  ' },
  });
  const copiedActor: ActorContext = {
    ...actor,
    activeCompany: { ...actor.activeCompany },
  };
  view.rerender(
    <>
      <LocaleControls />
      <OpportunityFollowUpPanel
        {...props}
        actor={copiedActor}
        onActorRevalidated={() => undefined}
      />
    </>,
  );
  expect(screen.getByLabelText('Reason')).toBe(reason);
  expect(reason).toHaveValue('  Still the same intent Я  ');
  fireEvent.click(screen.getByRole('button', { name: 'Save follow-up' }));
  await screen.findByRole('button', { name: 'Retry identical follow-up' });
  view.rerender(
    <>
      <LocaleControls />
      <OpportunityFollowUpPanel
        {...props}
        actor={{ ...copiedActor }}
        onActorRevalidated={() => undefined}
      />
    </>,
  );
  fireEvent.click(screen.getByRole('button', { name: /^fr$/u }));
  expect(screen.getByLabelText('Motif')).toBe(reason);
  expect(reason).toHaveValue('  Still the same intent Я  ');
  fireEvent.click(
    screen.getByRole('button', { name: 'Réessayer le même suivi' }),
  );
  expect(await screen.findByText('Suivi enregistré.')).toBeVisible();
  expect(commands).toHaveLength(2);
  expect(commands[1]?.body).toBe(commands[0]?.body);
  expect(commands[1]?.headers).toEqual(commands[0]?.headers);
});
