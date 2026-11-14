import { withCompanyGrants } from '../access/company-grants.test-fixture';
import '@testing-library/jest-dom/vitest';
import { useState } from 'react';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { deterministicBrowserIdentity } from '../access-composition';
import {
  modelContractActor,
  modelContractFixture,
} from './model-contract.fixture';
import { readModelContract } from './model-contract-response';
import { useModelContractJourney } from './use-model-contract-journey';

afterEach(() => vi.restoreAllMocks());

const contract = modelContractFixture();
const props = {
  actor: modelContractActor,
  identity: deterministicBrowserIdentity({
    'x-test-external-subject': 'model-contract-journey',
  }),
  opportunityId: contract.opportunityId,
  onCompanyContextRejected: () => undefined,
  initialContract: readModelContract(contract),
};
type Control = {
  protectSiblings?: () => void;
  replaceActor?: (actor: typeof modelContractActor) => void;
};

/**
 * Sibling ownership and actor grants arrive as parent state changes, as in
 * ModelContractPanel, which stays mounted when grants change.
 */
function Journey({ control }: { control: Control }) {
  const [siblingsProtected, setSiblingsProtected] = useState(false);
  const [actor, setActor] = useState(props.actor);
  control.protectSiblings = () => setSiblingsProtected(true);
  control.replaceActor = setActor;
  const journey = useModelContractJourney(
    { ...props, actor },
    siblingsProtected,
  );
  return (
    <>
      <p>Revision {journey.contract?.revision}</p>
      <p>Read {journey.readState}</p>
      <button
        type="button"
        data-locked={String(journey.locked)}
        onClick={() => void journey.loadHistory()}
      >
        History
      </button>
      <button type="button" onClick={() => void journey.reload()}>
        Reload
      </button>
      <button type="button" onClick={() => void journey.check()}>
        Check
      </button>
      {journey.feedback && <p>Feedback {journey.feedback}</p>}
      {journey.history?.items.map((item) => (
        <p key={item.id}>History Version {item.versionNumber}</p>
      ))}
    </>
  );
}

function response(value: unknown, status = 200) {
  return Response.json(value, { status });
}
const history = {
  items: [
    {
      id: contract.version.id,
      versionNumber: contract.version.versionNumber,
      provenance: 'COMPANY_MODEL_OFFER',
    },
  ],
  nextCursor: null,
};

it('keeps a read requested on the first displayed frame after a sibling takes revision ownership (#1096)', async () => {
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) =>
    input.toString().endsWith('/versions')
      ? response(history)
      : response({ contract }),
  );
  const control: Control = {};
  render(<Journey control={control} />);
  const button = screen.getByRole('button', { name: 'History' });
  let requested = false;
  // React commits the ownership change and yields for paint before running
  // passive effects; this click lands in that frame.
  await waitFor(() => {
    if (!requested) {
      requested = true;
      control.protectSiblings?.();
    }
    expect(button).toHaveAttribute('data-locked', 'true');
    fireEvent.click(button);
  });
  expect(
    await screen.findByText(
      `History Version ${contract.version.versionNumber}`,
    ),
  ).toBeVisible();
});

it('retires a reload begun before a sibling takes revision ownership', async () => {
  let release: ((value: Response) => void) | undefined;
  vi.spyOn(globalThis, 'fetch').mockImplementation(
    () =>
      new Promise<Response>((resolve) => {
        release = resolve;
      }),
  );
  const control: Control = {};
  render(<Journey control={control} />);
  fireEvent.click(screen.getByRole('button', { name: 'Reload' }));
  await waitFor(() => expect(release).toBeDefined());
  act(() => control.protectSiblings?.());
  await act(async () => {
    release?.(
      response({ contract: { ...contract, revision: contract.revision + 1 } }),
    );
  });
  expect(screen.getByText(`Revision ${contract.revision}`)).toBeVisible();
});

it('does not revive a retired read status when the same authority returns', async () => {
  let release: ((value: Response) => void) | undefined;
  vi.spyOn(globalThis, 'fetch').mockImplementation(
    () =>
      new Promise<Response>((resolve) => {
        release = resolve;
      }),
  );
  const company = modelContractActor.activeCompany;
  if (!company) throw new Error('Missing fixture Company.');
  const replaced = {
    ...modelContractActor,
    activeCompany: {
      ...company,
      grants: withCompanyGrants(company.grants, {
        bundle: 'company_commercial_intake',
        version: 'v1',
        assignmentId: 'replacement-intake',
      }),
    },
  };
  const control: Control = {};
  render(<Journey control={control} />);
  fireEvent.click(screen.getByRole('button', { name: 'Reload' }));
  await waitFor(() => expect(release).toBeDefined());
  expect(screen.getByText('Read loading')).toBeVisible();
  act(() => control.replaceActor?.(replaced));
  expect(screen.getByText('Read idle')).toBeVisible();
  act(() => control.replaceActor?.(modelContractActor));
  expect(screen.getByText('Read idle')).toBeVisible();
  await act(async () => {
    release?.(
      response({ contract: { ...contract, revision: contract.revision + 1 } }),
    );
  });
  expect(screen.getByText('Read idle')).toBeVisible();
  expect(screen.getByText(`Revision ${contract.revision}`)).toBeVisible();
});

it('releases the command slot when a command is denied, so a later command can start', async () => {
  let posts = 0;
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    if (init?.method === 'POST') {
      posts += 1;
      return response({}, 403);
    }
    return input.toString().endsWith('/access/current-actor')
      ? response(modelContractActor)
      : response({ contract });
  });
  render(<Journey control={{}} />);
  fireEvent.click(screen.getByRole('button', { name: 'Check' }));
  expect(await screen.findByText('Feedback denied')).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: 'Check' }));
  await waitFor(() => expect(posts).toBe(2));
});
