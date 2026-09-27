import { render, screen } from '../test/render-with-interface-locale';
import { expect, it } from 'vitest';
import { PublicWelcome } from './PublicWelcome';

it('offers invited visitors a deliberate path to the existing sign-in route', () => {
  render(<PublicWelcome />);

  expect(
    screen.getByRole('heading', { name: 'Make every decision traceable.' }),
  ).toBeInTheDocument();
  expect(screen.getByText('Access is invitation-only.')).toBeInTheDocument();
  expect(
    screen.getByRole('link', { name: 'Continue to sign in' }),
  ).toHaveAttribute('href', '/sign-in');
  expect(
    screen.queryByRole('link', { name: /sign up/i }),
  ).not.toBeInTheDocument();
});
