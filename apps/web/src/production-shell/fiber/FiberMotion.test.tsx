import { StrictMode } from 'react';
import {
  act,
  render,
  screen,
  waitFor,
} from '../../test/render-with-interface-locale';
import { afterEach, expect, it, vi } from 'vitest';
import { FiberMotion } from './FiberMotion';

function unavailableGraphics() {
  const events = new EventTarget();
  const media: MediaQueryList = {
    matches: false,
    media: '(prefers-reduced-motion: reduce)',
    onchange: null,
    addListener: () => undefined,
    removeListener: () => undefined,
    addEventListener: events.addEventListener.bind(events),
    removeEventListener: events.removeEventListener.bind(events),
    dispatchEvent: events.dispatchEvent.bind(events),
  };
  vi.stubGlobal('matchMedia', () => media);
  const addListener = vi.spyOn(media, 'addEventListener');
  const removeListener = vi.spyOn(media, 'removeEventListener');
  const graphics = vi
    .spyOn(HTMLCanvasElement.prototype, 'getContext')
    .mockReturnValue(null);
  return { addListener, removeListener, graphics };
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it('cleans up StrictMode subscriptions and keeps a usable fallback on remount', async () => {
  const boundary = unavailableGraphics();
  const first = render(
    <StrictMode>
      <FiberMotion />
    </StrictMode>,
  );
  await act(async () => {
    await import('./fiber-renderer');
  });
  await waitFor(() =>
    expect(
      screen.getByRole('button', { name: 'Static artwork' }),
    ).toBeDisabled(),
  );
  expect(boundary.graphics).toHaveBeenCalledTimes(1);
  expect(
    boundary.addListener.mock.calls.length -
      boundary.removeListener.mock.calls.length,
  ).toBe(1);
  first.unmount();
  expect(boundary.removeListener).toHaveBeenCalledTimes(
    boundary.addListener.mock.calls.length,
  );
  const second = render(
    <StrictMode>
      <FiberMotion variant="dark" />
    </StrictMode>,
  );
  await waitFor(() =>
    expect(
      screen.getByRole('button', { name: 'Static artwork' }),
    ).toBeDisabled(),
  );
  expect(second.container.querySelector('img')).toHaveAttribute(
    'src',
    '/prisme/wave-dark-desktop.png',
  );
  expect(second.container.querySelector('source')).toHaveAttribute(
    'srcset',
    '/prisme/wave-dark-mobile.png',
  );
  second.unmount();
  expect(boundary.removeListener).toHaveBeenCalledTimes(
    boundary.addListener.mock.calls.length,
  );
});

it('does not acquire a graphics context after unmounting before the async import resolves', async () => {
  const boundary = unavailableGraphics();
  const view = render(
    <StrictMode>
      <FiberMotion />
    </StrictMode>,
  );
  view.unmount();
  // Let the real dynamic import and its cancellation callback settle.
  await import('./fiber-renderer');
  await Promise.resolve();
  expect(boundary.graphics).not.toHaveBeenCalled();
  expect(boundary.removeListener).toHaveBeenCalledTimes(
    boundary.addListener.mock.calls.length,
  );
});
