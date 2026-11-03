import { useEffect, useState } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '../test/render-with-interface-locale';
import type { ActorContext } from '../access-types';
import { SectionVisibility } from '../production-shell/section-visibility';
import { InvoiceRecordsWorkspace } from './InvoiceRecordsWorkspace';
import {
  actor,
  current,
  identity,
  ids,
  inventory,
  receipt,
  withdrawn,
} from './invoice-record.fixture';

function ActorObservation({
  observation,
  onApplied,
  onOpenContract,
}: {
  observation: ActorContext;
  onApplied: (value: ActorContext) => void;
  onOpenContract: () => void;
}) {
  const [currentActor, setCurrentActor] = useState(observation);
  useEffect(() => {
    setCurrentActor(observation);
  }, [observation]);
  return (
    <>
      <output aria-label="Observed Actor">{currentActor.displayName}</output>
      <SectionVisibility value={true}>
        <InvoiceRecordsWorkspace
          actor={currentActor}
          identity={identity}
          projectionAuthority="unchanged-native-captures"
          onCompanyContextRejected={() => undefined}
          onWorkspaceAccessRejected={() => undefined}
          onActorRevalidated={(value) => {
            onApplied(value);
            setCurrentActor(value);
          }}
          onOpenContract={onOpenContract}
        />
      </SectionVisibility>
    </>
  );
}
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  localStorage.clear();
});

it('rejects a stale full-Actor recovery after an equivalent newer observation while allowing current recovery and an independent financial withdrawal', async () => {
  const newerObservation: ActorContext = {
    ...actor,
    displayName: 'Newer Actor observation Ș Я é',
  };
  const currentRecovery: ActorContext = {
    ...newerObservation,
    displayName: 'Current permitted recovery',
  };
  const oldRecovery: ActorContext = {
    ...actor,
    displayName: 'Obsolete full Actor response',
  };
  const applied = vi.fn();
  const openContract = vi.fn();
  const reason = 'Independent financial withdrawal after native denial';
  let releaseOldParser: (() => void) | undefined;
  let oldParserFinished = false;
  let oldRecoverySignal: AbortSignal | null | undefined;
  let recoveries = 0;
  let contractReads = 0;
  const posts: RequestInit[] = [];
  vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
    const path = new URL(url, 'http://localhost').pathname;
    if (path === '/api/access/current-actor') {
      recoveries += 1;
      if (recoveries !== 1) return Response.json(currentRecovery);
      oldRecoverySignal = init?.signal;
      const response = Response.json(oldRecovery);
      const nativeJson = response.json.bind(response);
      // This real HTTP response parser deliberately completes despite abort.
      response.json = async () => {
        await new Promise<void>((resolve) => {
          releaseOldParser = resolve;
        });
        const body: unknown = await nativeJson();
        oldParserFinished = true;
        return body;
      };
      return response;
    }
    if (
      path ===
      `/api/contracts/opportunities/${ids.opportunity}/versions/${ids.contractVersion}`
    ) {
      contractReads += 1;
      return new Response(null, { status: 403 });
    }
    if (init?.method === 'POST') {
      posts.push(init);
      return Response.json(receipt('WITHDRAW_ENTRY'), { status: 201 });
    }
    return Response.json(
      path === '/api/invoice-records'
        ? inventory
        : posts.length
          ? withdrawn(reason)
          : current,
    );
  });
  const rendered = render(
    <ActorObservation
      observation={actor}
      onApplied={applied}
      onOpenContract={openContract}
    />,
  );
  fireEvent.click(await screen.findByRole('button', { name: /SYN-INV-001/ }));
  fireEvent.click(
    await screen.findByRole('button', { name: 'Open authorized Contract' }),
  );
  await waitFor(() => expect(releaseOldParser).toBeTypeOf('function'));
  expect(recoveries).toBe(1);
  expect(applied).not.toHaveBeenCalled();
  rendered.rerender(
    <ActorObservation
      observation={newerObservation}
      onApplied={applied}
      onOpenContract={openContract}
    />,
  );
  await waitFor(() =>
    expect(screen.getByLabelText('Observed Actor')).toHaveTextContent(
      newerObservation.displayName,
    ),
  );
  expect(oldRecoverySignal?.aborted).toBe(true);
  expect(screen.getAllByText('1,255.00 MDL').length).toBeGreaterThan(0);
  expect(
    screen.getByRole('button', { name: 'Withdraw PRISMA entry' }),
  ).toBeEnabled();
  await act(async () => {
    releaseOldParser?.();
  });
  await waitFor(() => expect(oldParserFinished).toBe(true));
  expect(applied).not.toHaveBeenCalled();
  expect(screen.getByLabelText('Observed Actor')).toHaveTextContent(
    newerObservation.displayName,
  );
  expect(screen.queryByText(oldRecovery.displayName)).not.toBeInTheDocument();
  expect(
    screen.getByRole('button', { name: 'Withdraw PRISMA entry' }),
  ).toBeEnabled();

  // A current recovery must still publish through the same native403 path.
  fireEvent.click(
    screen.getByRole('button', { name: 'Open authorized Contract' }),
  );
  await waitFor(() => expect(applied).toHaveBeenCalledTimes(1));
  expect(applied).toHaveBeenCalledWith(currentRecovery);
  expect(screen.getByLabelText('Observed Actor')).toHaveTextContent(
    currentRecovery.displayName,
  );
  expect(recoveries).toBe(2);
  expect(contractReads).toBe(2);
  expect(openContract).not.toHaveBeenCalled();
  expect(screen.getAllByText('1,255.00 MDL').length).toBeGreaterThan(0);
  fireEvent.click(
    screen.getByRole('button', { name: 'Withdraw PRISMA entry' }),
  );
  fireEvent.change(screen.getByLabelText('Literal reason'), {
    target: { value: reason },
  });
  fireEvent.click(
    screen.getByRole('button', { name: 'Confirm entry withdrawal' }),
  );
  await screen.findByRole('heading', { name: 'Revision 2 · Entry withdrawn' });
  expect(posts).toHaveLength(1);
  expect(posts[0]?.body).toBe(
    JSON.stringify({ action: 'WITHDRAW_ENTRY', expectedRevision: 1, reason }),
  );
  expect(applied).toHaveBeenCalledTimes(1);
});
