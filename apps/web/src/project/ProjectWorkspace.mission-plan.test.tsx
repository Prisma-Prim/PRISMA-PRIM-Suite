import { afterEach, expect, it, vi } from 'vitest';
import { act, fireEvent, waitFor } from '@testing-library/react';
import { render, screen } from '../test/render-with-interface-locale';
import { deterministicBrowserIdentity } from '../access-composition';
import { selectOption } from '../test/select-option';
import {
  actor,
  cataloguePage,
  source,
} from '../mission-plan/mission-plan.fixture';
import { ProjectWorkspace } from './ProjectWorkspace';
afterEach(() => vi.unstubAllGlobals());
it.each([200, 500])(
  'keeps the immutable mission-plan retry through a pending directory reload and its%s result',
  async (status) => {
    const clients = [
      {
        id: '80000000-0000-4000-8000-000000000920',
        displayName: 'Synthetic Client',
      },
    ];
    let hold = false,
      release: ((r: Response) => void) | undefined;
    const commands: RequestInit[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init: RequestInit = {}) => {
        const path = new URL(input.toString(), window.location.origin).pathname;
        if (path === '/api/clients')
          return hold
            ? new Promise<Response>((r) => {
                release = r;
              })
            : Response.json(clients);
        if (path === '/api/projects/from-mission-plan') {
          commands.push(init);
          return Response.json({}, { status: 503 });
        }
        if (path === '/api/projects') return Response.json([]);
        if (path.endsWith('/versions/' + source.id))
          return Response.json({ version: source });
        if (path === '/api/mission-plans') return Response.json(cataloguePage);
        throw new Error('Unexpected public request ' + path);
      }),
    );
    render(
      <ProjectWorkspace
        actor={actor}
        identity={deterministicBrowserIdentity()}
      />,
    );
    await screen.findByLabelText('Project title');
    fireEvent.click(
      await screen.findByRole('button', {
        name: 'Open Version: Synthetic reusable plan',
      }),
    );
    fireEvent.click(
      await screen.findByRole('button', {
        name: 'Open Version: Synthetic reusable plan · Version 1',
      }),
    );
    fireEvent.change(screen.getByLabelText('New Project title'), {
      target: { value: 'Protected Project intent' },
    });
    selectOption(
      screen.getByRole('combobox', { name: 'New Project Client' }),
      clients[0]?.id ?? '',
    );
    fireEvent.click(
      screen.getByRole('button', {
        name: 'Create Project with selected activities',
      }),
    );
    await screen.findByText('Outcome uncertain. Retry the identical command.');
    hold = true;
    fireEvent.click(screen.getByRole('button', { name: 'Reload Projects' }));
    await waitFor(() => expect(release).toBeDefined());
    expect(screen.getByLabelText('New Project title')).toHaveValue(
      'Protected Project intent',
    );
    expect(
      screen.getByRole('combobox', { name: 'New Project Client' }),
    ).toHaveTextContent('Synthetic Client');
    expect(
      screen.getByRole('button', { name: 'Retry identical command' }),
    ).toBeVisible();
    await act(async () => release?.(Response.json(clients, { status })));
    fireEvent.click(
      screen.getByRole('button', { name: 'Retry identical command' }),
    );
    await waitFor(() => expect(commands).toHaveLength(2));
    expect(commands[1]?.body).toBe(commands[0]?.body);
    expect(new Headers(commands[1]?.headers).get('idempotency-key')).toBe(
      new Headers(commands[0]?.headers).get('idempotency-key'),
    );
  },
);
