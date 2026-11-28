import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { App } from './App';
import { deterministicBrowserIdentity } from './access-composition';
import { modelKinds } from './company-model/company-model-kinds.test-fixture';
import {
  commands,
  restoreBrowser,
  serve,
  stubBrowser,
} from './clarte/settings-config/settings-config.test-support';
import { renderInInterface } from './test/app-interface';
import {
  fireEvent,
  screen,
  waitFor,
  within,
} from './test/render-with-interface-locale';

// The synthetic Offer and Contract models of the shared model fixtures.
beforeEach(stubBrowser);
afterEach(restoreBrowser);

const decisionId = '70000000-0000-4000-8000-000000001547';
const withdrawalId = '71000000-0000-4000-8000-000000001547';
const successorId = '61000000-0000-4000-8000-000000001547';

for (const kind of modelKinds)
  describe(`The ${kind.name} model in the Clarté Settings console`, () => {
    const { root, model, content, attribution, actor, approverActor } = kind;
    const hash = kind.name === 'Offer' ? 'offer-models' : 'contract-models';
    const summary = {
      id: model.head.id,
      versionNumber: 1,
      sourceKind: 'ILLUSTRATIVE',
      serviceTitle: content.serviceTitle,
    };
    const approved = {
      ...model,
      revision: 2,
      head: {
        ...model.head,
        decision: {
          id: decisionId,
          outcome: 'APPROVE',
          basis: 'Conținut verificat',
          ...attribution,
        },
      },
      activeVersion: summary,
    };

    function open() {
      window.history.replaceState(null, '', `/#${hash}`);
      renderInInterface(
        'clarte',
        <App identity={deterministicBrowserIdentity()} />,
      );
    }

    it('reads the current version and proposes a complete copy of it as the next version (EX-096, EX-097, EX-116, EX-117)', async () => {
      const successor = {
        ...model,
        revision: 2,
        head: {
          ...model.head,
          id: successorId,
          versionNumber: 2,
          predecessorVersionId: model.head.id,
        },
      };
      let created = false;
      const sent = serve(
        () => actor,
        (request) => {
          if (
            request.path === `${root}/versions` &&
            request.method === 'POST'
          ) {
            created = true;
            return Response.json({ model: successor }, { status: 201 });
          }
          if (request.path === root)
            return Response.json({ model: created ? successor : model });
          return undefined;
        },
      );
      open();

      expect(
        await screen.findByRole('region', {
          name: 'No approved version is currently available for new use.',
        }),
      ).toBeVisible();
      const versions = screen.getByRole('region', { name: 'Versions' });
      expect(
        within(versions).getByText('Awaiting model approval'),
      ).toBeVisible();
      fireEvent.click(screen.getByRole('button', { name: 'Read' }));
      const reading = screen.getByRole('dialog', {
        name: 'Latest submitted version',
      });
      expect(
        within(reading).getByRole('heading', {
          name: `Version 1: ${content.serviceTitle}`,
        }),
      ).toBeVisible();
      kind.expectDisplayed();
      fireEvent.click(within(reading).getByRole('button', { name: 'Close' }));

      fireEvent.click(
        screen.getByRole('button', {
          name: 'Copy current version into a new draft',
        }),
      );
      const form = screen.getByRole('dialog', { name: 'New model version' });
      expect(
        within(form).getByLabelText('Romanian service title', { exact: true }),
      ).toHaveValue(content.serviceTitle);
      fireEvent.click(
        within(form).getByRole('button', { name: 'Submit complete version' }),
      );
      await waitFor(() =>
        expect(commands(sent, `${root}/versions`)).toHaveLength(1),
      );
      expect(commands(sent, `${root}/versions`)[0]?.body).toEqual({
        expectedModelRevision: 1,
        content,
      });
      expect(await screen.findByText('Version 2 saved.')).toBeVisible();
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('lets an approver approve the exact pending version with a basis, then withdraw it from new use (EX-098, EX-117)', async () => {
      let state: 'pending' | 'approved' | 'withdrawn' = 'pending';
      const withdrawn = {
        ...approved,
        revision: 3,
        head: {
          ...approved.head,
          withdrawal: {
            id: withdrawalId,
            reason: 'Înlocuit de o versiune nouă',
            ...attribution,
          },
        },
        activeVersion: null,
      };
      const sent = serve(
        () => approverActor,
        (request) => {
          if (request.path.endsWith('/decision')) {
            state = 'approved';
            return Response.json({ model: approved }, { status: 201 });
          }
          if (request.path.endsWith('/withdrawal')) {
            state = 'withdrawn';
            return Response.json({ model: withdrawn }, { status: 201 });
          }
          if (request.path === root)
            return Response.json({
              model:
                state === 'pending'
                  ? model
                  : state === 'approved'
                    ? approved
                    : withdrawn,
            });
          return undefined;
        },
      );
      open();

      fireEvent.click(await screen.findByRole('button', { name: 'Decide' }));
      const deciding = screen.getByRole('dialog', {
        name: 'Awaiting model approval',
      });
      fireEvent.change(within(deciding).getByLabelText('Decision basis'), {
        target: { value: 'Conținut verificat' },
      });
      fireEvent.click(
        within(deciding).getByRole('button', {
          name: 'Approve this exact version',
        }),
      );
      expect(
        await screen.findByText('Decision for version 1 recorded.'),
      ).toBeVisible();
      expect(
        commands(sent, `${root}/versions/${model.head.id}/decision`)[0]?.body,
      ).toEqual({
        expectedModelRevision: 1,
        versionNumber: 1,
        outcome: 'APPROVE',
        basis: 'Conținut verificat',
      });
      expect(
        await screen.findByRole('region', {
          name: 'Available approved version: 1',
        }),
      ).toBeVisible();

      fireEvent.click(
        screen.getByRole('button', { name: 'Withdraw the active version' }),
      );
      const withdrawing = screen.getByRole('dialog', {
        name: 'Withdraw the active version',
      });
      fireEvent.change(
        within(withdrawing).getByLabelText('Withdrawal reason'),
        {
          target: { value: 'Înlocuit de o versiune nouă' },
        },
      );
      fireEvent.click(
        within(withdrawing).getByRole('button', {
          name: 'Withdraw the active version',
        }),
      );
      expect(
        await screen.findByText('Withdrawal of version 1 recorded.'),
      ).toBeVisible();
      expect(
        commands(sent, `${root}/versions/${model.head.id}/withdrawal`)[0]?.body,
      ).toEqual({
        expectedModelRevision: 2,
        versionNumber: 1,
        reason: 'Înlocuit de o versiune nouă',
      });
    });

    it('reopens a historical version and copies it into a new draft (EX-099, EX-117)', async () => {
      const current = {
        ...approved,
        revision: 3,
        head: {
          ...model.head,
          id: successorId,
          versionNumber: 2,
          predecessorVersionId: model.head.id,
          content: kind.successorContent,
        },
      };
      serve(
        () => actor,
        (request) => {
          if (request.path === root) return Response.json({ model: current });
          if (request.path === `${root}/versions`)
            return Response.json({
              versions: [
                {
                  id: model.head.id,
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
          if (request.path === `${root}/versions/${model.head.id}`)
            return Response.json({
              version: approved.head,
              currentSelection: { activeVersionId: model.head.id },
            });
          return undefined;
        },
      );
      open();

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
        screen.getByText(
          'Historical content; availability is shown in the current model above.',
        ),
      ).toBeVisible();
      fireEvent.click(
        screen.getByRole('button', {
          name: 'Copy this version into a new draft',
        }),
      );
      expect(
        within(
          screen.getByRole('dialog', { name: 'New model version' }),
        ).getByLabelText('Romanian service title', { exact: true }),
      ).toHaveValue(content.serviceTitle);
    });

    it('shows the access-lost message and reloads after a refused read (EX-118)', async () => {
      let refused = false;
      serve(
        () => actor,
        (request) => {
          if (request.path !== root) return undefined;
          return refused
            ? new Response(null, { status: 403 })
            : Response.json({ model });
        },
      );
      open();

      const reload = await screen.findByRole('button', {
        name: 'Reload the current model',
      });
      refused = true;
      fireEvent.click(reload);
      expect(
        await screen.findByText('Model access is no longer available.'),
      ).toBeVisible();
      expect(screen.queryByText(kind.protectedText)).toBeNull();
      refused = false;
      fireEvent.click(
        screen.getByRole('button', { name: 'Reload the current model' }),
      );
      expect(
        await screen.findByRole('region', { name: 'Versions' }),
      ).toBeVisible();
    });
  });
