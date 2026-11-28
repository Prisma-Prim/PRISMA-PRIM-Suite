import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import {
  fireEvent,
  render,
  screen,
} from '../../test/render-with-interface-locale';
import { ClarteBadge } from './ClarteBadge';
import { ClarteButton } from './ClarteButton';
import { ClarteCard } from './ClarteCard';
import { ClarteConfirmDialog } from './ClarteConfirmDialog';
import { ClarteField } from './ClarteField';
import { ClarteSidePanel } from './ClarteSidePanel';
import {
  ClarteEmptyState,
  ClarteErrorState,
  ClarteLoadingState,
} from './ClarteState';

function PanelHost() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <ClarteButton onClick={() => setOpen(true)}>Open details</ClarteButton>
      {open && (
        <ClarteSidePanel
          title="Fictional record"
          description="Synthetic details"
          footer={<ClarteButton variant="primary">Save</ClarteButton>}
          onClose={() => setOpen(false)}
        >
          <ClarteField label="Name">
            {(control) => <input className="clarte-input" {...control} />}
          </ClarteField>
        </ClarteSidePanel>
      )}
    </>
  );
}

describe('Clarté side panel', () => {
  it('takes focus, keeps Tab inside, closes on Escape and returns focus', () => {
    render(<PanelHost />);
    const opener = screen.getByRole('button', { name: 'Open details' });
    opener.focus();
    fireEvent.click(opener);

    const panel = screen.getByRole('dialog', { name: 'Fictional record' });
    const close = screen.getByRole('button', { name: 'Close' });
    const save = screen.getByRole('button', { name: 'Save' });
    expect(panel).toHaveAttribute('aria-modal', 'true');
    expect(close).toHaveFocus();
    save.focus();
    fireEvent.keyDown(save, { key: 'Tab' });
    expect(close).toHaveFocus();
    fireEvent.keyDown(close, { key: 'Tab', shiftKey: true });
    expect(save).toHaveFocus();

    fireEvent.keyDown(save, { key: 'Escape' });

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(opener).toHaveFocus();
  });
});

function RetainedPanelHost() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <ClarteButton onClick={() => setOpen(true)}>Open draft</ClarteButton>
      <ClarteSidePanel
        title="Retained record"
        open={open}
        onClose={() => setOpen(false)}
      >
        <ClarteField label="Note">
          {(control) => <input className="clarte-input" {...control} />}
        </ClarteField>
      </ClarteSidePanel>
    </>
  );
}

describe('Clarté side panel kept mounted while closed', () => {
  it('hides when closed, keeps its contents and moves focus only while open', () => {
    render(<RetainedPanelHost />);
    const opener = screen.getByRole('button', { name: 'Open draft' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    opener.focus();
    fireEvent.click(opener);

    const panel = screen.getByRole('dialog', { name: 'Retained record' });
    expect(screen.getByRole('button', { name: 'Close' })).toHaveFocus();
    fireEvent.change(screen.getByLabelText('Note'), {
      target: { value: 'Fictional draft' },
    });
    fireEvent.keyDown(panel, { key: 'Escape' });

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(opener).toHaveFocus();
    fireEvent.click(opener);
    expect(screen.getByLabelText('Note')).toHaveValue('Fictional draft');
  });
});

describe('Clarté confirmation dialog', () => {
  it('starts on Cancel, cancels on Escape and confirms the named action', () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    const { rerender } = render(
      <ClarteConfirmDialog
        title="Withdraw the draft?"
        description="The draft stays in its history."
        confirmLabel="Withdraw draft"
        tone="danger"
        onConfirm={onConfirm}
        onCancel={onCancel}
      />,
    );

    const dialog = screen.getByRole('alertdialog', {
      name: 'Withdraw the draft?',
    });
    expect(dialog).toHaveAccessibleDescription(
      'The draft stays in its history.',
    );
    expect(screen.getByRole('button', { name: 'Cancel' })).toHaveFocus();
    fireEvent.keyDown(dialog, { key: 'Escape' });
    expect(onCancel).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole('button', { name: 'Withdraw draft' }));
    expect(onConfirm).toHaveBeenCalledOnce();

    rerender(
      <ClarteConfirmDialog
        title="Withdraw the draft?"
        description="The draft stays in its history."
        confirmLabel="Withdraw draft"
        busy
        onConfirm={onConfirm}
        onCancel={onCancel}
      />,
    );
    expect(
      screen.getByRole('button', { name: 'Withdraw draft' }),
    ).toBeDisabled();
  });
});

describe('Clarté field', () => {
  it('ties the label, hint and error to its control', () => {
    render(
      <ClarteField
        label="IDNO"
        hint="Thirteen digits."
        error="This IDNO is too short."
      >
        {(control) => <input className="clarte-input" {...control} />}
      </ClarteField>,
    );

    const input = screen.getByLabelText('IDNO');
    expect(input).toHaveAccessibleDescription(
      'Thirteen digits. This IDNO is too short.',
    );
    expect(input).toHaveAttribute('aria-invalid', 'true');
  });
});

describe('Clarté surfaces and states', () => {
  it('names a titled card and announces loading and errors only', () => {
    render(
      <>
        <ClarteCard title="Next steps" actions={<ClarteBadge>2</ClarteBadge>}>
          <ClarteEmptyState title="Nothing to do today" />
        </ClarteCard>
        <ClarteLoadingState />
        <ClarteErrorState
          title="The list is unavailable."
          action={<ClarteButton>Retry</ClarteButton>}
        />
        <ClarteBadge tone="success">Confirmed</ClarteBadge>
      </>,
    );

    expect(
      screen.getByRole('region', { name: 'Next steps' }),
    ).toHaveTextContent('Nothing to do today');
    expect(screen.getByRole('status')).toHaveTextContent('Loading…');
    expect(screen.getByRole('alert')).toHaveTextContent(
      'The list is unavailable.',
    );
    expect(screen.getByText('Confirmed')).toHaveClass('clarte-badge--success');
  });
});
