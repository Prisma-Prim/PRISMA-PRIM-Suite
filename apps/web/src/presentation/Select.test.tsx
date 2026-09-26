import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { Select } from './Select';

const options = [
  { value: 'alpha', label: 'Alpha' },
  { value: 'beta', label: 'Beta', disabled: true },
  { value: 'gamma', label: 'Gamma' },
] as const;

describe('Select', () => {
  it('opens and selects enabled options with the keyboard', () => {
    const onValueChange = vi.fn();

    function Example() {
      const [value, setValue] = useState('alpha');
      return (
        <>
          <label htmlFor="example-select">Example</label>
          <Select
            id="example-select"
            value={value}
            options={options}
            onValueChange={(nextValue) => {
              setValue(nextValue);
              onValueChange(nextValue);
            }}
          />
        </>
      );
    }

    render(<Example />);

    const select = screen.getByRole('combobox', { name: 'Example' });
    fireEvent.click(select);
    expect(select).toHaveAttribute('aria-expanded', 'true');

    fireEvent.keyDown(select, { key: 'ArrowDown' });
    fireEvent.keyDown(select, { key: 'Enter' });

    expect(onValueChange).toHaveBeenCalledWith('gamma');
    expect(select).toHaveTextContent('Gamma');
    expect(select).toHaveFocus();
    expect(select).toHaveAttribute('aria-expanded', 'false');
  });

  it('opens with Space and chooses through the visible option click', () => {
    const onValueChange = vi.fn();
    render(
      <>
        <label htmlFor="pointer-select">Pointer example</label>
        <small id="pointer-select-help">Choose the next step</small>
        <Select
          id="pointer-select"
          value=""
          placeholder="Choose"
          options={options}
          onValueChange={onValueChange}
          describedBy="pointer-select-help"
          invalid
        />
      </>,
    );

    const select = screen.getByRole('combobox', { name: 'Pointer example' });
    expect(select).toHaveAccessibleDescription('Choose the next step');
    expect(select).toHaveAttribute('aria-invalid', 'true');
    fireEvent.keyDown(select, { key: ' ' });

    expect(
      screen.getByRole('listbox', { name: 'Pointer example' }),
    ).toBeVisible();
    fireEvent.click(screen.getByRole('option', { name: 'Gamma' }));

    expect(onValueChange).toHaveBeenCalledWith('gamma');
    expect(select).toHaveFocus();
  });

  it('closes and restores focus without reporting a change when the current option is chosen again', () => {
    const onValueChange = vi.fn();
    render(
      <>
        <label htmlFor="unchanged-select">Unchanged example</label>
        <Select
          id="unchanged-select"
          value="alpha"
          options={options}
          onValueChange={onValueChange}
        />
      </>,
    );

    const select = screen.getByRole('combobox', {
      name: 'Unchanged example',
    });
    fireEvent.click(select);
    fireEvent.click(screen.getByRole('option', { name: 'Alpha' }));

    expect(onValueChange).not.toHaveBeenCalled();
    expect(select).toHaveFocus();
    expect(select).toHaveAttribute('aria-expanded', 'false');

    fireEvent.click(select);
    fireEvent.keyDown(select, { key: 'Enter' });

    expect(onValueChange).not.toHaveBeenCalled();
    expect(select).toHaveFocus();
    expect(select).toHaveAttribute('aria-expanded', 'false');
  });

  it('names the listbox from a wrapping label without adding the value', () => {
    render(
      <label>
        Wrapped example
        <Select
          id="wrapped-select"
          value="alpha"
          options={options}
          onValueChange={vi.fn()}
        />
      </label>,
    );

    fireEvent.click(screen.getByRole('combobox', { name: 'Wrapped example' }));
    expect(
      screen.getByRole('listbox', { name: 'Wrapped example' }),
    ).toBeVisible();
  });

  it('supports typeahead, Escape, outside dismissal and empty options', () => {
    const { rerender } = render(
      <>
        <label htmlFor="search-select">Search example</label>
        <Select
          id="search-select"
          value="alpha"
          options={options}
          onValueChange={vi.fn()}
        />
        <button type="button">After</button>
      </>,
    );
    const select = screen.getByRole('combobox', { name: 'Search example' });

    select.focus();
    fireEvent.keyDown(select, { key: 'g' });
    expect(select).toHaveAttribute(
      'aria-activedescendant',
      expect.stringContaining('option-2'),
    );
    fireEvent.keyDown(select, { key: 'Escape' });
    expect(select).toHaveAttribute('aria-expanded', 'false');
    expect(select).toHaveFocus();

    fireEvent.click(select);
    fireEvent.pointerDown(screen.getByRole('button', { name: 'After' }));
    expect(select).toHaveAttribute('aria-expanded', 'false');

    rerender(
      <>
        <label htmlFor="search-select">Search example</label>
        <Select
          id="search-select"
          value="alpha"
          options={[]}
          onValueChange={vi.fn()}
        />
      </>,
    );
    expect(select).toHaveAttribute('aria-invalid', 'true');
    expect(select).toHaveTextContent('Selection unavailable');
    fireEvent.click(select);
    expect(screen.getByText('No options available')).toBeVisible();
  });

  it('supports Home, End and Tab while keeping focus on the combobox', () => {
    const onValueChange = vi.fn();
    render(
      <>
        <label htmlFor="navigation-select">Navigation example</label>
        <Select
          id="navigation-select"
          value="alpha"
          options={options}
          onValueChange={onValueChange}
        />
        <button type="button">After</button>
      </>,
    );
    const select = screen.getByRole('combobox', { name: 'Navigation example' });

    select.focus();
    fireEvent.keyDown(select, { key: 'End' });
    expect(select).toHaveAttribute(
      'aria-activedescendant',
      expect.stringContaining('option-2'),
    );
    expect(screen.getByRole('option', { name: 'Gamma' })).toHaveAttribute(
      'aria-selected',
      'true',
    );

    fireEvent.keyDown(select, { key: 'Home' });
    expect(select).toHaveAttribute(
      'aria-activedescendant',
      expect.stringContaining('option-0'),
    );
    fireEvent.keyDown(select, { key: 'Tab' });
    expect(select).toHaveAttribute('aria-expanded', 'false');
    expect(onValueChange).not.toHaveBeenCalled();
  });

  it('closes when its controlled value or options change and cannot open disabled', () => {
    const onValueChange = vi.fn();
    const { rerender } = render(
      <>
        <label htmlFor="controlled-select">Controlled example</label>
        <Select
          id="controlled-select"
          value="alpha"
          options={options}
          onValueChange={onValueChange}
        />
      </>,
    );
    const select = screen.getByRole('combobox', { name: 'Controlled example' });
    fireEvent.click(select);
    expect(select).toHaveAttribute('aria-expanded', 'true');

    rerender(
      <>
        <label htmlFor="controlled-select">Controlled example</label>
        <Select
          id="controlled-select"
          value="gamma"
          options={options}
          onValueChange={onValueChange}
        />
      </>,
    );
    expect(select).toHaveAttribute('aria-expanded', 'false');
    expect(select).toHaveTextContent('Gamma');

    rerender(
      <>
        <label htmlFor="controlled-select">Controlled example</label>
        <Select
          id="controlled-select"
          value="gamma"
          options={options}
          onValueChange={onValueChange}
          disabled
        />
      </>,
    );
    expect(select).toBeDisabled();
    fireEvent.click(select);
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('submits its value, enforces required and restores the reset value', () => {
    const changes: string[] = [];
    const onSubmit = vi.fn((event: React.FormEvent) => event.preventDefault());
    function FormExample() {
      const [value, setValue] = useState('');
      return (
        <form aria-label="Example form" onSubmit={onSubmit}>
          <label htmlFor="form-select">Form example</label>
          <Select
            id="form-select"
            name="choice"
            value={value}
            placeholder="Choose"
            options={options}
            required
            resetValue="alpha"
            onValueChange={(nextValue) => {
              changes.push(nextValue);
              setValue(nextValue);
            }}
          />
        </form>
      );
    }
    const { container } = render(<FormExample />);
    const form = container.querySelector<HTMLFormElement>('form');
    const select = screen.getByRole('combobox', { name: 'Form example' });
    const formControl = container.querySelector<HTMLInputElement>(
      '.shared-select__form-control',
    );

    expect(form).not.toBeNull();
    expect(formControl).not.toBeNull();
    if (!form) throw new Error('Expected the example form');
    expect(form.checkValidity()).toBe(false);
    form.requestSubmit();
    expect(onSubmit).not.toHaveBeenCalled();
    expect(select).toHaveFocus();

    fireEvent.click(select);
    fireEvent.click(screen.getByRole('option', { name: 'Gamma' }));
    expect(form.checkValidity()).toBe(true);
    expect(new FormData(form).get('choice')).toBe('gamma');
    form.requestSubmit();
    expect(onSubmit).toHaveBeenCalledOnce();

    fireEvent.reset(form);
    expect(changes.at(-1)).toBe('alpha');
    expect(select).toHaveTextContent('Alpha');
  });

  it('lets native validation identify the first invalid field and forwards its focus', () => {
    const onSubmit = vi.fn((event: React.FormEvent) => event.preventDefault());
    render(
      <form aria-label="Required fields" onSubmit={onSubmit}>
        <label htmlFor="first-required">First choice</label>
        <Select
          id="first-required"
          name="choice"
          value=""
          placeholder="Choose"
          options={options}
          required
          onValueChange={vi.fn()}
        />
        <label>
          Next required field
          <input name="next" required />
        </label>
      </form>,
    );
    const form = screen.getByRole('form', { name: 'Required fields' });
    if (!(form instanceof HTMLFormElement)) throw new Error('Expected form');
    const submittedChoice = form.elements.namedItem('choice');
    if (!(submittedChoice instanceof HTMLInputElement))
      throw new Error('Expected the native form value');
    const canceledInvalidEvents: boolean[] = [];
    submittedChoice.addEventListener('invalid', (event) => {
      canceledInvalidEvents.push(event.defaultPrevented);
    });

    form.requestSubmit();

    expect(onSubmit).not.toHaveBeenCalled();
    // Canceling this event makes browsers skip the first invalid control.
    expect(canceledInvalidEvents).toEqual([false]);
    // jsdom does not perform the browser's interactive validation focus step.
    submittedChoice.focus();
    expect(
      screen.getByRole('combobox', { name: 'First choice' }),
    ).toHaveFocus();
  });
});

it('keeps the trigger typography in its portalled menu', () => {
  render(
    <>
      <style>{'#font-select { font-family: Arial; font-size: 18px; }'}</style>
      <label htmlFor="font-select">Font example</label>
      <Select
        id="font-select"
        value="alpha"
        options={options}
        onValueChange={vi.fn()}
      />
    </>,
  );
  const trigger = screen.getByRole('combobox', { name: 'Font example' });
  expect(getComputedStyle(trigger).fontFamily).toBe('Arial');
  fireEvent.click(trigger);

  const menu = screen.getByRole('listbox', { name: 'Font example' });
  expect(getComputedStyle(menu).fontFamily).toBe('Arial');
  expect(getComputedStyle(menu).fontSize).toBe('18px');
});
