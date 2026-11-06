import {
  fireEvent,
  render,
  screen,
  waitFor,
} from '../test/render-with-interface-locale';
import { afterEach, expect, it, vi } from 'vitest';
import { EvidenceEditor } from './EvidenceEditor';
import { readEvidenceRevision } from './working-evidence-response';
import {
  actor,
  identity,
  ids,
  revision,
  source,
} from './working-evidence.test-fixture';

afterEach(() => vi.unstubAllGlobals());

it('shows the conserved exact frozen Version beyond selector page one and saves that same explicit binding', async () => {
  let submitted: unknown;
  const saved = vi.fn();
  vi.stubGlobal('fetch', async (_input: string, init?: RequestInit) => {
    if (init?.method === 'POST') {
      const command: unknown = JSON.parse(String(init.body));
      if (!command || typeof command !== 'object' || !('commandId' in command))
        throw new Error('Missing command');
      submitted = command;
      return Response.json(
        {
          format: 'WORKING_EVIDENCE_CASE_RECEIPT/1',
          commandId: command.commandId,
          caseId: ids.case,
          revisionId: ids.version,
          revisionNumber: 2,
          action: 'CORRECT',
          recordedAt: revision.recordedAt,
        },
        { status: 201 },
      );
    }
    return Response.json({
      format: 'WORKING_EVIDENCE_CASE_SOURCE_PAGE/1',
      items: Array.from({ length: 25 }, (_, index) => ({
        documentId: `20000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
        versionId: `30000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
        representationId: `40000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
        versionNumber: index + 2,
        sourceTitle: `Fictional page-one source ${index + 1}`,
      })),
      nextCursor: 'fictional-next-page-cursor',
    });
  });
  render(
    <EvidenceEditor
      actor={actor}
      identity={identity}
      projectId={ids.project}
      projectStatus="active"
      signature="fictional-recorder-source-owner"
      correction={readEvidenceRevision(revision)}
      newUseAvailable
      onCancel={() => undefined}
      onSaved={saved}
    />,
  );
  await waitFor(() =>
    expect(
      screen.getByRole('button', { name: 'Save complete revision' }),
    ).toBeEnabled(),
  );
  expect(
    screen.getByLabelText('Exact frozen source', { exact: true }),
  ).toHaveTextContent(`${source.sourceTitle} · Revision 1`);
  fireEvent.change(screen.getByLabelText('Correction reason'), {
    target: { value: 'Fictional full correction retains the exact support' },
  });
  fireEvent.click(
    screen.getByRole('button', { name: 'Save complete revision' }),
  );
  await waitFor(() => expect(saved).toHaveBeenCalledOnce());
  expect(submitted).toMatchObject({
    values: {
      supports: [
        {
          documentId: source.documentId,
          versionId: source.versionId,
          representationId: source.representationId,
          locator: null,
          supportNote: 'Literal unverified support',
        },
      ],
    },
  });
});
