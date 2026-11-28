import { afterEach, expect, it, vi } from 'vitest';
import { deterministicBrowserIdentity } from '../../access-composition';
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '../../test/render-with-interface-locale';
import { changeValue } from '../../test/select-option';
import { ClarteDocumentWorkspace } from './ClarteDocuments';
import {
  clarteDocumentsActor,
  clarteDocumentsProject,
  createClarteDocumentsApi,
} from './clarte-documents.test-fixture';

afterEach(() => vi.unstubAllGlobals());

it('retires the Project panel and its Project names when Project read is revoked', async () => {
  const api = createClarteDocumentsApi();
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const reply = api.reply({
        method: init?.method ?? 'GET',
        url: new URL(input.toString(), window.location.origin),
        body:
          typeof init?.body === 'string' ? JSON.parse(init.body) : undefined,
      });
      return Response.json(reply.json, { status: reply.status });
    }),
  );
  const identity = deterministicBrowserIdentity();
  const view = render(
    <ClarteDocumentWorkspace
      actor={clarteDocumentsActor()}
      identity={identity}
    />,
  );
  fireEvent.click(
    await screen.findByRole('button', { name: 'Documents of a Project' }),
  );
  const panel = screen.getByRole('dialog', { name: 'Documents of a Project' });
  changeValue(
    await within(panel).findByLabelText('Project'),
    clarteDocumentsProject.id,
  );
  expect(
    within(panel).getByText(new RegExp(clarteDocumentsProject.title, 'u')),
  ).toBeInTheDocument();

  view.rerender(
    <ClarteDocumentWorkspace
      actor={clarteDocumentsActor(['company_project_access'])}
      identity={identity}
    />,
  );

  await waitFor(() =>
    expect(
      screen.queryByRole('dialog', { name: 'Documents of a Project' }),
    ).toBeNull(),
  );
  expect(
    screen.queryByText(new RegExp(clarteDocumentsProject.title, 'u')),
  ).toBeNull();
  expect(
    screen.queryByRole('button', { name: 'Documents of a Project' }),
  ).toBeNull();
});
