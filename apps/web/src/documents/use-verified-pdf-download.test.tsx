import { Blob as NodeBlob } from 'node:buffer';
import { webcrypto } from 'node:crypto';
import { renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type {
  ApiResult,
  AuthenticatedApiClient,
} from '../api/authenticated-api-client';
import {
  MAXIMUM_DOCUMENT_PDF_BYTES,
  useVerifiedPdfDownload,
} from './use-verified-pdf-download';

const body = '%PDF-1.7\nfixture\n';
const file = {
  size: 17,
  sha256: '58346148e907c6d42d5efbb6ac681765701d53d09413067fe67e2b7ea9294e86',
  fileName: 'fictional.pdf',
};
const created = vi.fn<typeof URL.createObjectURL>(() => 'blob:verified-pdf');
const revoked = vi.fn<typeof URL.revokeObjectURL>();
const clicked = vi.fn();

beforeEach(() => {
  vi.stubGlobal('Blob', NodeBlob);
  vi.stubGlobal('crypto', webcrypto);
  vi.stubGlobal(
    'URL',
    class extends URL {
      static createObjectURL = created;
      static revokeObjectURL = revoked;
    },
  );
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(clicked);
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

function options(client: Pick<AuthenticatedApiClient, 'download'>) {
  return {
    client,
    path: '/documents/exact/content/immutable',
    companyId: 'company',
    signal: new AbortController().signal,
    isCurrent: () => true,
    file,
    signature: 'required' as const,
  };
}

it('offers the exact bounded verified PDF and revokes its URL', async () => {
  const blob = new Blob([body], { type: 'application/pdf' });
  const client = {
    download: vi.fn<AuthenticatedApiClient['download']>().mockResolvedValue({
      status: 'ok',
      value: blob,
    }),
  };
  const { result } = renderHook(useVerifiedPdfDownload);
  const request = options(client);
  expect(await result.current(request)).toEqual({ status: 'ok', value: true });
  expect(client.download).toHaveBeenCalledWith(request.path, {
    companyContextId: 'company',
    signal: request.signal,
    maximumBytes: MAXIMUM_DOCUMENT_PDF_BYTES,
  });
  expect(created).toHaveBeenCalledWith(blob);
  expect(clicked).toHaveBeenCalledOnce();
  expect(revoked).toHaveBeenCalledWith('blob:verified-pdf');
  expect(document.querySelector('a[download]')).toBeNull();
});

it('refuses bytes beyond 5 MiB even when declared size matches', async () => {
  const blob = new Blob([new Uint8Array(MAXIMUM_DOCUMENT_PDF_BYTES + 1)], {
    type: 'application/pdf',
  });
  const client = {
    download: vi
      .fn<AuthenticatedApiClient['download']>()
      .mockResolvedValue({ status: 'ok', value: blob }),
  };
  const { result } = renderHook(useVerifiedPdfDownload);
  expect(
    await result.current({
      ...options(client),
      file: { ...file, size: blob.size },
    }),
  ).toEqual({ status: 'error' });
  expect(created).not.toHaveBeenCalled();
  expect(clicked).not.toHaveBeenCalled();
});

it('refuses a mismatched hash without creating a browser URL', async () => {
  const client = {
    download: vi.fn<AuthenticatedApiClient['download']>().mockResolvedValue({
      status: 'ok',
      value: new Blob([body], { type: 'application/pdf' }),
    }),
  };
  const { result } = renderHook(useVerifiedPdfDownload);
  expect(
    await result.current({
      ...options(client),
      file: { ...file, sha256: '0'.repeat(64) },
    }),
  ).toEqual({ status: 'error' });
  expect(created).not.toHaveBeenCalled();
});

it('preserves a native access rejection for the consumer recovery owner', async () => {
  const denied = { status: 'forbidden' } satisfies ApiResult<Blob>;
  const client = {
    download: vi
      .fn<AuthenticatedApiClient['download']>()
      .mockResolvedValue(denied),
  };
  const { result } = renderHook(useVerifiedPdfDownload);
  expect(await result.current(options(client))).toBe(denied);
  expect(created).not.toHaveBeenCalled();
});

function deferred<T>() {
  let complete: ((value: T) => void) | undefined;
  const promise = new Promise<T>((resolve) => {
    complete = resolve;
  });
  return { promise, resolve: (value: T) => complete?.(value) };
}

it('retires an aborted HTTP read before bytes or browser effects are consumed', async () => {
  const waiting = deferred<ApiResult<Blob>>();
  const client = {
    download: vi
      .fn<AuthenticatedApiClient['download']>()
      .mockReturnValue(waiting.promise),
  };
  const controller = new AbortController();
  const { result } = renderHook(useVerifiedPdfDownload);
  const pending = result.current({
    ...options(client),
    signal: controller.signal,
  });
  controller.abort();
  waiting.resolve({
    status: 'ok',
    value: new Blob([body], { type: 'application/pdf' }),
  });
  expect(await pending).toEqual({ status: 'error' });
  expect(created).not.toHaveBeenCalled();
  expect(clicked).not.toHaveBeenCalled();
});

it('does not dispatch a read after its signal was already aborted', async () => {
  const client = { download: vi.fn<AuthenticatedApiClient['download']>() };
  const controller = new AbortController();
  controller.abort();
  const { result } = renderHook(useVerifiedPdfDownload);
  expect(
    await result.current({ ...options(client), signal: controller.signal }),
  ).toEqual({ status: 'error' });
  expect(client.download).not.toHaveBeenCalled();
});

it('retires an unmounted HTTP continuation even when the caller remains current', async () => {
  const waiting = deferred<ApiResult<Blob>>();
  const client = {
    download: vi
      .fn<AuthenticatedApiClient['download']>()
      .mockReturnValue(waiting.promise),
  };
  const { result, unmount } = renderHook(useVerifiedPdfDownload);
  const pending = result.current(options(client));
  unmount();
  waiting.resolve({
    status: 'ok',
    value: new Blob([body], { type: 'application/pdf' }),
  });
  expect(await pending).toEqual({ status: 'error' });
  expect(created).not.toHaveBeenCalled();
});

it('rechecks the caller capture after hashing before offering a download', async () => {
  const expectedDigest = await webcrypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(body),
  );
  const hashing = deferred<ArrayBuffer>();
  const digest = vi
    .spyOn(webcrypto.subtle, 'digest')
    .mockReturnValue(hashing.promise);
  const client = {
    download: vi.fn<AuthenticatedApiClient['download']>().mockResolvedValue({
      status: 'ok',
      value: new Blob([body], { type: 'application/pdf' }),
    }),
  };
  let current = true;
  const { result } = renderHook(useVerifiedPdfDownload);
  const pending = result.current({
    ...options(client),
    isCurrent: () => current,
  });
  await waitFor(() => expect(digest).toHaveBeenCalledOnce());
  current = false;
  hashing.resolve(expectedDigest);
  expect(await pending).toEqual({ status: 'error' });
  expect(created).not.toHaveBeenCalled();
  digest.mockRestore();
  expect(await result.current(options(client))).toEqual({
    status: 'ok',
    value: true,
  });
  expect(clicked).toHaveBeenCalledOnce();
});

it('preserves the stronger PDF signature check for consumers that require it', async () => {
  const blob = new Blob(['not a PDF'], { type: 'application/pdf' });
  const client = {
    download: vi
      .fn<AuthenticatedApiClient['download']>()
      .mockResolvedValue({ status: 'ok', value: blob }),
  };
  const digest = vi.spyOn(webcrypto.subtle, 'digest');
  const { result } = renderHook(useVerifiedPdfDownload);
  expect(
    await result.current({
      ...options(client),
      file: { ...file, size: blob.size },
    }),
  ).toEqual({ status: 'error' });
  expect(digest).not.toHaveBeenCalled();
  expect(created).not.toHaveBeenCalled();
});

it('releases the URL and anchor when the browser click throws', async () => {
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {
    throw new Error('browser refused');
  });
  const client = {
    download: vi.fn<AuthenticatedApiClient['download']>().mockResolvedValue({
      status: 'ok',
      value: new Blob([body], { type: 'application/pdf' }),
    }),
  };
  const { result } = renderHook(useVerifiedPdfDownload);
  expect(await result.current(options(client))).toEqual({ status: 'error' });
  expect(revoked).toHaveBeenCalledOnce();
  expect(document.querySelector('a[download]')).toBeNull();
});
