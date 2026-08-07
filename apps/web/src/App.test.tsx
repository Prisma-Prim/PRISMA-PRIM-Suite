import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { App } from './App';

describe('App', () => {
  it('renders the foundation status', () => {
    render(<App />);

    expect(
      screen.getByRole('heading', { name: 'PRISMA-PRIM Suite' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Foundation operational')).toBeInTheDocument();
  });
});
