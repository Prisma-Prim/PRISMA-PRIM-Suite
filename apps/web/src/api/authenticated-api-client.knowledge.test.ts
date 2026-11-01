import { afterEach, expect, it, vi } from 'vitest';
import { createAuthenticatedApiClient } from './authenticated-api-client';
import { deterministicBrowserIdentity } from '../access-composition';
afterEach(() => vi.unstubAllGlobals());
it.each([null, '1'])(
  'caps actual streamed native bytes with Content-Length %s and cancels the stream',
  async (declared) => {
    const cancel = vi.fn();
    let count = 0;
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        count++;
        if (count <= 8) controller.enqueue(new Uint8Array(1024 * 1024));
        else controller.close();
      },
      cancel,
    });
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(body, {
            headers: {
              'content-type': 'application/pdf',
              ...(declared === null ? {} : { 'content-length': declared }),
            },
          }),
      ),
    );
    const api = await createAuthenticatedApiClient(
      deterministicBrowserIdentity(),
    );
    expect(
      await api.download('/documents/exact', { maximumBytes: 5 * 1024 * 1024 }),
    ).toEqual({ status: 'error' });
    expect(cancel).toHaveBeenCalledOnce();
    expect(count).toBeLessThanOrEqual(7);
  },
);
it('does not consume a retired acquired native response and cancels a deferred body after retirement', async () => {
  const controller = new AbortController(),
    cancel = vi.fn();
  let release: (value: ReadableStreamReadResult<Uint8Array>) => void = () =>
    undefined;
  const stream = new ReadableStream<Uint8Array>({ start() {}, cancel });
  const read = vi
    .spyOn(ReadableStreamDefaultReader.prototype, 'read')
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          release = resolve;
        }),
    );
  vi.stubGlobal(
    'fetch',
    vi.fn(
      async () =>
        new Response(stream, {
          headers: { 'content-type': 'application/pdf' },
        }),
    ),
  );
  const api = await createAuthenticatedApiClient(
    deterministicBrowserIdentity(),
  );
  const work = api.download('/documents/exact', {
    maximumBytes: 5 * 1024 * 1024,
    signal: controller.signal,
  });
  await vi.waitFor(() => expect(read).toHaveBeenCalledOnce());
  controller.abort();
  release({ done: false, value: new Uint8Array([1, 2, 3]) });
  expect(await work).toEqual({ status: 'error' });
  expect(cancel).toHaveBeenCalledOnce();
  read.mockRestore();
});
it('preserves uncapped callers and authenticates no-store exact native downloads', async () => {
  const fetcher = vi.fn<
    (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
  >(
    async () =>
      new Response('%PDF-exact', {
        headers: { 'content-type': 'application/pdf' },
      }),
  );
  vi.stubGlobal('fetch', fetcher);
  const api = await createAuthenticatedApiClient(
    deterministicBrowserIdentity(),
  );
  const result = await api.download('/documents/exact', {
    maximumBytes: 5 * 1024 * 1024,
    cache: 'no-store',
    companyContextId: 'synthetic-company',
  });
  expect(result.status).toBe('ok');
  if (result.status === 'ok')
    expect(await result.value.text()).toBe('%PDF-exact');
  expect(fetcher.mock.calls[0]?.[1]).toMatchObject({
    cache: 'no-store',
    headers: { 'x-company-context-id': 'synthetic-company' },
  });
  expect((await api.download('/documents/old-caller')).status).toBe('ok');
});
