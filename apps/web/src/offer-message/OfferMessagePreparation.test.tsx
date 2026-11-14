import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { interfaceLocaleStorageKey } from '../localization/interface-locale';
import {
  deferred,
  fillAndReview,
  identity,
  json,
  literal,
  messageActor,
  observation,
  panel,
  ready,
  target,
} from './offer-message.test-fixture';
import { withoutCompanyGrants } from '../access/company-grants.test-fixture';

beforeEach(() => {
  localStorage.setItem(interfaceLocaleStorageKey, 'en');
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
function clipboard(
  writeText = vi.fn<(text: string) => Promise<void>>(async () => undefined),
) {
  const readText = vi.fn();
  vi.stubGlobal(
    'navigator',
    Object.create(navigator, { clipboard: { value: { writeText, readText } } }),
  );
  return { writeText, readText };
}

describe('exact Offer manual message preparation', () => {
  it('starts empty and copies three separately reviewed literal fields after three fresh protected observations', async () => {
    const fetch = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(async () => json(observation()));
    const { writeText, readText } = clipboard();
    render(panel());
    await ready();
    for (const input of screen.getAllByRole('textbox'))
      expect(input).toHaveValue('');
    expect(screen.getByRole('button', { name: 'Copy body' })).toBeDisabled();
    fillAndReview();
    for (const [name, value] of [
      ['Copy recipient', literal.recipient],
      ['Copy subject', literal.subject],
      ['Copy body', literal.body],
    ]) {
      fireEvent.click(screen.getByRole('button', { name }));
      await waitFor(() => expect(writeText).toHaveBeenLastCalledWith(value));
      await screen.findByText(/browser accepted this field/u);
    }
    expect(writeText.mock.calls.map(([text]) => text)).toEqual([
      literal.recipient,
      literal.subject,
      literal.body,
    ]);
    expect(readText).not.toHaveBeenCalled();
    expect(fetch).toHaveBeenCalledTimes(4);
    for (const [url, init] of fetch.mock.calls) {
      expect(String(url)).toContain(
        `/versions/${target.versionId}/message-preparation?sourceHtmlSha256=${target.sourceHtmlSha256}`,
      );
      expect(init?.method).toBeUndefined();
      expect(init?.cache).toBe('no-store');
    }
  });
  it('preserves text/review across locale, profile, unrelated permissions and incidental rerenders without more reads', async () => {
    const fetch = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(async () => json(observation()));
    const view = render(panel());
    await ready();
    fillAndReview();
    for (const language of ['ro', 'ru', 'fr', 'en']) {
      fireEvent.click(screen.getByRole('button', { name: language }));
      expect(
        screen.getAllByRole('textbox').map((input) => input.textContent),
      ).toEqual([literal.recipient, literal.subject, literal.body]);
    }
    const actor = messageActor();
    view.rerender(
      panel({
        actor: {
          ...actor,
          displayName: 'Updated profile',
          workspacePermissions: ['company.manage'],
          activeCompany: {
            ...actor.activeCompany,
            clientPermissions: [],
            grants: withoutCompanyGrants(
              actor.activeCompany.grants,
              'company_director_client_access',
            ),
          },
        },
      }),
    );
    expect(screen.getByText('Current Actor: Updated profile')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Copy body' })).toBeEnabled();
    expect(screen.getByRole('textbox', { name: 'Message body' })).toHaveValue(
      literal.body,
    );
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it.each([' a@b.co', 'a@b.co ', 'a@b.co\n', 'a@b.co,b@c.co', 'é@b.co'])(
    'refuses the untouched recipient literal %j without observing or copying',
    async (value) => {
      const fetch = vi
        .spyOn(globalThis, 'fetch')
        .mockImplementation(async () => json(observation()));
      const { writeText } = clipboard();
      render(panel());
      await ready();
      fillAndReview();
      fireEvent.change(screen.getByRole('textbox', { name: 'Recipient' }), {
        target: { value },
      });
      expect(screen.getByRole('textbox', { name: 'Recipient' })).toHaveValue(
        value,
      );
      expect(
        screen.getByRole('button', { name: 'Review message' }),
      ).toBeDisabled();
      expect(
        screen.getByRole('button', { name: 'Copy recipient' }),
      ).toBeDisabled();
      expect(fetch).toHaveBeenCalledTimes(1);
      expect(writeText).not.toHaveBeenCalled();
    },
  );
  it('refuses subject line breaks without normalizing them into a valid value', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () =>
      json(observation()),
    );
    render(panel());
    await ready();
    fillAndReview();
    fireEvent.change(screen.getByRole('textbox', { name: 'Subject' }), {
      target: { value: 'Literal\r\nsubject' },
    });
    expect(screen.getByRole('textbox', { name: 'Subject' })).toHaveValue(
      'Literal\nsubject',
    );
    expect(
      screen.getByRole('button', { name: 'Review message' }),
    ).toBeDisabled();
  });
  it('invalidates a held copy observation on edit and ignores its late 403 without retiring the edited draft', async () => {
    const held = deferred<Response>();
    const fetch = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(json(observation()))
      .mockImplementation(() => held.promise);
    const onActorRevalidated = vi.fn();
    const { writeText } = clipboard();
    render(panel({ onActorRevalidated }));
    await ready();
    fillAndReview();
    fireEvent.click(screen.getByRole('button', { name: 'Copy body' }));
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
    fireEvent.change(screen.getByRole('textbox', { name: 'Message body' }), {
      target: { value: 'New literal body' },
    });
    await act(async () => {
      held.resolve(json({}, 403));
    });
    expect(screen.getByRole('textbox', { name: 'Message body' })).toHaveValue(
      'New literal body',
    );
    expect(screen.getByRole('button', { name: 'Copy body' })).toBeDisabled();
    expect(writeText).not.toHaveBeenCalled();
    expect(onActorRevalidated).not.toHaveBeenCalled();
    expect(fetch).toHaveBeenCalledTimes(2);
  });
  it('does not copy either old or new text when an edit and new review overtake a held successful observation', async () => {
    const held = deferred<Response>();
    const fetch = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(json(observation()))
      .mockImplementation(() => held.promise);
    const { writeText } = clipboard();
    render(panel());
    await ready();
    fillAndReview();
    fireEvent.click(screen.getByRole('button', { name: 'Copy body' }));
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
    fireEvent.change(screen.getByRole('textbox', { name: 'Message body' }), {
      target: { value: 'New reviewed literal' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Review message' }));
    await act(async () => {
      held.resolve(json(observation()));
    });
    expect(writeText).not.toHaveBeenCalled();
    expect(screen.getByRole('textbox', { name: 'Message body' })).toHaveValue(
      'New reviewed literal',
    );
    expect(screen.getByRole('button', { name: 'Copy body' })).toBeEnabled();
  });
  it('fences token retrieval before dispatch when the exact target is closed', async () => {
    const held = deferred<string | null>();
    const getToken = vi
      .fn()
      .mockResolvedValueOnce('initial')
      .mockImplementation(() => held.promise);
    const browserIdentity = {
      ...identity,
      requestHeaders: undefined,
      getToken,
    };
    const fetch = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(async () => json(observation()));
    const { writeText } = clipboard();
    const view = render(panel({ browserIdentity }));
    await ready();
    fillAndReview();
    fireEvent.click(screen.getByRole('button', { name: 'Copy body' }));
    await waitFor(() => expect(getToken).toHaveBeenCalledTimes(2));
    view.rerender(panel({ browserIdentity, visible: false }));
    await act(async () => {
      held.resolve('late token');
    });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(writeText).not.toHaveBeenCalled();
    expect(screen.queryAllByRole('textbox')).toHaveLength(0);
  });
  it('irreversibly retires capture A→B→A, then opens an empty new deliberate generation', async () => {
    const held = deferred<Response>();
    const fetch = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(json(observation()))
      .mockImplementation(() => held.promise);
    const { writeText } = clipboard();
    const view = render(panel());
    await ready();
    fillAndReview();
    fireEvent.click(screen.getByRole('button', { name: 'Copy body' }));
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
    view.rerender(
      panel({ actor: messageActor(`offer-message-read.v1.${'c'.repeat(64)}`) }),
    );
    view.rerender(panel());
    await act(async () => {
      held.resolve(json(observation()));
    });
    expect(screen.queryAllByRole('textbox')).toHaveLength(0);
    expect(writeText).not.toHaveBeenCalled();
    fetch.mockImplementation(async () => json(observation()));
    view.rerender(panel({ generation: 2 }));
    await ready();
    for (const input of screen.getAllByRole('textbox'))
      expect(input).toHaveValue('');
  });
  it.each([
    'commercial.request.read',
    'commercial.opportunity.read',
    'commercial.offer.read',
  ])(
    'retires immediately when consumed %s is lost despite an unchanged capture',
    async (permission) => {
      vi.spyOn(globalThis, 'fetch').mockImplementation(async () =>
        json(observation()),
      );
      const view = render(panel());
      await ready();
      fillAndReview();
      const actor = messageActor();
      view.rerender(
        panel({
          actor: {
            ...actor,
            activeCompany: {
              ...actor.activeCompany,
              // Every Commercial Intake version confers both reads, and
              // both Offer bundles confer Offer read: losing one permission
              // is losing the grants that confer it.
              grants: withoutCompanyGrants(
                actor.activeCompany.grants,
                ...(permission === 'commercial.offer.read'
                  ? ([
                      'company_offer_preparer',
                      'company_offer_approver',
                    ] as const)
                  : (['company_commercial_intake'] as const)),
              ),
            },
          },
        }),
      );
      expect(screen.queryAllByRole('textbox')).toHaveLength(0);
    },
  );
  it('reports clipboard denial honestly and permits deliberate native text selection', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () =>
      json(observation()),
    );
    const writeText = vi.fn<(text: string) => Promise<void>>(async () => {
      throw new DOMException('denied', 'NotAllowedError');
    });
    clipboard(writeText);
    render(panel());
    await ready();
    fillAndReview();
    fireEvent.click(screen.getByRole('button', { name: 'Copy body' }));
    await screen.findByText(/clipboard write was not confirmed/u);
    fireEvent.click(
      screen.getByRole('button', { name: 'Select body for manual copy' }),
    );
    const input = screen.getByRole('textbox', { name: 'Message body' });
    expect(input).toHaveFocus();
    if (!(input instanceof HTMLTextAreaElement))
      throw new Error('Semantic textarea required');
    expect(input.selectionStart).toBe(0);
    expect(input.selectionEnd).toBe(literal.body.length);
    expect(writeText).toHaveBeenCalledTimes(1);
  });
  it('prevents duplicate clipboard dispatch and fences late success after stop waiting and close', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () =>
      json(observation()),
    );
    const held = deferred<void>();
    const writeText = vi.fn<(text: string) => Promise<void>>(
      () => held.promise,
    );
    clipboard(writeText);
    render(panel());
    await ready();
    fillAndReview();
    fireEvent.click(screen.getByRole('button', { name: 'Copy body' }));
    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole('button', { name: 'Copy body' }));
    expect(writeText).toHaveBeenCalledTimes(1);
    fireEvent.click(
      screen.getByRole('button', { name: 'Stop waiting for copy' }),
    );
    expect(
      screen.getByText(/write already requested.*may still complete/u),
    ).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Close preparation' }));
    await act(async () => {
      held.resolve();
    });
    expect(
      screen.queryByText(/browser accepted this field/u),
    ).not.toBeInTheDocument();
    expect(screen.queryAllByRole('textbox')).toHaveLength(0);
  });
  it('does not report a held clipboard write as copied after an intervening edit', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () =>
      json(observation()),
    );
    const held = deferred<void>();
    const writeText = vi.fn<(text: string) => Promise<void>>(
      () => held.promise,
    );
    clipboard(writeText);
    render(panel());
    await ready();
    fillAndReview();
    fireEvent.click(screen.getByRole('button', { name: 'Copy body' }));
    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
    fireEvent.change(screen.getByRole('textbox', { name: 'Message body' }), {
      target: { value: 'Edited after dispatch' },
    });
    expect(screen.getByRole('button', { name: 'Copy body' })).toBeDisabled();
    await act(async () => {
      held.resolve();
    });
    expect(screen.getByText(/Clipboard outcome unconfirmed/u)).toBeVisible();
    expect(
      screen.queryByText(/browser accepted this field/u),
    ).not.toBeInTheDocument();
    expect(writeText).toHaveBeenCalledWith(literal.body);
    expect(screen.getByRole('textbox', { name: 'Message body' })).toHaveValue(
      'Edited after dispatch',
    );
  });
});
