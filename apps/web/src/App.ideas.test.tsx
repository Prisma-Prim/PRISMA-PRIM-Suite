import { selectOption } from './test/select-option';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from './test/render-with-interface-locale';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from './App';
import { deterministicBrowserIdentity } from './access-composition';
import type { ActorContext } from './access-types';
import { InterfaceLocaleSelect } from './localization/InterfaceLocaleSelect';

const COMPANY = '00000000-0000-4000-8000-000000000733';
const IDEA = '00000000-0000-4000-8000-000000001733';
const original = {
  id: IDEA,
  companyId: COMPANY,
  description: 'Reduce repeated questionnaire entry',
  origin: 'Internal suggestion',
  revision: 1,
  disposition: 'new',
  submittedBy: {
    workspaceMembershipId: 'member-a',
    internalUserId: 'person-a',
    displayName: 'Ana',
  },
  submittedAt: '2026-10-20T05:00:00.000Z',
};
function actor(): ActorContext {
  return {
    internalUserId: 'person-a',
    workspaceMembershipId: 'member-a',
    workspaceId: 'workspace-a',
    workspaceName: 'Synthetic Workspace',
    displayName: 'Ana',
    email: 'ana@example.test',
    active: true,
    workspacePermissions: [],
    activeCompany: {
      id: COMPANY,
      displayName: 'Synthetic Company',
      clientPermissions: [],
      ideasReaderPermissions: ['idea.read'],
      ideasReaderPermissionAssignmentId: 'reader-a',
      ideasReaderPermissionSetVersion: 'v1',
    },
  };
}
const identity = deterministicBrowserIdentity();
const nativeScroll = Element.prototype.scrollIntoView;
beforeEach(() => {
  window.history.replaceState({}, '', '/#ideas');
  localStorage.clear();
  Element.prototype.scrollIntoView = vi.fn();
  vi.stubGlobal(
    'matchMedia',
    vi.fn(
      (query: string) =>
        ({
          matches: true,
          media: query,
          onchange: null,
          addListener: vi.fn(),
          removeListener: vi.fn(),
          addEventListener: vi.fn(),
          removeEventListener: vi.fn(),
          dispatchEvent: vi.fn(() => false),
        }) satisfies MediaQueryList,
    ),
  );
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  Element.prototype.scrollIntoView = nativeScroll;
});

describe('Ideas through the real App composition', () => {
  it('shows literal saved text and original attribution to a Reader without offering mutation controls', async () => {
    const requests: string[] = [];
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const path = new URL(String(input), window.location.origin).pathname;
      requests.push(`${init?.method ?? 'GET'} ${path}`);
      if (path === '/api/access/current-actor') return Response.json(actor());
      if (path === '/api/companies')
        return Response.json([
          { id: COMPANY, displayName: 'Synthetic Company' },
        ]);
      if (path === '/api/activity-log') return Response.json({ events: [] });
      if (path === '/api/ideas')
        return Response.json({
          companyId: COMPANY,
          ideas: [original],
          total: 1,
          nextCursor: null,
        });
      if (path === `/api/ideas/${IDEA}`) return Response.json(original);
      if (path === `/api/ideas/${IDEA}/dispositions`)
        return Response.json({
          ideaId: IDEA,
          entries: [],
          total: 0,
          nextCursor: null,
        });
      return Response.json({}, { status: 404 });
    });
    render(<App identity={identity} />);
    fireEvent.click(
      await screen.findByRole('button', {
        name: /Reduce repeated questionnaire entry/u,
      }),
    );
    expect(await screen.findByText('Internal suggestion')).toBeVisible();
    expect(screen.getByText('Submitted by: Ana')).toBeVisible();
    expect(
      screen.queryByRole('button', { name: 'Record Idea' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Record disposition' }),
    ).not.toBeInTheDocument();
    expect(requests.filter((route) => route.startsWith('POST'))).toEqual([]);
  });
  it('retains the exact uncertain recording intent and keeps confirmed save visible after refresh fails', async () => {
    const reader = actor();
    if (!reader.activeCompany) throw new Error('Company fixture required');
    const recorder: ActorContext = {
      ...reader,
      activeCompany: {
        ...reader.activeCompany,
        ideasRecorderPermissions: ['idea.record'],
        ideasRecorderPermissionAssignmentId: 'recorder-a',
        ideasRecorderPermissionSetVersion: 'v1',
      },
    };
    const submissions: {
      body: RequestInit['body'];
      key: string | null;
      contentType: string | null;
    }[] = [];
    let saved = false;
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const path = new URL(String(input), window.location.origin).pathname;
      if (path === '/api/access/current-actor') return Response.json(recorder);
      if (path === '/api/companies')
        return Response.json([
          { id: COMPANY, displayName: 'Synthetic Company' },
        ]);
      if (path === '/api/activity-log') return Response.json({ events: [] });
      if (path === '/api/ideas' && init?.method === 'POST') {
        submissions.push({
          body: init.body,
          key: new Headers(init.headers).get('idempotency-key'),
          contentType: new Headers(init.headers).get('content-type'),
        });
        if (submissions.length === 1) return Response.json({}, { status: 500 });
        saved = true;
        return Response.json(
          {
            ...original,
            description: '  Literal draft\nИдея ',
            origin: ' Internal source ',
          },
          { status: 201 },
        );
      }
      if (path === '/api/ideas')
        return saved
          ? Response.json({}, { status: 500 })
          : Response.json({
              companyId: COMPANY,
              ideas: [],
              total: 0,
              nextCursor: null,
            });
      if (path === `/api/ideas/${IDEA}`)
        return Response.json({
          ...original,
          description: '  Literal draft\nИдея ',
          origin: ' Internal source ',
        });
      if (path === `/api/ideas/${IDEA}/dispositions`)
        return Response.json({
          ideaId: IDEA,
          entries: [],
          total: 0,
          nextCursor: null,
        });
      return Response.json({}, { status: 404 });
    });
    render(<App identity={identity} />);
    fireEvent.change(await screen.findByLabelText('Description'), {
      target: { value: '  Literal draft\nИдея ' },
    });
    fireEvent.change(screen.getByLabelText('Origin'), {
      target: { value: ' Internal source ' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Record Idea' }));
    expect(
      await screen.findByText(/The save could not be confirmed/u),
    ).toBeVisible();
    fireEvent.click(
      screen.getByRole('button', { name: 'Retry unchanged save' }),
    );
    expect(
      await screen.findByText(/Saved. The confirmed result/u),
    ).toBeVisible();
    expect(await screen.findByText(/This read failed/u)).toBeVisible();
    expect(submissions).toHaveLength(2);
    expect(submissions[1]).toEqual(submissions[0]);
    expect(submissions[0]?.key).toBeTruthy();
    expect(submissions[0]?.contentType).toBe('application/json');
    expect(submissions[0]?.body).toBe(
      JSON.stringify({
        description: '  Literal draft\nИдея ',
        origin: ' Internal source ',
      }),
    );
  });
  it.each([false, true])(
    'reopens the current history after a creation receipt replay (first detail read fails: %s)',
    async (firstReadFails) => {
      const submissions: { body: RequestInit['body']; key: string | null }[] =
        [];
      const rejected = { ...original, revision: 2, disposition: 'rejected' };
      const disposition = {
        id: 'other-review',
        ideaId: IDEA,
        precedingRevision: 1,
        revision: 2,
        kind: 'rejected',
        reason: 'Boris rejected this Idea before the creation retry.',
        reconsiderationDate: null,
        recordedBy: {
          workspaceMembershipId: 'member-b',
          internalUserId: 'person-b',
          displayName: 'Boris',
        },
        recordedAt: '2026-10-20T06:00:00.000Z',
      };
      let committed = false;
      let reviewed = false;
      let detailReads = 0;
      let finishDetail: ((response: Response) => void) | undefined;
      vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
        const path = new URL(String(input), window.location.origin).pathname;
        if (path === '/api/access/current-actor')
          return Response.json(writingActor());
        if (path === '/api/companies')
          return Response.json([
            { id: COMPANY, displayName: 'Synthetic Company' },
          ]);
        if (path === '/api/activity-log') return Response.json({ events: [] });
        if (path === '/api/ideas' && init?.method === 'POST') {
          submissions.push({
            body: init.body,
            key: new Headers(init.headers).get('idempotency-key'),
          });
          if (submissions.length === 1) {
            committed = true;
            throw new TypeError(
              'Creation committed but its response was lost.',
            );
          }
          // An unchanged retry returns its original receipt, not current state.
          return Response.json(original, { status: 201 });
        }
        if (path === '/api/ideas')
          return Response.json({
            companyId: COMPANY,
            ideas: committed ? [reviewed ? rejected : original] : [],
            total: committed ? 1 : 0,
            nextCursor: null,
          });
        if (path === `/api/ideas/${IDEA}`) {
          detailReads += 1;
          if (detailReads > 1) return Response.json(rejected);
          return new Promise<Response>((resolve) => {
            finishDetail = resolve;
          });
        }
        if (path === `/api/ideas/${IDEA}/dispositions`)
          return Response.json({
            ideaId: IDEA,
            entries: [disposition],
            total: 1,
            nextCursor: null,
          });
        return Response.json({}, { status: 404 });
      });
      render(<App identity={identity} />);
      fireEvent.change(await screen.findByLabelText('Description'), {
        target: { value: original.description },
      });
      fireEvent.change(screen.getByLabelText('Origin'), {
        target: { value: original.origin },
      });
      fireEvent.click(screen.getByRole('button', { name: 'Record Idea' }));
      expect(
        await screen.findByText(/The save could not be confirmed/u),
      ).toBeVisible();
      reviewed = true;
      fireEvent.click(
        screen.getByRole('button', { name: 'Retry unchanged save' }),
      );
      expect(
        await screen.findByText(/Saved. The confirmed result/u),
      ).toBeVisible();
      expect(
        screen.queryByText('No dispositions recorded.'),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole('article', { name: 'Original submission' }),
      ).not.toBeInTheDocument();
      await waitFor(() => expect(finishDetail).toBeDefined());
      await act(async () => {
        finishDetail?.(
          firstReadFails
            ? Response.json({}, { status: 500 })
            : Response.json(rejected),
        );
      });
      if (firstReadFails) {
        expect(await screen.findByText(/This read failed/u)).toBeVisible();
        expect(screen.getByText(/Saved. The confirmed result/u)).toBeVisible();
        expect(screen.queryByText(disposition.reason)).not.toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Reload Idea' }));
      }
      expect(await screen.findByText(disposition.reason)).toBeVisible();
      const detail = within(
        screen.getByRole('article', { name: 'Original submission' }),
      );
      expect(detail.getByText(original.origin)).toBeVisible();
      expect(detail.getByText('Submitted by: Ana')).toBeVisible();
      expect(detail.getByText(/Revision 2/u)).toBeVisible();
      expect(detail.getAllByText('Rejected')).toHaveLength(2);
      expect(detail.getByText(/^Boris ·/u)).toBeVisible();
      expect(detail.queryByText('New')).not.toBeInTheDocument();
      expect(
        detail.queryByText('No dispositions recorded.'),
      ).not.toBeInTheDocument();
      expect(screen.getByText(/Saved. The confirmed result/u)).toBeVisible();
      expect(screen.queryByText(/This read failed/u)).not.toBeInTheDocument();
      expect(submissions).toHaveLength(2);
      expect(submissions[1]).toEqual(submissions[0]);
      expect(submissions[0]?.key).toBeTruthy();
      expect(submissions[0]?.body).toBe(
        JSON.stringify({
          description: original.description,
          origin: original.origin,
        }),
      );
    },
  );

  it.each([
    { date: '0000-01-01', valid: false },
    { date: '0001-01-01', valid: true },
    { date: '9999-12-31', valid: true },
    { date: '2024-02-29', valid: true },
  ])(
    'validates calendar date $date from real App history at the HTTP boundary',
    async ({ date, valid }) => {
      const current = { ...original, revision: 2, disposition: 'deferred' };
      vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
        const path = new URL(String(input), window.location.origin).pathname;
        if (path === '/api/access/current-actor') return Response.json(actor());
        if (path === '/api/companies')
          return Response.json([
            { id: COMPANY, displayName: 'Synthetic Company' },
          ]);
        if (path === '/api/activity-log') return Response.json({ events: [] });
        if (path === '/api/ideas')
          return Response.json({
            companyId: COMPANY,
            ideas: [current],
            total: 1,
            nextCursor: null,
          });
        if (path === `/api/ideas/${IDEA}`) return Response.json(current);
        if (path === `/api/ideas/${IDEA}/dispositions`)
          return Response.json({
            ideaId: IDEA,
            entries: [
              {
                id: 'calendar-review',
                ideaId: IDEA,
                precedingRevision: 1,
                revision: 2,
                kind: 'deferred',
                reason: 'Preserved calendar reason',
                reconsiderationDate: date,
                recordedBy: original.submittedBy,
                recordedAt: '2026-10-20T06:00:00.000Z',
              },
            ],
            total: 1,
            nextCursor: null,
          });
        return Response.json({}, { status: 404 });
      });
      render(<App identity={identity} />);
      fireEvent.click(
        await screen.findByRole('button', {
          name: /Reduce repeated questionnaire entry/u,
        }),
      );
      if (valid) {
        expect(
          await screen.findByText('Preserved calendar reason'),
        ).toBeVisible();
        expect(screen.getByText('Internal suggestion')).toBeVisible();
        expect(screen.queryByText(/This read failed/u)).not.toBeInTheDocument();
      } else {
        expect(await screen.findByText(/This read failed/u)).toBeVisible();
        expect(
          screen.queryByText('Preserved calendar reason'),
        ).not.toBeInTheDocument();
        expect(
          screen.queryByText('Internal suggestion'),
        ).not.toBeInTheDocument();
      }
    },
  );

  it('requires a fresh reload after stale review before submitting a new attributed disposition', async () => {
    const reader = actor();
    if (!reader.activeCompany) throw new Error('Company fixture required');
    const reviewer: ActorContext = {
      ...reader,
      activeCompany: {
        ...reader.activeCompany,
        ideasReviewerPermissions: ['idea.disposition.record'],
        ideasReviewerPermissionAssignmentId: 'reviewer-a',
        ideasReviewerPermissionSetVersion: 'v1',
      },
    };
    const other = {
      id: 'other-review',
      ideaId: IDEA,
      precedingRevision: 1,
      revision: 2,
      kind: 'deferred',
      reason: 'Other reviewer reason',
      reconsiderationDate: null,
      recordedBy: {
        workspaceMembershipId: 'member-b',
        internalUserId: 'person-b',
        displayName: 'Boris',
      },
      recordedAt: '2026-10-20T06:00:00.000Z',
    };
    let revision = 1;
    const submissions: { key: string | null; body: unknown }[] = [];
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const path = new URL(String(input), window.location.origin).pathname;
      if (path === '/api/access/current-actor') return Response.json(reviewer);
      if (path === '/api/companies')
        return Response.json([
          { id: COMPANY, displayName: 'Synthetic Company' },
        ]);
      if (path === '/api/activity-log') return Response.json({ events: [] });
      const current = {
        ...original,
        revision,
        disposition:
          revision === 1 ? 'new' : revision === 2 ? 'deferred' : 'rejected',
      };
      if (path === '/api/ideas')
        return Response.json({
          companyId: COMPANY,
          ideas: [current],
          total: 1,
          nextCursor: null,
        });
      if (path === `/api/ideas/${IDEA}`) return Response.json(current);
      if (
        path === `/api/ideas/${IDEA}/dispositions` &&
        init?.method === 'POST'
      ) {
        if (typeof init.body !== 'string')
          throw new Error('Expected serialized command.');
        const body: unknown = JSON.parse(init.body);
        submissions.push({
          key: new Headers(init.headers).get('idempotency-key'),
          body,
        });
        if (submissions.length === 1) {
          revision = 2;
          return Response.json({ code: 'STALE_VERSION' }, { status: 409 });
        }
        revision = 3;
        return Response.json(
          {
            idea: { ...original, revision: 3, disposition: 'rejected' },
            entry: {
              ...other,
              id: 'our-review',
              precedingRevision: 2,
              revision: 3,
              kind: 'rejected',
              reason: 'Deliberate fresh reason',
              recordedBy: original.submittedBy,
            },
          },
          { status: 201 },
        );
      }
      if (path === `/api/ideas/${IDEA}/dispositions`)
        return Response.json({
          ideaId: IDEA,
          total: revision - 1,
          nextCursor: null,
          entries:
            revision === 1
              ? []
              : revision === 2
                ? [other]
                : [
                    {
                      ...other,
                      id: 'our-review',
                      precedingRevision: 2,
                      revision: 3,
                      kind: 'rejected',
                      reason: 'Deliberate fresh reason',
                      recordedBy: original.submittedBy,
                    },
                    other,
                  ],
        });
      return Response.json({}, { status: 404 });
    });
    render(<App identity={identity} />);
    fireEvent.click(
      await screen.findByRole('button', {
        name: /Reduce repeated questionnaire entry/u,
      }),
    );
    fireEvent.change(await screen.findByLabelText('Reason'), {
      target: { value: 'First intent' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Record disposition' }));
    expect(await screen.findByText(/This Idea changed/u)).toBeVisible();
    expect(
      screen.getByRole('button', { name: 'Record disposition' }),
    ).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Reload Idea' }));
    expect(await screen.findByText('Other reviewer reason')).toBeVisible();
    expect(screen.getByLabelText('Reason')).toHaveValue('');
    selectOption(screen.getByLabelText('Disposition'), 'rejected');
    fireEvent.change(screen.getByLabelText('Reason'), {
      target: { value: 'Deliberate fresh reason' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Record disposition' }));
    expect(
      await screen.findByText(/Saved. The confirmed result/u),
    ).toBeVisible();
    expect(await screen.findByText('Deliberate fresh reason')).toBeVisible();
    expect(submissions[1]?.body).toEqual({
      kind: 'rejected',
      reason: 'Deliberate fresh reason',
      expectedRevision: 2,
    });
    expect(submissions[1]?.key).not.toBe(submissions[0]?.key);
  });

  it.each([
    'reader-id',
    'reader-version',
    'recorder-id',
    'recorder-version',
    'reviewer-id',
    'reviewer-version',
    'context-loss',
  ])(
    'retires drafts and suppresses a late detail response after %s is revalidated by the real App',
    async (change) => {
      const initial = writingActor();
      let nextActor: unknown = initial;
      let denyNextList = false;
      let resolveDetail: ((response: Response) => void) | undefined;
      let detailRequested = false;
      vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
        const path = new URL(String(input), window.location.origin).pathname;
        if (path === '/api/access/current-actor')
          return Response.json(nextActor);
        if (path === '/api/companies')
          return Response.json([
            { id: COMPANY, displayName: 'Synthetic Company' },
          ]);
        if (path === '/api/activity-log') return Response.json({ events: [] });
        if (path === '/api/ideas') {
          if (denyNextList) {
            denyNextList = false;
            return Response.json({}, { status: 403 });
          }
          return Response.json({
            companyId: COMPANY,
            ideas: [original],
            total: 1,
            nextCursor: null,
          });
        }
        if (path === `/api/ideas/${IDEA}`) {
          detailRequested = true;
          return new Promise<Response>((resolve) => {
            resolveDetail = resolve;
          });
        }
        if (path === `/api/ideas/${IDEA}/dispositions`)
          return Response.json({
            ideaId: IDEA,
            entries: [],
            total: 0,
            nextCursor: null,
          });
        return Response.json({}, { status: 404 });
      });
      render(<App identity={identity} />);
      fireEvent.change(await screen.findByLabelText('Description'), {
        target: { value: 'Retired confidential draft' },
      });
      fireEvent.change(screen.getByLabelText('Origin'), {
        target: { value: 'Retired confidential source' },
      });
      fireEvent.click(
        await screen.findByRole('button', {
          name: /Reduce repeated questionnaire entry/u,
        }),
      );
      await waitFor(() => expect(detailRequested).toBe(true));
      const company = initial.activeCompany;
      if (!company) throw new Error('Missing Company fixture.');
      const [role, field] = change.split('-');
      nextActor =
        change === 'context-loss'
          ? { ...initial, activeCompany: undefined }
          : {
              ...initial,
              activeCompany: {
                ...company,
                [`ideas${role === 'reader' ? 'Reader' : role === 'recorder' ? 'Recorder' : 'Reviewer'}Permission${field === 'id' ? 'AssignmentId' : 'SetVersion'}`]:
                  field === 'id'
                    ? 'fresh-assignment'
                    : 'unknown-future-version',
              },
            };
      denyNextList = true;
      fireEvent.click(screen.getByRole('button', { name: 'Refresh Ideas' }));
      await waitFor(() =>
        expect(
          screen.queryByDisplayValue('Retired confidential draft'),
        ).not.toBeInTheDocument(),
      );
      await act(async () => {
        resolveDetail?.(Response.json(original));
      });
      expect(screen.queryByText('Internal suggestion')).not.toBeInTheDocument();
      expect(
        screen.queryByDisplayValue('Retired confidential source'),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByText(/Saved. The confirmed result/u),
      ).not.toBeInTheDocument();
    },
  );

  it('suppresses a late committed save from a retired browser identity and starts the new session with empty fields', async () => {
    let resolveSave: ((response: Response) => void) | undefined;
    let saveStarted = false;
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const path = new URL(String(input), window.location.origin).pathname;
      if (path === '/api/access/current-actor')
        return Response.json(writingActor());
      if (path === '/api/companies')
        return Response.json([
          { id: COMPANY, displayName: 'Synthetic Company' },
        ]);
      if (path === '/api/activity-log') return Response.json({ events: [] });
      if (path === '/api/ideas' && init?.method === 'POST') {
        saveStarted = true;
        return new Promise<Response>((resolve) => {
          resolveSave = resolve;
        });
      }
      if (path === '/api/ideas')
        return Response.json({
          companyId: COMPANY,
          ideas: [],
          total: 0,
          nextCursor: null,
        });
      return Response.json({}, { status: 404 });
    });
    const view = render(<App identity={identity} />);
    fireEvent.change(await screen.findByLabelText('Description'), {
      target: { value: 'Old identity draft' },
    });
    fireEvent.change(screen.getByLabelText('Origin'), {
      target: { value: 'Old identity source' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Record Idea' }));
    await waitFor(() => expect(saveStarted).toBe(true));
    view.rerender(
      <App
        identity={deterministicBrowserIdentity({
          'x-test-external-subject': 'new-synthetic-identity',
        })}
      />,
    );
    expect(await screen.findByLabelText('Description')).toHaveValue('');
    await act(async () => {
      resolveSave?.(
        Response.json(
          {
            ...original,
            description: 'Old identity draft',
            origin: 'Old identity source',
          },
          { status: 201 },
        ),
      );
    });
    expect(
      screen.queryByText(/Saved. The confirmed result/u),
    ).not.toBeInTheDocument();
    expect(screen.queryByText('Old identity source')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Description')).toHaveValue('');
  });

  it.each([
    { status: 401, actorDenied: false },
    { status: 403, actorDenied: true },
    { status: 403, actorDenied: false },
  ])(
    'retires displayed private data and drafts when the real App observes HTTP $status access loss (workspace refusal: $actorDenied)',
    async ({ status, actorDenied }) => {
      let refused = false;
      const browserIdentity = {
        ...identity,
        rejectSession: vi.fn(async () => undefined),
      };
      vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
        const path = new URL(String(input), window.location.origin).pathname;
        if (path === '/api/access/current-actor')
          return refused && actorDenied
            ? Response.json({}, { status: 403 })
            : Response.json(writingActor());
        if (path === '/api/companies')
          return Response.json([
            { id: COMPANY, displayName: 'Synthetic Company' },
          ]);
        if (path === '/api/activity-log') return Response.json({ events: [] });
        if (path === '/api/ideas')
          return refused
            ? Response.json({}, { status })
            : Response.json({
                companyId: COMPANY,
                ideas: [original],
                total: 1,
                nextCursor: null,
              });
        if (path === `/api/ideas/${IDEA}`) return Response.json(original);
        if (path === `/api/ideas/${IDEA}/dispositions`)
          return Response.json({
            ideaId: IDEA,
            entries: [],
            total: 0,
            nextCursor: null,
          });
        return Response.json({}, { status: 404 });
      });
      render(<App identity={browserIdentity} />);
      fireEvent.click(
        await screen.findByRole('button', {
          name: /Reduce repeated questionnaire entry/u,
        }),
      );
      expect(await screen.findByText('Internal suggestion')).toBeVisible();
      fireEvent.change(screen.getByLabelText('Description'), {
        target: { value: 'Retired session confidential draft' },
      });
      refused = true;
      fireEvent.click(screen.getByRole('button', { name: 'Refresh Ideas' }));
      await waitFor(() =>
        expect(
          screen.queryByText('Internal suggestion'),
        ).not.toBeInTheDocument(),
      );
      expect(
        screen.queryByDisplayValue('Retired session confidential draft'),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole('button', {
          name: /Reduce repeated questionnaire entry/u,
        }),
      ).not.toBeInTheDocument();
      if (status === 401)
        expect(browserIdentity.rejectSession).toHaveBeenCalledOnce();
    },
  );

  it('preserves an uncertain intent across all four locale changes and section navigation', async () => {
    const submissions: { body: RequestInit['body']; key: string | null }[] = [];
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const path = new URL(String(input), window.location.origin).pathname;
      if (path === '/api/access/current-actor')
        return Response.json(writingActor());
      if (path === '/api/companies')
        return Response.json([
          { id: COMPANY, displayName: 'Synthetic Company' },
        ]);
      if (path === '/api/activity-log') return Response.json({ events: [] });
      if (path === '/api/ideas' && init?.method === 'POST') {
        submissions.push({
          body: init.body,
          key: new Headers(init.headers).get('idempotency-key'),
        });
        return Response.json({}, { status: 500 });
      }
      if (path === '/api/ideas')
        return Response.json({
          companyId: COMPANY,
          ideas: [],
          total: 0,
          nextCursor: null,
        });
      return Response.json({}, { status: 404 });
    });
    render(
      <>
        <InterfaceLocaleSelect />
        <App identity={identity} />
      </>,
    );
    const description = await screen.findByLabelText('Description');
    fireEvent.change(description, {
      target: { value: '  Literal multilingual intent — Идея\nîmbunătățire ' },
    });
    fireEvent.change(screen.getByLabelText('Origin'), {
      target: { value: '  Preserved origin  ' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Record Idea' }));
    expect(
      await screen.findByRole('button', { name: 'Retry unchanged save' }),
    ).toBeVisible();
    for (const locale of ['ro', 'ru', 'fr', 'en']) {
      const localeControl = document.getElementById('interface-locale');
      if (!localeControl) throw new Error('Missing real locale control.');
      selectOption(localeControl, locale);
      expect(document.documentElement.lang).toBe(locale);
      expect(description).toHaveValue(
        '  Literal multilingual intent — Идея\nîmbunătățire ',
      );
    }
    fireEvent.click(screen.getByRole('link', { name: 'Activity Log' }));
    fireEvent.click(screen.getByRole('link', { name: 'Ideas' }));
    expect(description).toHaveValue(
      '  Literal multilingual intent — Идея\nîmbunătățire ',
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'Retry unchanged save' }),
    );
    await waitFor(() => expect(submissions).toHaveLength(2));
    expect(submissions[1]).toEqual(submissions[0]);
  });
});

function writingActor(): ActorContext {
  const reader = actor();
  if (!reader.activeCompany) throw new Error('Missing Company fixture.');
  return {
    ...reader,
    activeCompany: {
      ...reader.activeCompany,
      ideasRecorderPermissions: ['idea.record'],
      ideasRecorderPermissionAssignmentId: 'recorder-a',
      ideasRecorderPermissionSetVersion: 'v1',
      ideasReviewerPermissions: ['idea.disposition.record'],
      ideasReviewerPermissionAssignmentId: 'reviewer-a',
      ideasReviewerPermissionSetVersion: 'v1',
    },
  };
}
