import { useCallback, useLayoutEffect, useRef } from 'react';
import type {
  ApiResult,
  AuthenticatedApiClient,
} from '../api/authenticated-api-client';

export const MAXIMUM_DOCUMENT_PDF_BYTES = 5 * 1024 * 1024;

interface VerifiedPdfDownloadInput {
  client: Pick<AuthenticatedApiClient, 'download'>;
  path: string;
  companyId: string;
  signal: AbortSignal;
  isCurrent: () => boolean;
  file: { size: number; sha256: string; fileName: string };
  signature: 'required' | 'unchecked';
  cache?: 'no-store';
}

/** Byte verification and browser effects share an owner; authority stays with the caller. */
export function useVerifiedPdfDownload() {
  const lifetime = useRef<symbol | null>(null);
  const urls = useRef(new Set<string>());
  useLayoutEffect(() => {
    const mounted = Symbol();
    lifetime.current = mounted;
    const owned = urls.current;
    return () => {
      if (lifetime.current === mounted) lifetime.current = null;
      for (const url of owned) {
        owned.delete(url);
        URL.revokeObjectURL(url);
      }
    };
  }, []);

  return useCallback(
    async (input: VerifiedPdfDownloadInput): Promise<ApiResult<true>> => {
      const mounted = lifetime.current;
      const current = () =>
        mounted !== null &&
        lifetime.current === mounted &&
        !input.signal.aborted &&
        input.isCurrent();
      if (!current()) return { status: 'error' };
      try {
        const result = await input.client.download(input.path, {
          companyContextId: input.companyId,
          signal: input.signal,
          maximumBytes: MAXIMUM_DOCUMENT_PDF_BYTES,
          ...(input.cache ? { cache: input.cache } : {}),
        });
        if (!current()) return { status: 'error' };
        if (result.status !== 'ok') return result;
        const blob = result.value;
        if (
          blob.type !== 'application/pdf' ||
          blob.size !== input.file.size ||
          blob.size > MAXIMUM_DOCUMENT_PDF_BYTES
        )
          return { status: 'error' };
        const bytes = await blob.arrayBuffer();
        if (!current()) return { status: 'error' };
        if (input.signature === 'required') {
          if (bytes.byteLength < 5) return { status: 'error' };
          const signature = new Uint8Array(bytes, 0, 5);
          if (
            signature[0] !== 37 ||
            signature[1] !== 80 ||
            signature[2] !== 68 ||
            signature[3] !== 70 ||
            signature[4] !== 45
          )
            return { status: 'error' };
        }
        const digest = await crypto.subtle.digest('SHA-256', bytes);
        if (!current()) return { status: 'error' };
        const hash = Array.from(new Uint8Array(digest), (byte) =>
          byte.toString(16).padStart(2, '0'),
        ).join('');
        if (hash !== input.file.sha256) return { status: 'error' };
        const url = URL.createObjectURL(blob);
        urls.current.add(url);
        let anchor: HTMLAnchorElement | undefined;
        try {
          if (!current()) return { status: 'error' };
          anchor = document.createElement('a');
          anchor.href = url;
          anchor.download = input.file.fileName;
          anchor.rel = 'noopener';
          anchor.hidden = true;
          document.body.append(anchor);
          if (!current()) return { status: 'error' };
          anchor.click();
          return { status: 'ok', value: true };
        } finally {
          anchor?.remove();
          if (urls.current.delete(url)) URL.revokeObjectURL(url);
        }
      } catch {
        return { status: 'error' };
      }
    },
    [],
  );
}
