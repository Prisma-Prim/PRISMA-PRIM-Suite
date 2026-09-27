import { fireEvent, screen, within } from '@testing-library/react';

/** Chooses through the rendered custom listbox instead of changing DOM state. */
export function selectOption(control: HTMLElement, value: string): void {
  if (control.getAttribute('aria-expanded') !== 'true')
    fireEvent.click(control);
  const listbox = screen.getByRole('listbox');
  const option = within(listbox)
    .getAllByRole('option')
    .find((candidate) => candidate.getAttribute('data-value') === value);
  if (!option) throw new Error(`Select option value not found: ${value}`);
  fireEvent.click(option);
}

/** Chooses one visible option by its user-facing label. */
export function selectOptionByLabel(
  control: HTMLElement,
  label: string,
  occurrence = 0,
): void {
  if (control.getAttribute('aria-expanded') !== 'true')
    fireEvent.click(control);
  const matches = within(screen.getByRole('listbox'))
    .getAllByRole('option')
    .filter((option) => option.textContent === label);
  const option = matches[occurrence];
  if (!option) throw new Error(`Select option label not found: ${label}`);
  fireEvent.click(option);
}

/** Reads labels from the rendered listbox and returns it to the closed state. */
export function selectOptionLabels(control: HTMLElement): Array<string | null> {
  if (control.getAttribute('aria-expanded') !== 'true')
    fireEvent.click(control);
  const labels = within(screen.getByRole('listbox'))
    .getAllByRole('option')
    .map((option) => option.textContent);
  fireEvent.click(control);
  return labels;
}

/** Changes native fields and chooses custom Select options with real clicks. */
export function changeValue(control: HTMLElement, value: string): void {
  if (control.getAttribute('role') === 'combobox') {
    selectOption(control, value);
    return;
  }
  fireEvent.change(control, { target: { value } });
}
