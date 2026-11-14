import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, waitFor } from '@testing-library/react';
import { render, screen } from '../test/render-with-interface-locale';
import { deterministicBrowserIdentity } from '../access-composition';
import { useInterfaceLocale } from '../localization/interface-locale';
import {
  actorWith,
  approverInCompany,
  grant,
  modelKinds,
} from './company-model-kinds.test-fixture';

afterEach(() => vi.unstubAllGlobals());

const decisionId = '70000000-0000-4000-8000-000000000900';
const withdrawalId = '71000000-0000-4000-8000-000000000900';
const successorId = '61000000-0000-4000-8000-000000000900';
const otherCompany = '11000000-0000-4000-8000-000000000900';

function LocaleSwitch() {
  const { changeLocale } = useInterfaceLocale();
  return (
    <button type="button" onClick={() => changeLocale('fr')}>
      Switch interface locale
    </button>
  );
}

for (const kind of modelKinds)
  describe(`${kind.name} model workspace`, () => {
    const {
      Workspace,
      root,
      model,
      content,
      attribution,
      actor,
      approverActor,
    } = kind;
    const summary = {
      id: model.head.id,
      versionNumber: 1,
      sourceKind: 'ILLUSTRATIVE',
      serviceTitle: content.serviceTitle,
    };
    const approved = {
      ...model.head,
      decision: {
        id: decisionId,
        outcome: 'APPROVE',
        basis: 'Reviewed original content',
        ...attribution,
      },
    };
    const pendingSuccessor = {
      ...model,
      revision: 3,
      head: {
        ...model.head,
        id: successorId,
        versionNumber: 2,
        predecessorVersionId: model.head.id,
      },
      activeVersion: summary,
    };

    it('submits complete literal human-entered content and reloads the current pending version', async () => {
      let created = false;
      const commands: RequestInit[] = [];
      vi.stubGlobal(
        'fetch',
        vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
          const path = new URL(input.toString(), window.location.origin)
            .pathname;
          if (path === `${root}/versions` && init?.method === 'POST') {
            commands.push(init);
            created = true;
            return Response.json({ model }, { status: 201 });
          }
          if (path === root)
            return Response.json({ model: created ? model : null });
          if (path === `${root}/versions`)
            return Response.json({ versions: [], nextCursor: null });
          throw new Error('Unexpected model route.');
        }),
      );
      render(
        <Workspace actor={actor} identity={deterministicBrowserIdentity()} />,
      );
      fireEvent.click(
        await screen.findByRole('button', { name: 'New model version' }),
      );
      fireEvent.click(screen.getByLabelText('Source kind', { exact: true }));
      fireEvent.click(
        await screen.findByRole('option', { name: 'Illustrative content' }),
      );
      kind.fill();
      fireEvent.click(
        screen.getByRole('button', { name: 'Submit complete version' }),
      );
      await waitFor(() => expect(commands).toHaveLength(1));
      expect(commands[0]?.body).toBe(
        JSON.stringify({ expectedModelRevision: 0, content }),
      );
      expect(
        new Headers(commands[0]?.headers).get('idempotency-key'),
      ).toBeTruthy();
      expect(await screen.findByText('Version 1 saved.')).toBeVisible();
      expect(await screen.findByText('Awaiting model approval')).toBeVisible();
      expect(
        screen.getByRole('heading', { name: kind.firstSection.label })
          .nextElementSibling?.textContent,
      ).toBe(kind.firstSection.value);
      kind.expectDisplayed();
      expect(document.querySelector('script')).toBeNull();
    });

    it('marks every invalid form field and the decision basis for assistive technology', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn(async (input: RequestInfo | URL) => {
          const path = new URL(input.toString(), window.location.origin)
            .pathname;
          if (path === root) return Response.json({ model });
          throw new Error('Unexpected accessibility route.');
        }),
      );
      const identity = deterministicBrowserIdentity();
      const view = render(<Workspace actor={actor} identity={identity} />);
      fireEvent.click(
        await screen.findByRole('button', { name: 'New model version' }),
      );
      const title = screen.getByLabelText('Romanian service title', {
        exact: true,
      });
      expect(title).not.toHaveAttribute('aria-invalid');
      expect(title).not.toHaveAccessibleDescription();
      fireEvent.change(title, { target: { value: '   ' } });
      const form = title.closest('form');
      if (!form) throw new Error('The model form is not rendered.');
      fireEvent.submit(form);
      const message =
        'Check every required field and the content limits (64 KiB total). Your draft is preserved.';
      expect(await screen.findByRole('alert')).toHaveTextContent(message);
      for (const field of [
        title,
        screen.getByLabelText('Source description', { exact: true }),
        screen.getByLabelText(kind.firstSection.label, { exact: true }),
        screen.getByLabelText(`${kind.stageTitle.label} 1`, { exact: true }),
      ]) {
        expect(field).toHaveAttribute('aria-invalid', 'true');
        expect(field).toHaveAccessibleDescription(message);
      }
      view.unmount();
      render(<Workspace actor={approverActor} identity={identity} />);
      const basis = await screen.findByLabelText('Decision basis');
      fireEvent.change(basis, { target: { value: '   ' } });
      fireEvent.click(
        screen.getByRole('button', { name: 'Approve this exact version' }),
      );
      expect(basis).toHaveAttribute('aria-invalid', 'true');
      expect(basis).toHaveAccessibleDescription(message);
    });

    it.each(['APPROVE', 'REJECT'] as const)(
      'records an explicit %s decision for the reviewed exact version without editor authority',
      async (outcome) => {
        let decided = false;
        const commands: RequestInit[] = [];
        const decision = {
          id: decisionId,
          outcome,
          basis: ' Exact complete content reviewed ',
          ...attribution,
        };
        const result = {
          ...model,
          revision: 2,
          head: { ...model.head, decision },
          activeVersion: outcome === 'APPROVE' ? summary : null,
        };
        vi.stubGlobal(
          'fetch',
          vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
            const path = new URL(input.toString(), window.location.origin)
              .pathname;
            if (path.endsWith('/decision') && init?.method === 'POST') {
              commands.push(init);
              decided = true;
              return Response.json({ model: result }, { status: 201 });
            }
            if (path === root)
              return Response.json({ model: decided ? result : model });
            if (path === `${root}/versions`)
              return Response.json({ versions: [], nextCursor: null });
            throw new Error('Unexpected route.');
          }),
        );
        render(
          <Workspace
            actor={approverActor}
            identity={deterministicBrowserIdentity()}
          />,
        );
        fireEvent.change(await screen.findByLabelText('Decision basis'), {
          target: { value: decision.basis },
        });
        fireEvent.click(
          screen.getByRole('button', {
            name:
              outcome === 'APPROVE'
                ? 'Approve this exact version'
                : 'Reject this exact version',
          }),
        );
        expect(
          await screen.findByText('Decision for version 1 recorded.'),
        ).toBeVisible();
        expect(commands).toHaveLength(1);
        expect(commands[0]?.body).toBe(
          JSON.stringify({
            expectedModelRevision: 1,
            versionNumber: 1,
            outcome,
            basis: decision.basis,
          }),
        );
        expect(
          await screen.findByText(
            outcome === 'APPROVE'
              ? 'Available approved version: 1'
              : 'No approved version is currently available for new use.',
          ),
        ).toBeVisible();
        expect(
          screen.queryByRole('button', { name: 'New model version' }),
        ).toBeNull();
      },
    );

    function stubWithdrawal({ readsFail }: { readsFail: boolean }) {
      const reason = ' Exact older version withdrawn ';
      let withdrawn = false;
      const commands: { path: string; init: RequestInit }[] = [];
      const reads: string[] = [];
      vi.stubGlobal(
        'fetch',
        vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
          const path = new URL(input.toString(), window.location.origin)
            .pathname;
          if (path.endsWith('/withdrawal') && init?.method === 'POST') {
            commands.push({ path, init });
            withdrawn = true;
            return Response.json(
              {
                model: {
                  ...pendingSuccessor,
                  revision: 4,
                  activeVersion: null,
                },
              },
              { status: 201 },
            );
          }
          reads.push(path);
          if (path === `${root}/versions/${approved.id}`) {
            if (readsFail) return new Response(null, { status: 503 });
            return Response.json({
              version: {
                ...approved,
                withdrawal: withdrawn
                  ? { id: withdrawalId, reason, ...attribution }
                  : null,
              },
              currentSelection: {
                activeVersionId: withdrawn ? null : approved.id,
              },
            });
          }
          if (path === root) {
            if (withdrawn && readsFail)
              return new Response(null, { status: 503 });
            return Response.json({
              model: withdrawn
                ? { ...pendingSuccessor, revision: 4, activeVersion: null }
                : pendingSuccessor,
            });
          }
          if (path === `${root}/versions`)
            return Response.json({ versions: [], nextCursor: null });
          throw new Error('Unexpected route.');
        }),
      );
      return { reason, commands, reads };
    }

    it('withdraws the exact older active approval while preserving a pending successor', async () => {
      const { reason, commands } = stubWithdrawal({ readsFail: false });
      render(
        <Workspace
          actor={approverActor}
          identity={deterministicBrowserIdentity()}
        />,
      );
      fireEvent.change(await screen.findByLabelText('Withdrawal reason'), {
        target: { value: reason },
      });
      fireEvent.click(
        screen.getByRole('button', { name: 'Withdraw the active version' }),
      );
      expect(
        await screen.findByText('Withdrawal of version 1 recorded.'),
      ).toBeVisible();
      expect(
        await screen.findByText(
          'No approved version is currently available for new use.',
        ),
      ).toBeVisible();
      expect(
        screen.getByRole('heading', {
          name: `Version 2: ${content.serviceTitle}`,
        }),
      ).toBeVisible();
      expect(commands).toHaveLength(1);
      expect(commands[0]?.path).toBe(
        `${root}/versions/${approved.id}/withdrawal`,
      );
      expect(commands[0]?.init.body).toBe(
        JSON.stringify({ expectedModelRevision: 3, versionNumber: 1, reason }),
      );
    });

    it('reports a committed withdrawal as committed, never uncertain, when every follow-up read fails', async () => {
      const { reason, commands, reads } = stubWithdrawal({ readsFail: true });
      render(
        <Workspace
          actor={approverActor}
          identity={deterministicBrowserIdentity()}
        />,
      );
      fireEvent.change(await screen.findByLabelText('Withdrawal reason'), {
        target: { value: reason },
      });
      const readsBeforeCommand = reads.length;
      fireEvent.click(
        screen.getByRole('button', { name: 'Withdraw the active version' }),
      );
      expect(
        await screen.findByText('Withdrawal of version 1 recorded.'),
      ).toBeVisible();
      expect(
        await screen.findByText('The model could not be loaded. Try again.'),
      ).toBeVisible();
      expect(
        screen.queryByText(
          'The result is uncertain. Retry the identical command before making another change.',
        ),
      ).toBeNull();
      expect(
        screen.queryByRole('button', { name: 'Retry identical command' }),
      ).toBeNull();
      expect(commands).toHaveLength(1);
      expect(reads.slice(readsBeforeCommand)).toEqual([root]);
    });

    it.each([true, false])(
      'opens exact history and only an editor copies it against the current root revision (editor: %s)',
      async (canEdit) => {
        let created = false;
        const commands: RequestInit[] = [];
        const current = {
          ...model,
          revision: 3,
          head: {
            ...model.head,
            id: successorId,
            versionNumber: 2,
            predecessorVersionId: model.head.id,
            content: kind.successorContent,
          },
          activeVersion: summary,
        };
        const original = {
          ...model.head,
          decision: {
            id: decisionId,
            outcome: 'APPROVE',
            basis: ' Original independent review basis ',
            ...attribution,
          },
        };
        const successor = {
          ...current,
          revision: 4,
          head: {
            ...current.head,
            id: '62000000-0000-4000-8000-000000000900',
            versionNumber: 3,
            predecessorVersionId: current.head.id,
            content: original.content,
          },
        };
        vi.stubGlobal(
          'fetch',
          vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
            const path = new URL(input.toString(), window.location.origin)
              .pathname;
            if (path === `${root}/versions` && init?.method === 'POST') {
              commands.push(init);
              created = true;
              return Response.json({ model: successor }, { status: 201 });
            }
            if (path === root)
              return Response.json({ model: created ? successor : current });
            if (path === `${root}/versions`)
              return Response.json({
                versions: [
                  {
                    id: original.id,
                    versionNumber: 1,
                    predecessorVersionId: null,
                    sourceKind: 'ILLUSTRATIVE',
                    serviceTitle: content.serviceTitle,
                    ...attribution,
                    decision: {
                      outcome: 'APPROVE',
                      recordedAt: attribution.recordedAt,
                    },
                  },
                ],
                nextCursor: null,
              });
            if (path === `${root}/versions/${original.id}`)
              return Response.json({
                version: original,
                currentSelection: { activeVersionId: original.id },
              });
            throw new Error('Unexpected history route.');
          }),
        );
        render(
          <Workspace
            actor={canEdit ? actor : approverActor}
            identity={deterministicBrowserIdentity()}
          />,
        );
        fireEvent.click(
          await screen.findByRole('button', { name: 'Version history' }),
        );
        fireEvent.click(
          await screen.findByRole('button', { name: 'Open version 1' }),
        );
        expect(
          await screen.findByRole('heading', {
            name: `Version 1: ${content.serviceTitle}`,
          }),
        ).toBeVisible();
        expect(
          screen.getByText('Original independent review basis'),
        ).toBeVisible();
        expect(
          screen.getByText(
            'Historical content; availability is shown in the current model above.',
          ),
        ).toBeVisible();
        expect(
          screen.getByRole('heading', {
            name: 'Version 2: Succesor demonstrativ',
          }),
        ).toBeVisible();
        if (!canEdit) {
          expect(
            screen.queryByRole('button', {
              name: 'Copy this version into a new draft',
            }),
          ).toBeNull();
          return;
        }
        fireEvent.click(
          await screen.findByRole('button', {
            name: 'Copy this version into a new draft',
          }),
        );
        expect(
          screen.getByLabelText('Romanian service title', { exact: true }),
        ).toHaveValue(content.serviceTitle);
        expect(
          screen.getByLabelText(kind.firstSection.label, { exact: true }),
        ).toHaveValue(kind.firstSection.value);
        for (let number = 1; number <= kind.stageTitle.count; number++)
          expect(
            screen.getByLabelText(`${kind.stageTitle.label} ${number}`, {
              exact: true,
            }),
          ).toHaveValue(kind.stageTitle.value(number));
        fireEvent.click(
          screen.getByRole('button', { name: 'Submit complete version' }),
        );
        expect(await screen.findByText('Version 3 saved.')).toBeVisible();
        expect(commands).toHaveLength(1);
        expect(commands[0]?.body).toBe(
          JSON.stringify({
            expectedModelRevision: 3,
            content: original.content,
          }),
        );
        fireEvent.click(
          screen.getByRole('button', { name: 'Version history' }),
        );
        fireEvent.click(
          await screen.findByRole('button', { name: 'Open version 1' }),
        );
        expect(
          await screen.findByText('Original independent review basis'),
        ).toBeVisible();
      },
    );

    it('retries a malformed successful decision reply literally and then rereads current selection instead of displaying the historical receipt as current', async () => {
      const decision = {
        id: decisionId,
        outcome: 'APPROVE',
        basis: ' Exact literal uncertain decision ',
        ...attribution,
      };
      const receipt = {
        ...model,
        revision: 2,
        head: { ...model.head, decision },
        activeVersion: summary,
      };
      const later = {
        ...model,
        revision: 3,
        head: {
          ...model.head,
          id: successorId,
          versionNumber: 2,
          predecessorVersionId: model.head.id,
          content: { ...content, serviceTitle: 'Succesor ulterior' },
        },
        activeVersion: summary,
      };
      const commands: RequestInit[] = [];
      vi.stubGlobal(
        'fetch',
        vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
          const path = new URL(input.toString(), window.location.origin)
            .pathname;
          if (path.endsWith('/decision') && init?.method === 'POST') {
            commands.push(init);
            return Response.json(
              commands.length === 1
                ? {
                    model: {
                      ...receipt,
                      companyId: '19000000-0000-4000-8000-000000000900',
                    },
                  }
                : { model: receipt },
              { status: 201 },
            );
          }
          if (path === root)
            return Response.json({ model: commands.length ? later : model });
          throw new Error('Unexpected route.');
        }),
      );
      render(
        <Workspace
          actor={approverActor}
          identity={deterministicBrowserIdentity()}
        />,
      );
      fireEvent.change(await screen.findByLabelText('Decision basis'), {
        target: { value: decision.basis },
      });
      fireEvent.click(
        screen.getByRole('button', { name: 'Approve this exact version' }),
      );
      expect(
        await screen.findByText(
          'The result is uncertain. Retry the identical command before making another change.',
        ),
      ).toBeVisible();
      expect(
        screen.getByRole('button', { name: 'Reject this exact version' }),
      ).toBeDisabled();
      expect(screen.getByLabelText('Decision basis')).toHaveValue(
        decision.basis,
      );
      fireEvent.click(
        screen.getByRole('button', { name: 'Retry identical command' }),
      );
      expect(
        await screen.findByText('Decision for version 1 recorded.'),
      ).toBeVisible();
      expect(
        await screen.findByRole('heading', {
          name: 'Version 2: Succesor ulterior',
        }),
      ).toBeVisible();
      expect(commands).toHaveLength(2);
      expect(commands[0]?.body).toBe(commands[1]?.body);
      expect(new Headers(commands[0]?.headers).get('idempotency-key')).toBe(
        new Headers(commands[1]?.headers).get('idempotency-key'),
      );
    });

    it('retires protected draft and content when a current model read loses authority', async () => {
      let reads = 0;
      const onActorRevalidated = vi.fn();
      vi.stubGlobal(
        'fetch',
        vi.fn(async (input: RequestInfo | URL) => {
          const path = new URL(input.toString(), window.location.origin)
            .pathname;
          if (path === root)
            return ++reads === 1
              ? Response.json({ model })
              : new Response(null, { status: 403 });
          if (path === '/api/access/current-actor')
            return Response.json(actorWith(kind, { actor, grants: [] }));
          throw new Error('Unexpected retirement route.');
        }),
      );
      render(
        <Workspace
          actor={actor}
          identity={deterministicBrowserIdentity()}
          onActorRevalidated={onActorRevalidated}
        />,
      );
      fireEvent.click(
        await screen.findByRole('button', {
          name: 'Copy current version into a new draft',
        }),
      );
      expect(screen.getByLabelText('Romanian service title')).toHaveValue(
        content.serviceTitle,
      );
      fireEvent.click(
        screen.getByRole('button', { name: 'Reload the current model' }),
      );
      expect(
        await screen.findByText('Model access is no longer available.'),
      ).toBeVisible();
      expect(screen.queryByLabelText('Romanian service title')).toBeNull();
      expect(screen.queryByText(kind.protectedText)).toBeNull();
      await waitFor(() => expect(onActorRevalidated).toHaveBeenCalledOnce());
    });

    it('preserves an uncertain literal command across equal-authority Actor and interface locale changes and retires it when the captured grant changes', async () => {
      let writes = 0;
      vi.stubGlobal(
        'fetch',
        vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
          const path = new URL(input.toString(), window.location.origin)
            .pathname;
          if (init?.method === 'POST') {
            writes += 1;
            return new Response(null, { status: 503 });
          }
          if (path === root) return Response.json({ model });
          throw new Error('Unexpected route.');
        }),
      );
      const identity = deterministicBrowserIdentity();
      const view = render(
        <>
          <LocaleSwitch />
          <Workspace actor={approverActor} identity={identity} />
        </>,
      );
      fireEvent.change(await screen.findByLabelText('Decision basis'), {
        target: { value: ' Literal Romanian decision ' },
      });
      fireEvent.click(
        screen.getByRole('button', { name: 'Approve this exact version' }),
      );
      await screen.findByRole('button', { name: 'Retry identical command' });
      const requestsBeforeActor = vi.mocked(fetch).mock.calls.length;
      view.rerender(
        <>
          <LocaleSwitch />
          <Workspace actor={{ ...approverActor }} identity={identity} />
        </>,
      );
      expect(screen.getByLabelText('Decision basis')).toHaveValue(
        ' Literal Romanian decision ',
      );
      expect(
        screen.getByRole('button', { name: 'Retry identical command' }),
      ).toBeEnabled();
      expect(vi.mocked(fetch).mock.calls).toHaveLength(requestsBeforeActor);
      fireEvent.click(
        screen.getByRole('button', { name: 'Switch interface locale' }),
      );
      expect(screen.getByLabelText('Motif de la décision')).toHaveValue(
        ' Literal Romanian decision ',
      );
      expect(
        screen.getByRole('button', { name: 'Réessayer la commande identique' }),
      ).toBeEnabled();
      expect(writes).toBe(1);
      view.rerender(
        <>
          <LocaleSwitch />
          <Workspace
            actor={actorWith(kind, { grants: [] })}
            identity={identity}
          />
        </>,
      );
      expect(screen.queryByText(' Literal Romanian decision ')).toBeNull();
      expect(
        screen.queryByRole('button', {
          name: 'Réessayer la commande identique',
        }),
      ).toBeNull();
    });

    it.each(['Company', 'session', 'grant'] as const)(
      'discards a late protected root after the %s epoch changes',
      async (change) => {
        let release: ((response: Response) => void) | undefined;
        let reads = 0;
        vi.stubGlobal(
          'fetch',
          vi.fn(async () => {
            if (++reads === 1)
              return new Promise<Response>((resolve) => {
                release = resolve;
              });
            return Response.json({ model: null });
          }),
        );
        const identity = deterministicBrowserIdentity();
        const view = render(
          <Workspace actor={approverActor} identity={identity} />,
        );
        await waitFor(() => expect(release).toBeDefined());
        const next =
          change === 'Company'
            ? approverInCompany(kind, otherCompany, 'Other synthetic Company')
            : change === 'grant'
              ? actorWith(kind, {
                  grants: [
                    grant(
                      kind.approver,
                      '42000000-0000-4000-8000-000000000900',
                    ),
                  ],
                })
              : approverActor;
        view.rerender(
          <Workspace
            actor={next}
            identity={
              change === 'session' ? deterministicBrowserIdentity() : identity
            }
          />,
        );
        await screen.findByText(
          `No consulting ${kind.name} model has been configured.`,
        );
        await act(async () => {
          release?.(Response.json({ model }));
        });
        expect(screen.queryByText(kind.protectedText)).toBeNull();
        expect(screen.queryByLabelText('Decision basis')).toBeNull();
      },
    );

    it.each([
      { label: 'absent', grants: () => undefined },
      { label: 'null', grants: () => null },
      { label: 'empty', grants: () => [] },
      { label: 'string', grants: () => 'v1' },
      {
        label: 'unsupported version',
        grants: () => [
          grant(kind.editor, '40000000-0000-4000-8000-000000000900', {
            permissionSetVersion: 'v2',
          }),
        ],
      },
      {
        label: 'incomplete permissions',
        grants: () => [
          grant(kind.editor, '40000000-0000-4000-8000-000000000900', {
            permissions: kind.editor.permissions.slice(0, 1),
          }),
        ],
      },
    ])(
      'fails closed before reading protected content for an $label captured grant',
      ({ grants }) => {
        const fetch = vi.fn();
        vi.stubGlobal('fetch', fetch);
        render(
          <Workspace
            actor={actorWith(kind, { actor, grants: grants() })}
            identity={deterministicBrowserIdentity()}
          />,
        );
        expect(
          screen.queryByRole('heading', {
            name: `Consulting ${kind.name} model`,
          }),
        ).toBeNull();
        expect(fetch).not.toHaveBeenCalled();
      },
    );

    it.each(['history', 'exact'] as const)(
      'clears a denied %s read immediately and completes shell actor revalidation after its child unmounts',
      async (mode) => {
        let releaseActor: ((response: Response) => void) | undefined;
        const actorReply = new Promise<Response>((resolve) => {
          releaseActor = resolve;
        });
        const onActorRevalidated = vi.fn();
        vi.stubGlobal(
          'fetch',
          vi.fn(async (input: RequestInfo | URL) => {
            const path = new URL(input.toString(), window.location.origin)
              .pathname;
            if (path === root) return Response.json({ model });
            if (path === `${root}/versions`)
              return mode === 'history'
                ? new Response(null, { status: 403 })
                : Response.json({
                    versions: [
                      {
                        ...summary,
                        predecessorVersionId: null,
                        ...attribution,
                        decision: null,
                      },
                    ],
                    nextCursor: null,
                  });
            if (path.endsWith(model.head.id))
              return new Response(null, { status: 403 });
            if (path === '/api/access/current-actor') return actorReply;
            throw new Error('Unexpected revalidation route.');
          }),
        );
        render(
          <Workspace
            actor={actor}
            identity={deterministicBrowserIdentity()}
            onActorRevalidated={onActorRevalidated}
          />,
        );
        fireEvent.click(
          await screen.findByRole('button', { name: 'Version history' }),
        );
        if (mode === 'exact')
          fireEvent.click(
            await screen.findByRole('button', { name: 'Open version 1' }),
          );
        await screen.findByText('Model access is no longer available.');
        expect(screen.queryByText(kind.protectedText)).toBeNull();
        await act(async () => {
          releaseActor?.(Response.json(actorWith(kind, { actor, grants: [] })));
        });
        await waitFor(() => expect(onActorRevalidated).toHaveBeenCalledOnce());
      },
    );

    it.each(['Company', 'Workspace'] as const)(
      'completes %s rejection callbacks after a denied model-history child is retired',
      async (lost) => {
        let releaseWorkspace: ((response: Response) => void) | undefined;
        const workspaceReply = new Promise<Response>((resolve) => {
          releaseWorkspace = resolve;
        });
        const onActorRevalidated = vi.fn(),
          onCompanyContextRejected = vi.fn(),
          onWorkspaceAccessRejected = vi.fn();
        vi.stubGlobal(
          'fetch',
          vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
            const path = new URL(input.toString(), window.location.origin)
              .pathname;
            if (path === root) return Response.json({ model });
            if (path === `${root}/versions`)
              return new Response(null, { status: 403 });
            if (path === '/api/access/current-actor')
              return new Headers(init?.headers).has('x-company-context-id')
                ? new Response(null, { status: 403 })
                : workspaceReply;
            throw new Error('Unexpected access callback route.');
          }),
        );
        render(
          <Workspace
            actor={actor}
            identity={deterministicBrowserIdentity()}
            onActorRevalidated={onActorRevalidated}
            onCompanyContextRejected={onCompanyContextRejected}
            onWorkspaceAccessRejected={onWorkspaceAccessRejected}
          />,
        );
        fireEvent.click(
          await screen.findByRole('button', { name: 'Version history' }),
        );
        await screen.findByText('Model access is no longer available.');
        await act(async () => {
          releaseWorkspace?.(
            lost === 'Workspace'
              ? new Response(null, { status: 403 })
              : Response.json({ ...actor, activeCompany: undefined }),
          );
        });
        await waitFor(() =>
          expect(
            lost === 'Workspace'
              ? onWorkspaceAccessRejected
              : onCompanyContextRejected,
          ).toHaveBeenCalledOnce(),
        );
        if (lost === 'Company') {
          expect(onCompanyContextRejected).toHaveBeenCalledWith(
            model.companyId,
          );
          expect(onActorRevalidated).toHaveBeenCalledOnce();
        }
        expect(screen.queryByText(kind.protectedText)).toBeNull();
      },
    );

    it('retires the independent access revalidation when a denied history read is followed by a Company switch', async () => {
      let releaseActor: ((response: Response) => void) | undefined;
      const actorReply = new Promise<Response>((resolve) => {
        releaseActor = resolve;
      });
      const onActorRevalidated = vi.fn();
      vi.stubGlobal(
        'fetch',
        vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
          const path = new URL(input.toString(), window.location.origin)
            .pathname;
          if (path === root)
            return Response.json({
              model:
                new Headers(init?.headers).get('x-company-context-id') ===
                otherCompany
                  ? null
                  : model,
            });
          if (path === `${root}/versions`)
            return new Response(null, { status: 403 });
          if (path === '/api/access/current-actor') return actorReply;
          throw new Error('Unexpected access retirement route.');
        }),
      );
      const identity = deterministicBrowserIdentity();
      const view = render(
        <Workspace
          actor={actor}
          identity={identity}
          onActorRevalidated={onActorRevalidated}
        />,
      );
      fireEvent.click(
        await screen.findByRole('button', { name: 'Version history' }),
      );
      await screen.findByText('Model access is no longer available.');
      view.rerender(
        <Workspace
          actor={{
            ...actor,
            activeCompany: actor.activeCompany && {
              ...actor.activeCompany,
              id: otherCompany,
              displayName: 'Other synthetic Company',
            },
          }}
          identity={identity}
          onActorRevalidated={onActorRevalidated}
        />,
      );
      await screen.findByText(
        `No consulting ${kind.name} model has been configured.`,
      );
      await act(async () => {
        releaseActor?.(Response.json(actor));
      });
      expect(onActorRevalidated).not.toHaveBeenCalled();
      expect(screen.queryByText(kind.protectedText)).toBeNull();
    });

    it('keeps the exact retry owner when a cancelled earlier history response arrives late and retires it on a current grant change', async () => {
      let releaseHistory: ((value: Response) => void) | undefined;
      vi.stubGlobal(
        'fetch',
        vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
          const path = new URL(input.toString(), window.location.origin)
            .pathname;
          if (path === root) return Response.json({ model });
          if (path === `${root}/versions`)
            return new Promise<Response>((resolve) => {
              releaseHistory = resolve;
            });
          if (init?.method === 'POST')
            return Response.json({}, { status: 503 });
          if (path === '/api/access/current-actor')
            return Response.json({}, { status: 503 });
          throw new Error('Unexpected retirement route.');
        }),
      );
      const identity = deterministicBrowserIdentity();
      const { rerender } = render(
        <Workspace actor={approverActor} identity={identity} />,
      );
      fireEvent.click(
        await screen.findByRole('button', { name: 'Version history' }),
      );
      await waitFor(() => expect(releaseHistory).toBeTypeOf('function'));
      fireEvent.change(screen.getByLabelText('Decision basis'), {
        target: { value: 'Private exact review basis' },
      });
      fireEvent.click(
        screen.getByRole('button', { name: 'Approve this exact version' }),
      );
      await screen.findByRole('button', { name: 'Retry identical command' });
      await act(async () => {
        releaseHistory?.(Response.json({}, { status: 403 }));
      });
      expect(
        screen.getByRole('button', { name: 'Retry identical command' }),
      ).toBeVisible();
      expect(
        screen.getByRole('button', { name: 'Version history' }),
      ).toBeDisabled();
      expect(
        screen.getByRole('button', { name: 'Approve this exact version' }),
      ).toBeDisabled();
      rerender(
        <Workspace
          actor={actorWith(kind, { grants: [] })}
          identity={identity}
        />,
      );
      expect(
        screen.queryByRole('button', { name: 'Retry identical command' }),
      ).toBeNull();
      expect(screen.queryByText(kind.protectedText)).toBeNull();
    });

    it('retires delayed history recovery when a newer complete Actor keeps the same model authority', async () => {
      let releaseActor: ((response: Response) => void) | undefined;
      const actorReply = new Promise<Response>((resolve) => {
        releaseActor = resolve;
      });
      const onActorRevalidated = vi.fn();
      let recoverySignal: AbortSignal | null | undefined;
      vi.stubGlobal(
        'fetch',
        vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
          const path = new URL(input.toString(), window.location.origin)
            .pathname;
          if (path === root) return Response.json({ model });
          if (path === `${root}/versions`)
            return new Response(null, { status: 403 });
          if (path === '/api/access/current-actor') {
            recoverySignal = init?.signal;
            return actorReply;
          }
          throw new Error('Unexpected Actor replacement route.');
        }),
      );
      const identity = deterministicBrowserIdentity();
      const view = render(
        <Workspace
          actor={actor}
          identity={identity}
          onActorRevalidated={onActorRevalidated}
        />,
      );
      fireEvent.click(
        await screen.findByRole('button', { name: 'Version history' }),
      );
      await screen.findByText('Model access is no longer available.');
      await waitFor(() => expect(recoverySignal).toBeDefined());
      view.rerender(
        <Workspace
          actor={{ ...actor }}
          identity={identity}
          onActorRevalidated={onActorRevalidated}
        />,
      );
      expect(recoverySignal?.aborted).toBe(true);
      await act(async () => {
        releaseActor?.(Response.json(actor));
      });
      expect(onActorRevalidated).not.toHaveBeenCalled();
      expect(screen.queryByText(kind.protectedText)).toBeNull();
      expect(
        screen.getByRole('button', { name: 'Reload the current model' }),
      ).toBeEnabled();
    });

    it.each(['root', 'history', 'command'] as const)(
      'Refresh retires independent recovery after a denied %s before starting a fresh root',
      async (mode) => {
        let releaseActor: ((response: Response) => void) | undefined;
        const actorReply = new Promise<Response>((resolve) => {
          releaseActor = resolve;
        });
        let recoverySignal: AbortSignal | null | undefined;
        let rootReads = 0;
        const onActorRevalidated = vi.fn();
        vi.stubGlobal(
          'fetch',
          vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
            const path = new URL(input.toString(), window.location.origin)
              .pathname;
            if (init?.method === 'POST')
              return new Response(null, { status: 403 });
            if (path === root) {
              rootReads += 1;
              return mode === 'root' && rootReads === 1
                ? new Response(null, { status: 403 })
                : Response.json({ model });
            }
            if (path === `${root}/versions`)
              return new Response(null, { status: 403 });
            if (path === '/api/access/current-actor') {
              recoverySignal = init?.signal;
              return actorReply;
            }
            throw new Error('Unexpected denied Refresh route.');
          }),
        );
        render(
          <Workspace
            actor={approverActor}
            identity={deterministicBrowserIdentity()}
            onActorRevalidated={onActorRevalidated}
          />,
        );
        if (mode === 'history')
          fireEvent.click(
            await screen.findByRole('button', { name: 'Version history' }),
          );
        if (mode === 'command') {
          fireEvent.change(await screen.findByLabelText('Decision basis'), {
            target: { value: 'Literal decision' },
          });
          fireEvent.click(
            screen.getByRole('button', { name: 'Approve this exact version' }),
          );
        }
        await screen.findByText('Model access is no longer available.');
        await waitFor(() => expect(recoverySignal).toBeDefined());
        expect(recoverySignal?.aborted).toBe(false);
        expect(screen.queryByLabelText('Decision basis')).toBeNull();
        fireEvent.click(
          screen.getByRole('button', { name: 'Reload the current model' }),
        );
        expect(recoverySignal?.aborted).toBe(true);
        expect(await screen.findByLabelText('Decision basis')).toHaveValue('');
        expect(rootReads).toBe(2);
        await act(async () => {
          releaseActor?.(Response.json(approverActor));
        });
        expect(onActorRevalidated).not.toHaveBeenCalled();
        expect(
          screen.queryByText('Model access is no longer available.'),
        ).toBeNull();
      },
    );
  });
