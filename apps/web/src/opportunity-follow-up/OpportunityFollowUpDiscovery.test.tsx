import { afterEach, expect, it, vi } from 'vitest';
import {
  act,
  fireEvent,
  render,
  screen,
} from '../test/render-with-interface-locale';
import { OpportunityFollowUpDiscovery } from './OpportunityFollowUpDiscovery';
import { actor, baseProps, format, recordedBy } from './follow-up.fixture';

const discoveryProps = {
  ...baseProps,
  clientProjectionAuthority: 'native-client-projection-a',
};

afterEach(() => vi.unstubAllGlobals());
const row = {
  opportunityId: 'opportunity-a',
  requestId: 'request-a',
  title: 'Literal Alpha case',
  followUpOn: '2026-11-15',
  recordedBy,
  recordedAt: '2026-10-01T10:00:00.000Z',
};
const page = {
  format,
  through: '2026-11-15',
  items: [row],
  nextCursor: 'cursor-a',
};

it('requires a deliberate boundary, continues fresh observations and opens the exact original Request', async () => {
  const fetch = vi.fn(
    async (url: string | URL | Request, init?: RequestInit) => {
      expect(init?.cache).toBe('no-store');
      return Response.json(
        String(url).includes('cursor=')
          ? {
              ...page,
              items: [
                {
                  ...row,
                  opportunityId: 'opportunity-b',
                  requestId: 'request-b',
                  title: 'Literal Beta case',
                },
              ],
              nextCursor: null,
            }
          : page,
      );
    },
  );
  vi.stubGlobal('fetch', fetch);
  const onOpenRequest = vi.fn();
  render(
    <OpportunityFollowUpDiscovery
      {...discoveryProps}
      disabled={false}
      onOpenRequest={onOpenRequest}
    />,
  );
  expect(fetch).not.toHaveBeenCalled();
  const through = screen.getByLabelText('Through chosen date, inclusive');
  expect(through).toHaveValue('');
  fireEvent.click(screen.getByRole('button', { name: 'Find follow-ups' }));
  expect(fetch).not.toHaveBeenCalled();
  expect(through).toHaveAttribute('aria-invalid', 'true');
  fireEvent.change(through, { target: { value: '2026-11-15' } });
  fireEvent.click(screen.getByRole('button', { name: 'Find follow-ups' }));
  expect(await screen.findByText('Literal Alpha case')).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: 'Show next follow-ups' }));
  expect(await screen.findByText('Literal Beta case')).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: 'Open Request' }));
  expect(onOpenRequest).toHaveBeenCalledWith('request-b');
  expect(
    screen.getByRole('heading', { name: 'Find Opportunities for follow-up' }),
  ).toHaveFocus();
});

it('retires pages and an ignored-abort reply when the boundary changes', async () => {
  let resolve: ((response: Response) => void) | undefined;
  const response = new Promise<Response>((complete) => {
    resolve = complete;
  });
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => response),
  );
  render(
    <OpportunityFollowUpDiscovery
      {...discoveryProps}
      disabled={false}
      onOpenRequest={vi.fn()}
    />,
  );
  const through = screen.getByLabelText('Through chosen date, inclusive');
  fireEvent.change(through, { target: { value: '2026-11-15' } });
  fireEvent.click(screen.getByRole('button', { name: 'Find follow-ups' }));
  await screen.findByText('Loading follow-up…');
  fireEvent.change(through, { target: { value: '2026-11-16' } });
  await act(async () => {
    resolve?.(Response.json(page));
  });
  expect(screen.queryByText('Literal Alpha case')).not.toBeInTheDocument();
  expect(
    screen.queryByRole('button', { name: 'Show next follow-ups' }),
  ).not.toBeInTheDocument();
  expect(through).toHaveValue('2026-11-16');
});

it.each(['repeated cursor', 'backward row'])(
  'fails closed on a %s and offers deliberate restart',
  async (bad) => {
    let calls = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        Response.json(
          calls++ === 0
            ? page
            : {
                ...page,
                items: [
                  {
                    ...row,
                    opportunityId:
                      bad === 'backward row'
                        ? 'opportunity-0'
                        : 'opportunity-b',
                  },
                ],
                nextCursor: bad === 'repeated cursor' ? 'cursor-a' : null,
              },
        ),
      ),
    );
    render(
      <OpportunityFollowUpDiscovery
        {...discoveryProps}
        disabled={false}
        onOpenRequest={vi.fn()}
      />,
    );
    fireEvent.change(screen.getByLabelText('Through chosen date, inclusive'), {
      target: { value: '2026-11-15' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Find follow-ups' }));
    fireEvent.click(
      await screen.findByRole('button', { name: 'Show next follow-ups' }),
    );
    expect(
      await screen.findByRole('button', { name: 'Restart search' }),
    ).toBeVisible();
    expect(
      screen.queryByRole('button', { name: 'Open Request' }),
    ).not.toBeInTheDocument();
  },
);

it('renders nothing and sends no follow-up request without the independent capture', () => {
  const fetch = vi.fn();
  vi.stubGlobal('fetch', fetch);
  const { container } = render(
    <OpportunityFollowUpDiscovery
      {...discoveryProps}
      actor={{
        ...actor,
        activeCompany: {
          ...actor.activeCompany,
          opportunityFollowUpReadCapture: undefined,
        },
      }}
      disabled={false}
      onOpenRequest={vi.fn()}
    />,
  );
  expect(container).toBeEmptyDOMElement();
  expect(fetch).not.toHaveBeenCalled();
});

it('irreversibly retires optional projection pages and ignored-abort replies through A→B→A', async () => {
  let resolve: ((response: Response) => void) | undefined;
  const response = new Promise<Response>((complete) => {
    resolve = complete;
  });
  const fetch = vi.fn(async () => response);
  vi.stubGlobal('fetch', fetch);
  const onOpenRequest = vi.fn();
  const rendered = render(
    <OpportunityFollowUpDiscovery
      {...discoveryProps}
      disabled={false}
      onOpenRequest={onOpenRequest}
    />,
  );
  fireEvent.change(screen.getByLabelText('Through chosen date, inclusive'), {
    target: { value: page.through },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Find follow-ups' }));
  await screen.findByText('Loading follow-up…');
  rendered.rerender(
    <OpportunityFollowUpDiscovery
      {...discoveryProps}
      clientProjectionAuthority="native-client-projection-b"
      disabled={false}
      onOpenRequest={onOpenRequest}
    />,
  );
  rendered.rerender(
    <OpportunityFollowUpDiscovery
      {...discoveryProps}
      disabled={false}
      onOpenRequest={onOpenRequest}
    />,
  );
  await act(async () => {
    resolve?.(Response.json(page));
    await response;
  });
  expect(screen.getByLabelText('Through chosen date, inclusive')).toHaveValue(
    '',
  );
  expect(screen.queryByText(row.title)).not.toBeInTheDocument();
  expect(
    screen.queryByRole('button', { name: 'Show next follow-ups' }),
  ).not.toBeInTheDocument();
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(onOpenRequest).not.toHaveBeenCalled();
  expect(screen.getByRole('button', { name: 'Find follow-ups' })).toBeEnabled();
});
