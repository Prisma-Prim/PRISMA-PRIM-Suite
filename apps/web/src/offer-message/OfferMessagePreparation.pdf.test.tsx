import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { webcrypto } from 'node:crypto';
import {
  malformedPdfBytes,
  pdfReply,
} from '../commercial-pdf/commercial-pdf.test-fixture';
import { interfaceLocaleStorageKey } from '../localization/interface-locale';
import {
  deferred,
  fillAndReview,
  json,
  literal,
  messageActor,
  observation,
  panel,
  ready,
  target,
} from './offer-message.test-fixture';

beforeEach(() => {
  localStorage.setItem(interfaceLocaleStorageKey, 'en');
  vi.stubGlobal('crypto', webcrypto);
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
function downloads() {
  const createObjectURL = vi.fn(() => 'blob:message-pdf-owned');
  const revokeObjectURL = vi.fn();
  vi.stubGlobal(
    'URL',
    class extends URL {
      static createObjectURL = createObjectURL;
      static revokeObjectURL = revokeObjectURL;
    },
  );
  const click = vi
    .spyOn(HTMLAnchorElement.prototype, 'click')
    .mockImplementation(() => undefined);
  return { createObjectURL, revokeObjectURL, click };
}
describe('independent exact intended PDF', () => {
  it('verifies the native PDF and a final fresh observation before offering the exact filename', async () => {
    const calls: string[] = [];
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) => {
      calls.push(String(url));
      return String(url).includes('/pdf?')
        ? pdfReply(target)
        : json(observation());
    });
    const { createObjectURL, revokeObjectURL, click } = downloads();
    render(panel());
    await ready();
    fillAndReview();
    fireEvent.click(
      screen.getByRole('button', { name: 'Download intended PDF' }),
    );
    await screen.findByText(/intended PDF was offered/u);
    expect(
      calls.filter((url) => url.includes('message-preparation')),
    ).toHaveLength(3);
    expect(calls.filter((url) => url.includes('/pdf?'))).toEqual([
      `/api/offers/opportunities/${target.opportunityId}/versions/${target.versionId}/pdf?sourceHtmlSha256=${target.sourceHtmlSha256}`,
    ]);
    expect(createObjectURL).toHaveBeenCalledTimes(1);
    expect(click).toHaveBeenCalledTimes(1);
    const anchor = click.mock.instances[0];
    if (!(anchor instanceof HTMLAnchorElement))
      throw new Error('Native download anchor required');
    expect(anchor.download).toBe(
      `offer-${target.reference}-v${target.versionNumber}-non-official-ro.pdf`,
    );
    expect(revokeObjectURL).toHaveBeenCalledExactlyOnceWith(
      'blob:message-pdf-owned',
    );
    expect(screen.getByRole('textbox', { name: 'Message body' })).toHaveValue(
      literal.body,
    );
    expect(screen.getByRole('button', { name: 'Copy body' })).toBeEnabled();
  });
  it('refuses malformed actual PDF bytes, retains text and permits explicit same-version retry', async () => {
    let malformed = true;
    const fetch = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(async (url) =>
        String(url).includes('/pdf?')
          ? pdfReply(target, malformed ? malformedPdfBytes() : undefined)
          : json(observation()),
      );
    const { createObjectURL, click } = downloads();
    render(panel());
    await ready();
    fillAndReview();
    fireEvent.click(
      screen.getByRole('button', { name: 'Download intended PDF' }),
    );
    await screen.findByText(/intended PDF was not offered/u);
    expect(click).not.toHaveBeenCalled();
    expect(createObjectURL).not.toHaveBeenCalled();
    expect(screen.getByRole('textbox', { name: 'Message body' })).toHaveValue(
      literal.body,
    );
    malformed = false;
    fireEvent.click(
      screen.getByRole('button', { name: 'Download intended PDF' }),
    );
    await screen.findByText(/intended PDF was offered/u);
    const urls = fetch.mock.calls
      .filter(([url]) => String(url).includes('/pdf?'))
      .map(([url]) => String(url));
    expect(urls).toHaveLength(2);
    expect(urls[0]).toBe(urls[1]);
    expect(click).toHaveBeenCalledTimes(1);
  });
  it('never allocates a URL or clicks after a delayed byte response and authority retirement', async () => {
    const held = deferred<Response>();
    const response = await pdfReply(target);
    const fetch = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(async (url) =>
        String(url).includes('/pdf?') ? held.promise : json(observation()),
      );
    const { createObjectURL, click } = downloads();
    const view = render(panel());
    await ready();
    fillAndReview();
    fireEvent.click(
      screen.getByRole('button', { name: 'Download intended PDF' }),
    );
    await waitFor(() =>
      expect(
        fetch.mock.calls.some(([url]) => String(url).includes('/pdf?')),
      ).toBe(true),
    );
    view.rerender(
      panel({ actor: messageActor(`offer-message-read.v1.${'c'.repeat(64)}`) }),
    );
    await act(async () => {
      held.resolve(response);
    });
    expect(createObjectURL).not.toHaveBeenCalled();
    expect(click).not.toHaveBeenCalled();
    expect(screen.queryAllByRole('textbox')).toHaveLength(0);
  });
  it('fences asynchronous SHA-256 completion before URL allocation or download feedback', async () => {
    const response = await pdfReply(target);
    const held = deferred<ArrayBuffer>();
    let digestInput: BufferSource | undefined;
    const digest = vi.fn(
      (_algorithm: AlgorithmIdentifier, bytes: BufferSource) => {
        digestInput = bytes;
        return held.promise;
      },
    );
    vi.stubGlobal('crypto', { subtle: { digest } });
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) =>
      String(url).includes('/pdf?') ? response : json(observation()),
    );
    const { createObjectURL, click } = downloads();
    const view = render(panel());
    await ready();
    fillAndReview();
    fireEvent.click(
      screen.getByRole('button', { name: 'Download intended PDF' }),
    );
    await waitFor(() => expect(digest).toHaveBeenCalledTimes(1));
    view.rerender(panel({ visible: false }));
    if (!digestInput)
      throw new Error('Native PDF SHA-256 boundary was not reached');
    const result = await webcrypto.subtle.digest('SHA-256', digestInput);
    await act(async () => {
      held.resolve(result);
    });
    expect(createObjectURL).not.toHaveBeenCalled();
    expect(click).not.toHaveBeenCalled();
    expect(
      screen.queryByText(/intended PDF was offered/u),
    ).not.toBeInTheDocument();
  });
  it('fences the final protected observation after valid bytes and suppresses duplicate PDF dispatch', async () => {
    const held = deferred<Response>();
    let observations = 0;
    const fetch = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(async (url) => {
        if (String(url).includes('/pdf?')) return pdfReply(target);
        observations += 1;
        return observations === 3 ? held.promise : json(observation());
      });
    const { createObjectURL, click } = downloads();
    const view = render(panel());
    await ready();
    fireEvent.click(
      screen.getByRole('button', { name: 'Download intended PDF' }),
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'Download intended PDF' }),
    );
    await waitFor(() => expect(observations).toBe(3));
    view.rerender(
      panel({
        generation: 2,
        source: { ...target, versionId: 'another-version', versionNumber: 4 },
      }),
    );
    await act(async () => {
      held.resolve(json(observation()));
    });
    expect(createObjectURL).not.toHaveBeenCalled();
    expect(click).not.toHaveBeenCalled();
    expect(
      fetch.mock.calls.filter(([url]) => String(url).includes('/pdf?')),
    ).toHaveLength(1);
  });
  it('guards a retirement triggered at URL allocation and cleans only its own allocated URL', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) =>
      String(url).includes('/pdf?') ? pdfReply(target) : json(observation()),
    );
    const { createObjectURL, revokeObjectURL, click } = downloads();
    const view = render(panel());
    await ready();
    createObjectURL.mockImplementation(() => {
      view.rerender(panel({ visible: false }));
      return 'blob:message-pdf-owned';
    });
    fireEvent.click(
      screen.getByRole('button', { name: 'Download intended PDF' }),
    );
    await waitFor(() => expect(createObjectURL).toHaveBeenCalledTimes(1));
    expect(click).not.toHaveBeenCalled();
    expect(revokeObjectURL).toHaveBeenCalledExactlyOnceWith(
      'blob:message-pdf-owned',
    );
  });
});
