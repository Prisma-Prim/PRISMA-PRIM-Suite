import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApplicationRoot } from './ApplicationRoot';

describe('ApplicationRoot', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            displayName: 'Ada Ionescu',
            email: 'ada@example.test',
            workspaceName: 'PRISMA Workspace',
          }),
          { status: 200 },
        ),
      ),
    );
  });

  it('renders the protected production shell with local identity', async () => {
    render(<ApplicationRoot pathname="/" />);

    expect(
      await screen.findByRole('heading', {
        name: 'Welcome to PRISMA-PRIM Suite',
      }),
    ).toBeInTheDocument();
    expect(screen.getByRole('banner')).toBeInTheDocument();
    expect(screen.getByText('Ada Ionescu')).toBeInTheDocument();
    expect(screen.getByText('ada@example.test')).toBeInTheDocument();
    expect(screen.getByText('PRISMA Workspace')).toBeInTheDocument();
  });
});
