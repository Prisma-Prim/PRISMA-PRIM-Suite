import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  act,
  fireEvent,
  render,
  screen,
} from '../test/render-with-interface-locale';
import { Select } from './Select';

function renderMovingSelect() {
  let anchorTop = 100;
  const frames = new Map<number, FrameRequestCallback>();
  let frameId = 0;
  vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
    frames.set(++frameId, callback);
    return frameId;
  });
  vi.spyOn(window, 'cancelAnimationFrame').mockImplementation((id) => {
    frames.delete(id);
  });
  vi.spyOn(document.documentElement, 'clientWidth', 'get').mockReturnValue(390);
  const viewportHeight = vi
    .spyOn(document.documentElement, 'clientHeight', 'get')
    .mockReturnValue(844);
  const onValueChange = vi.fn();
  const view = render(
    <>
      <label htmlFor="moving-select">Moving choice</label>
      <Select
        id="moving-select"
        value="alpha"
        options={[
          { value: 'alpha', label: 'Alpha' },
          { value: 'beta', label: 'Beta', disabled: true },
          { value: 'gamma', label: 'Gamma' },
        ]}
        onValueChange={onValueChange}
      />
    </>,
  );
  const trigger = screen.getByRole('combobox', { name: 'Moving choice' });
  vi.spyOn(trigger, 'getBoundingClientRect').mockImplementation(
    () => new DOMRect(12, anchorTop, 320, 48),
  );
  trigger.focus();
  fireEvent.click(trigger);
  const popup = screen.getByRole('listbox').parentElement;
  if (!popup) throw new Error('Expected the Select popup');
  return {
    ...view,
    trigger,
    popup,
    frames,
    onValueChange,
    viewportHeight,
    moveAnchor(top: number) {
      anchorTop = top;
    },
    nextFrame() {
      act(() => {
        const pending = [...frames.values()];
        frames.clear();
        for (const callback of pending) callback(16);
      });
    },
  };
}

afterEach(() => vi.restoreAllMocks());

describe('Select viewport placement', () => {
  it('keeps an open menu usable when layout moves its anchor below the viewport without scrolling', () => {
    const example = renderMovingSelect();
    expect(example.popup).toHaveStyle({ top: '154px', maxHeight: '320px' });
    fireEvent.keyDown(example.trigger, { key: 'g' });
    const gamma = screen.getByRole('option', { name: 'Gamma' });
    const gammaId = gamma.id;

    example.moveAnchor(1016.875);
    example.nextFrame();

    expect(example.popup).toHaveStyle({ bottom: '8px', maxHeight: '320px' });
    expect(example.popup.style.top).toBe('');
    expect(example.trigger).toHaveAttribute('aria-expanded', 'true');
    expect(example.trigger).toHaveAttribute('aria-activedescendant', gammaId);
    expect(example.trigger).toHaveFocus();
    expect(screen.getByRole('option', { name: 'Gamma' })).toBe(gamma);
    expect(screen.getByRole('option', { name: 'Beta' })).toBeDisabled();
    expect(screen.getByRole('option', { selected: true })).toHaveTextContent(
      'Alpha',
    );
    expect(example.onValueChange).not.toHaveBeenCalled();
    fireEvent.keyDown(example.trigger, { key: 'a' });
    expect(example.trigger).toHaveAttribute('aria-activedescendant', gammaId);
    fireEvent.click(gamma);
    expect(example.onValueChange).toHaveBeenCalledExactlyOnceWith('gamma');
    expect(example.trigger).toHaveFocus();
    expect(example.frames.size).toBe(0);
  });

  it('clamps an anchor above the viewport after scrolling and restores ordinary placement', () => {
    const example = renderMovingSelect();
    example.moveAnchor(-200);
    fireEvent.scroll(window);
    expect(example.popup).toHaveStyle({ top: '8px', maxHeight: '320px' });
    expect(example.popup.style.bottom).toBe('');

    example.moveAnchor(700);
    fireEvent.scroll(window);
    expect(example.popup).toHaveStyle({ bottom: '150px', maxHeight: '320px' });
    example.moveAnchor(100);
    fireEvent.scroll(window);
    expect(example.popup).toHaveStyle({ top: '154px', maxHeight: '320px' });
    fireEvent.keyDown(example.trigger, { key: 'Escape' });
    expect(example.onValueChange).not.toHaveBeenCalled();
    expect(example.trigger).toHaveFocus();
    expect(example.frames.size).toBe(0);
  });

  it('bounds menu height after viewport resize and cancels tracking on unmount', () => {
    const example = renderMovingSelect();
    example.moveAnchor(300);
    example.viewportHeight.mockReturnValue(180);
    fireEvent.resize(window);
    expect(example.popup).toHaveStyle({ bottom: '8px', maxHeight: '164px' });
    expect(example.popup).toHaveStyle({ left: '12px', width: '320px' });
    example.unmount();
    expect(example.frames.size).toBe(0);
  });
});
