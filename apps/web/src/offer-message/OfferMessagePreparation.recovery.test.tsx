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
  capture,
  deferred,
  fillAndReview,
  identity,
  json,
  literal,
  messageActor,
  observation,
  panel,
  ready,
} from './offer-message.test-fixture';

beforeEach(() => {
  localStorage.setItem(interfaceLocaleStorageKey, 'en');
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('Offer preparation scoped access recovery', () => {
  it.each(['copy', 'pdf'])(
    'rejects older %s recovery after a fresh equal-content Actor observation',
    async (action) => {
      const held = deferred<Response>();
      const actor = messageActor();
      const onActorRevalidated = vi.fn();
      const fetch = vi
        .spyOn(globalThis, 'fetch')
        .mockImplementation(async (input) => {
          const path = String(input);
          if (path.includes('/access/current-actor')) return held.promise;
          if (action === 'pdf' && path.includes('/pdf?')) return json({}, 403);
          if (action === 'copy' && fetch.mock.calls.length > 1)
            return json({}, 403);
          return json(observation());
        });
      const view = render(panel({ actor, onActorRevalidated }));
      await ready();
      fillAndReview();
      fireEvent.click(
        screen.getByRole('button', {
          name: action === 'copy' ? 'Copy body' : 'Download intended PDF',
        }),
      );
      await waitFor(() =>
        expect(
          fetch.mock.calls.some(([url]) =>
            String(url).includes('/access/current-actor'),
          ),
        ).toBe(true),
      );
      const newer = structuredClone(actor);
      expect(newer).not.toBe(actor);
      expect(newer).toEqual(actor);
      view.rerender(panel({ actor: newer, onActorRevalidated }));
      const stale = { ...actor, displayName: 'Older divergent recovery' };
      await act(async () => {
        held.resolve(json(stale));
      });
      expect(onActorRevalidated).not.toHaveBeenCalled();
      expect(screen.queryAllByRole('textbox')).toHaveLength(0);
    },
  );
  it('clears current-403 text before recovery, while allowing the guarded new Actor result', async () => {
    const held = deferred<Response>();
    const fetch = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(json(observation()))
      .mockResolvedValueOnce(json({}, 403))
      .mockImplementation(() => held.promise);
    const onActorRevalidated = vi.fn();
    const originalActor = messageActor();
    const view = render(panel({ actor: originalActor, onActorRevalidated }));
    await ready();
    fillAndReview();
    fireEvent.click(screen.getByRole('button', { name: 'Copy body' }));
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(3));
    expect(String(fetch.mock.calls[2]?.[0])).toContain('/access/current-actor');
    expect(screen.queryAllByRole('textbox')).toHaveLength(0);
    fireEvent.click(screen.getByRole('button', { name: 'ro' }));
    view.rerender(panel({ actor: originalActor, onActorRevalidated }));
    fireEvent.click(screen.getByRole('button', { name: 'en' }));
    const actor = messageActor();
    await act(async () => {
      held.resolve(json(actor));
    });
    expect(onActorRevalidated).toHaveBeenCalledExactlyOnceWith(actor);
    expect(screen.queryAllByRole('textbox')).toHaveLength(0);
  });
  it('rejects an older full-Actor recovery after a newer complete Actor observation without losing newer profile state', async () => {
    const held = deferred<Response>();
    const fetch = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(json(observation()))
      .mockResolvedValueOnce(json({}, 403))
      .mockImplementation(() => held.promise);
    const onActorRevalidated = vi.fn();
    const view = render(panel({ onActorRevalidated }));
    await ready();
    fillAndReview();
    fireEvent.click(screen.getByRole('button', { name: 'Copy subject' }));
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(3));
    view.rerender(
      panel({
        actor: {
          ...messageActor(),
          displayName: 'New complete profile',
          email: 'new@example.test',
        },
        onActorRevalidated,
      }),
    );
    await act(async () => {
      held.resolve(json(messageActor()));
    });
    expect(onActorRevalidated).not.toHaveBeenCalled();
    expect(screen.queryAllByRole('textbox')).toHaveLength(0);
  });
  it.each(['replacement', 'A→B→A'])(
    'rejects held recovery across session %s with an identical Actor',
    async (change) => {
      const held = deferred<Response>();
      const fetch = vi
        .spyOn(globalThis, 'fetch')
        .mockResolvedValueOnce(json(observation()))
        .mockResolvedValueOnce(json({}, 403))
        .mockImplementation(() => held.promise);
      const onActorRevalidated = vi.fn();
      const onCompanyContextRejected = vi.fn();
      const onWorkspaceAccessRejected = vi.fn();
      const view = render(
        panel({
          onActorRevalidated,
          onCompanyContextRejected,
          onWorkspaceAccessRejected,
        }),
      );
      await ready();
      fillAndReview();
      fireEvent.click(screen.getByRole('button', { name: 'Copy body' }));
      await waitFor(() => expect(fetch).toHaveBeenCalledTimes(3));
      view.rerender(
        panel({
          browserIdentity: { ...identity },
          onActorRevalidated,
          onCompanyContextRejected,
          onWorkspaceAccessRejected,
        }),
      );
      if (change === 'A→B→A')
        view.rerender(
          panel({
            onActorRevalidated,
            onCompanyContextRejected,
            onWorkspaceAccessRejected,
          }),
        );
      await act(async () => {
        held.resolve(json(messageActor()));
      });
      expect(onActorRevalidated).not.toHaveBeenCalled();
      expect(onCompanyContextRejected).not.toHaveBeenCalled();
      expect(onWorkspaceAccessRejected).not.toHaveBeenCalled();
      expect(screen.queryAllByRole('textbox')).toHaveLength(0);
    },
  );
  it('fences recovery token retrieval and never sends an old current-Actor request after a target replacement', async () => {
    const held = deferred<string | null>();
    const getToken = vi
      .fn()
      .mockResolvedValueOnce('initial')
      .mockResolvedValueOnce('copy')
      .mockImplementation(() => held.promise);
    const browserIdentity = {
      ...identity,
      requestHeaders: undefined,
      getToken,
    };
    const fetch = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(json(observation()))
      .mockResolvedValueOnce(json({}, 403));
    const onActorRevalidated = vi.fn();
    const view = render(panel({ browserIdentity, onActorRevalidated }));
    await ready();
    fillAndReview();
    fireEvent.click(screen.getByRole('button', { name: 'Copy recipient' }));
    await waitFor(() => expect(getToken).toHaveBeenCalledTimes(3));
    view.rerender(
      panel({ browserIdentity, onActorRevalidated, visible: false }),
    );
    await act(async () => {
      held.resolve('late recovery token');
    });
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(onActorRevalidated).not.toHaveBeenCalled();
  });
  it('retires current 401 before rejecting the session and never attempts a clipboard write', async () => {
    const rejectSession = vi.fn(async () => undefined);
    const browserIdentity = { ...identity, rejectSession };
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(json(observation()))
      .mockResolvedValueOnce(json({}, 401));
    const writeText = vi.fn(async () => undefined);
    vi.stubGlobal(
      'navigator',
      Object.create(navigator, { clipboard: { value: { writeText } } }),
    );
    render(panel({ browserIdentity }));
    await ready();
    fillAndReview();
    fireEvent.click(screen.getByRole('button', { name: 'Copy recipient' }));
    await waitFor(() => expect(rejectSession).toHaveBeenCalledTimes(1));
    expect(screen.queryAllByRole('textbox')).toHaveLength(0);
    expect(writeText).not.toHaveBeenCalled();
  });
  it('retains literal text on a failed source observation and retries only the same exact source', async () => {
    const fetch = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(json(observation()))
      .mockResolvedValueOnce(
        json({ ...observation(), extra: 'closed contract violation' }),
      );
    render(panel());
    await ready();
    fillAndReview();
    fireEvent.click(screen.getByRole('button', { name: 'Copy body' }));
    await screen.findByText(/exact source could not be verified/u);
    expect(screen.getByRole('textbox', { name: 'Message body' })).toHaveValue(
      literal.body,
    );
    expect(screen.getByRole('button', { name: 'Copy body' })).toBeDisabled();
    fetch.mockImplementation(async () => json(observation()));
    fireEvent.click(screen.getByRole('button', { name: 'Retry exact source' }));
    await ready();
    expect(fetch.mock.calls.map(([url]) => String(url))).toEqual(
      Array(3).fill(String(fetch.mock.calls[0]?.[0])),
    );
    expect(screen.getByRole('textbox', { name: 'Subject' })).toHaveValue(
      literal.subject,
    );
    expect(screen.getByRole('button', { name: 'Copy body' })).toBeDisabled();
  });
  it('retires when a fresh observation identifies a different consumed read capture', async () => {
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(json(observation()))
      .mockResolvedValueOnce(
        json({ ...observation(), readCapture: capture.replace(/b/gu, 'c') }),
      );
    render(panel());
    await ready();
    fillAndReview();
    fireEvent.click(screen.getByRole('button', { name: 'Copy body' }));
    await screen.findByText(/preparation has closed/u);
    expect(screen.queryAllByRole('textbox')).toHaveLength(0);
  });
});
