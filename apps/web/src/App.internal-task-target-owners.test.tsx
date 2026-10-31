import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  act,
  fireEvent,
  within,
  waitFor,
} from './test/render-with-interface-locale';
import {
  installInternalTaskApp,
  internalSnapshot,
  internalDetail,
  internalReceipt,
  internalTaskId,
  openInternalTaskApp,
} from './test/internal-task-app';
beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  window.history.replaceState(null, '', '/#internal-tasks');
});
afterEach(() => {
  vi.unstubAllGlobals();
  window.history.replaceState(null, '', '/');
});
it('preserves the exact uncertain Task-owned intent across another Task in the same Company without late navigation', async () => {
  const first = internalSnapshot(),
    second = {
      ...first,
      id: '80000000-0000-4000-8000-000000001007',
      title: 'Other internal work',
    },
    writes: Array<{ body: BodyInit | null | undefined; key: string | null }> =
      [];
  const after = {
      ...first,
      version: 2,
      title: 'Literal unresolved Task intent',
    },
    fact = {
      ...internalReceipt().history,
      kind: 'EDIT',
      version: 2,
      before: first,
      after,
    },
    receipt = {
      format: 'company-internal-task-command-v1',
      task: after,
      changed: true,
      history: fact,
    };
  installInternalTaskApp(async (path, init) => {
    if (path === '/api/company-internal-tasks' && init?.method !== 'POST')
      return Response.json({
        format: 'company-internal-task-page-v1',
        tasks: [second, first],
        nextBeforeTaskId: null,
      });
    if (path === '/api/company-internal-tasks/' + second.id)
      return Response.json({
        format: 'company-internal-task-detail-v1',
        task: second,
        history: [
          { ...internalReceipt().history, taskId: second.id, after: second },
        ],
        nextBeforeVersion: null,
      });
    if (path === '/api/company-internal-tasks/' + internalTaskId + '/changes') {
      writes.push({
        body: init?.body,
        key: new Headers(init?.headers).get('idempotency-key'),
      });
      if (writes.length === 1) throw new TypeError('Unknown HTTP outcome');
      return Response.json(receipt);
    }
    if (path === '/api/company-internal-tasks/' + internalTaskId)
      return Response.json(internalDetail());
    return undefined;
  });
  const { panel } = await openInternalTaskApp();
  fireEvent.click(
    within(panel).getByRole('button', { name: 'Internal inventory DEMO' }),
  );
  const form = await within(panel).findByRole('form', {
      name: 'Save internal Task',
    }),
    editor = within(form).getByRole('textbox', { name: 'Task title' });
  fireEvent.change(editor, {
    target: { value: 'Literal unresolved Task intent' },
  });
  fireEvent.click(
    within(form).getByRole('button', { name: 'Save internal Task' }),
  );
  await within(panel).findByRole('button', { name: 'Retry the same command' });
  fireEvent.click(
    within(panel).getByRole('button', { name: 'Other internal work' }),
  );
  await within(panel).findByRole('heading', { name: 'Other internal work' });
  expect(editor.isConnected).toBe(true);
  fireEvent.click(
    within(panel).getByRole('button', { name: 'Internal inventory DEMO' }),
  );
  expect(editor).toHaveValue('Literal unresolved Task intent');
  fireEvent.click(
    await within(panel).findByRole('button', {
      name: 'Retry the same command',
    }),
  );
  await within(panel).findByText('Internal Task saved.');
  expect(writes).toHaveLength(2);
  expect(writes[1]).toEqual(writes[0]);
});

it('keeps a later Task selection and its focus when an earlier Task command confirms', async () => {
  const first = internalSnapshot(),
    second = {
      ...first,
      id: '80000000-0000-4000-8000-000000001007',
      title: 'Other internal work',
    },
    after = { ...first, version: 2, title: 'Pending Task A intent' },
    fact = {
      ...internalReceipt().history,
      kind: 'EDIT',
      version: 2,
      before: first,
      after,
    };
  let finish: ((value: Response) => void) | undefined,
    committed = false;
  installInternalTaskApp(async (path, init) => {
    if (path === '/api/company-internal-tasks' && init?.method !== 'POST')
      return Response.json({
        format: 'company-internal-task-page-v1',
        tasks: [second, first],
        nextBeforeTaskId: null,
      });
    if (path === '/api/company-internal-tasks/' + second.id)
      return Response.json({
        format: 'company-internal-task-detail-v1',
        task: second,
        history: [
          { ...internalReceipt().history, taskId: second.id, after: second },
        ],
        nextBeforeVersion: null,
      });
    if (path === '/api/company-internal-tasks/' + internalTaskId + '/changes')
      return new Promise((resolve) => {
        finish = (value) => {
          committed = true;
          resolve(value);
        };
      });
    if (path === '/api/company-internal-tasks/' + internalTaskId)
      return Response.json(
        committed
          ? {
              format: 'company-internal-task-detail-v1',
              task: after,
              history: [fact, internalReceipt().history],
              nextBeforeVersion: null,
            }
          : internalDetail(),
      );
    return undefined;
  });
  const { panel } = await openInternalTaskApp();
  fireEvent.click(within(panel).getByRole('button', { name: first.title }));
  const form = await within(panel).findByRole('form', {
    name: 'Save internal Task',
  });
  fireEvent.change(within(form).getByRole('textbox', { name: 'Task title' }), {
    target: { value: after.title },
  });
  fireEvent.click(
    within(form).getByRole('button', { name: 'Save internal Task' }),
  );
  await waitFor(() => expect(finish).toBeTypeOf('function'));
  fireEvent.click(within(panel).getByRole('button', { name: second.title }));
  const heading = await within(panel).findByRole('heading', {
      name: second.title,
    }),
    otherForm = within(panel).getByRole('form', { name: 'Save internal Task' }),
    otherTitle = within(otherForm).getByRole('textbox', { name: 'Task title' });
  otherTitle.focus();
  await act(async () => {
    finish?.(
      Response.json({
        format: 'company-internal-task-command-v1',
        task: after,
        changed: true,
        history: fact,
      }),
    );
  });
  expect(heading).toBeVisible();
  expect(otherTitle).toHaveValue(second.title);
  expect(otherTitle).toHaveFocus();
  expect(within(panel).queryByText('Internal Task saved.')).not.toBeVisible();
  fireEvent.click(within(panel).getByRole('button', { name: first.title }));
  await within(panel).findByText('Internal Task saved.');
  expect(within(form).getByRole('textbox', { name: 'Task title' })).toHaveValue(
    after.title,
  );
});

it('preserves an old-version dirty Task draft and requires explicit review before a fresh command', async () => {
  const first = internalSnapshot(),
    second = {
      ...first,
      id: '80000000-0000-4000-8000-000000001007',
      title: 'Other internal work',
    },
    after = { ...first, version: 2, title: 'Server-corrected Task A' },
    fact = {
      ...internalReceipt().history,
      kind: 'EDIT',
      version: 2,
      before: first,
      after,
    };
  let current = false,
    writes = 0;
  installInternalTaskApp(async (path, init) => {
    if (path === '/api/company-internal-tasks' && init?.method !== 'POST')
      return Response.json({
        format: 'company-internal-task-page-v1',
        tasks: [second, first],
        nextBeforeTaskId: null,
      });
    if (path === '/api/company-internal-tasks/' + second.id)
      return Response.json({
        format: 'company-internal-task-detail-v1',
        task: second,
        history: [
          { ...internalReceipt().history, taskId: second.id, after: second },
        ],
        nextBeforeVersion: null,
      });
    if (path === '/api/company-internal-tasks/' + internalTaskId + '/changes') {
      writes++;
      return new Response(null, { status: 409 });
    }
    if (path === '/api/company-internal-tasks/' + internalTaskId)
      return Response.json(
        current
          ? {
              format: 'company-internal-task-detail-v1',
              task: after,
              history: [fact, internalReceipt().history],
              nextBeforeVersion: null,
            }
          : internalDetail(),
      );
    return undefined;
  });
  const { panel } = await openInternalTaskApp();
  fireEvent.click(within(panel).getByRole('button', { name: first.title }));
  const form = await within(panel).findByRole('form', {
      name: 'Save internal Task',
    }),
    editor = within(form).getByRole('textbox', { name: 'Task title' });
  fireEvent.change(editor, {
    target: { value: 'Do not silently rebase my intent' },
  });
  fireEvent.click(within(panel).getByRole('button', { name: second.title }));
  await within(panel).findByRole('heading', { name: second.title });
  current = true;
  fireEvent.click(within(panel).getByRole('button', { name: first.title }));
  await within(panel).findByRole('heading', { name: after.title });
  expect(editor).toHaveValue('Do not silently rebase my intent');
  expect(
    within(form).getByRole('button', { name: 'Save internal Task' }),
  ).toBeDisabled();
  expect(writes).toBe(0);
  const detail = form.closest('.internal-task-panel');
  if (!(detail instanceof HTMLElement)) throw new Error('Missing Task owner.');
  fireEvent.click(
    within(detail).getByRole('button', { name: 'Reload and review' }),
  );
  await waitFor(() => expect(editor).toHaveValue(after.title));
  expect(
    within(form).getByRole('button', { name: 'Save internal Task' }),
  ).toBeEnabled();
  expect(writes).toBe(0);
});

it('offers a valid fresh state destination when opening an in-progress Task', async () => {
  const before = internalSnapshot(),
    after = { ...before, version: 2, status: 'in_progress' },
    fact = {
      ...internalReceipt().history,
      kind: 'MOVE',
      version: 2,
      before,
      after,
    };
  installInternalTaskApp(async (path) =>
    path === '/api/company-internal-tasks/' + internalTaskId
      ? Response.json({
          format: 'company-internal-task-detail-v1',
          task: after,
          history: [fact, internalReceipt().history],
          nextBeforeVersion: null,
        })
      : undefined,
  );
  const { panel } = await openInternalTaskApp();
  fireEvent.click(within(panel).getByRole('button', { name: before.title }));
  const movement = await within(panel).findByRole('form', {
      name: 'Record state',
    }),
    destination = within(movement).getByRole('combobox', { name: 'Status' });
  expect(destination).not.toHaveAttribute('aria-invalid', 'true');
  expect(destination).toHaveAttribute('data-value', 'todo');
});
