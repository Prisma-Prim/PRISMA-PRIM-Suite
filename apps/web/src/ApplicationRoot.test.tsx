import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ApplicationRoot } from './ApplicationRoot';

describe('ApplicationRoot', () => {
  it('keeps the normal application entry point unchanged', () => {
    render(<ApplicationRoot pathname="/" />);

    expect(
      screen.getByRole('heading', { name: 'PRISMA-PRIM Suite' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Foundation operational')).toBeInTheDocument();
  });

  it('isolates the design lab from the normal application', () => {
    render(<ApplicationRoot pathname="/design-lab" />);

    expect(
      screen.getByRole('heading', { name: 'Design direction lab' }),
    ).toBeInTheDocument();
    expect(
      screen.queryByText('Foundation operational'),
    ).not.toBeInTheDocument();
  });
});
