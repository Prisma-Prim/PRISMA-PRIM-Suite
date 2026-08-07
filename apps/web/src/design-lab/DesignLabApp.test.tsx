import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { DesignLabApp } from './DesignLabApp';

describe('DesignLabApp', () => {
  it('lists the six initial direction slots', () => {
    render(<DesignLabApp pathname="/design-lab" />);

    expect(screen.getAllByTestId('direction-slot')).toHaveLength(6);
    expect(screen.getByText('Institutional assurance')).toBeInTheDocument();
    expect(screen.getByText('Premium editorial')).toBeInTheDocument();
    expect(screen.getByText('Operations cockpit')).toBeInTheDocument();
    expect(screen.getByText('Guided workflow')).toBeInTheDocument();
    expect(screen.getByText('Document-centric workspace')).toBeInTheDocument();
    expect(screen.getByText('Human-AI review workspace')).toBeInTheDocument();
  });

  it('renders a placeholder without borrowing another direction shell', () => {
    render(
      <DesignLabApp pathname="/design-lab/institutional-assurance/dashboard" />,
    );

    expect(
      screen.getByRole('heading', { name: 'Institutional assurance' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Direction slot reserved')).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'Back to all directions' }),
    ).toHaveAttribute('href', '/design-lab');
  });
});
