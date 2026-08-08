import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { App } from './App';

describe('App', () => {
  it('renders the production application shell', () => {
    render(<App />);

    expect(
      screen.getByRole('heading', { name: 'Welcome to PRISMA-PRIM Suite' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('navigation', { name: 'Primary navigation' }),
    ).toBeInTheDocument();
  });
});
