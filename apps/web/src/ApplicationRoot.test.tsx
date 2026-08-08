import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ApplicationRoot } from './ApplicationRoot';

describe('ApplicationRoot', () => {
  it('renders the production shell at the normal application entry point', () => {
    render(<ApplicationRoot pathname="/" />);

    expect(
      screen.getByRole('heading', { name: 'Welcome to PRISMA-PRIM Suite' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('banner')).toBeInTheDocument();
  });

  it('isolates the design lab from the normal application', () => {
    render(<ApplicationRoot pathname="/design-lab" />);

    expect(
      screen.getByRole('heading', { name: 'Design direction lab' }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('navigation', { name: 'Primary navigation' }),
    ).not.toBeInTheDocument();
  });
});
