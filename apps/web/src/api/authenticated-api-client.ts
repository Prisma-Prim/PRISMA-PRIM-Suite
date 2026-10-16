import type { BrowserIdentity } from '../access-composition';
import { selectedWorkspaceId } from '../access/workspace-selection';

export type ApiResult<T> =
  | { status: 'ok'; value: T }
  | {
      status: 'conflict';
      reason: 'possibleDuplicateReviewRequired';
      duplicateReviewReference: string;
    }
  | { status: 'conflict'; reason: 'clientLegalEntityCapacityExceeded' }
  | {
      status: 'unauthorized' | 'forbidden' | 'notFound' | 'conflict' | 'error';
      reason?: undefined;
      /** A conflict's machine-readable `code`, when the server states one. */
      code?: string;
    }
  | { status: 'validation'; message?: string; code?: string };

/** The machine-readable code of a conflict other than a duplicate review. */
export function conflictCode(result: ApiResult<unknown>): string | undefined {
  return result.status === 'conflict' && result.reason === undefined
    ? result.code
    : undefined;
}

export interface ApiRequest {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  headers?: Record<string, string>;
  body?: string | Blob;
  companyContextId?: string;
  signal?: AbortSignal;
}

export interface AuthenticatedApiClient {
  request<T>(path: string, request?: ApiRequest): Promise<ApiResult<T>>;
  download(
    path: string,
    request?: Pick<ApiRequest, 'headers' | 'companyContextId' | 'signal'>,
  ): Promise<ApiResult<Blob>>;
}

export async function createAuthenticatedApiClient(
  identity: BrowserIdentity,
): Promise<AuthenticatedApiClient> {
  const token = identity.requestHeaders ? null : await identity.getToken();
  const identityHeaders =
    identity.requestHeaders ??
    (token ? { Authorization: `Bearer ${token}` } : undefined);

  function authenticatedFetch(
    path: string,
    request: ApiRequest,
  ): Promise<Response> {
    const headers = requestHeaders(
      identityHeaders,
      request.headers,
      request.companyContextId,
    );
    return fetch(`${import.meta.env.VITE_API_URL ?? '/api'}${path}`, {
      method: request.method,
      credentials: 'include',
      headers,
      body: request.body,
      signal: request.signal,
    });
  }

  return {
    async request<T>(
      path: string,
      request: ApiRequest = {},
    ): Promise<ApiResult<T>> {
      try {
        const response = await authenticatedFetch(path, request);
        const rejection = accessFailure(response);
        if (rejection) return rejection;
        if (response.status === 409) {
          const body = await optionalJson(response);
          if (isPossibleDuplicateConflict(body)) {
            return {
              status: 'conflict',
              reason: 'possibleDuplicateReviewRequired',
              duplicateReviewReference: body.duplicate_review_reference,
            };
          }
          if (
            isRecord(body) &&
            body.code === 'client_legal_entity_capacity_exceeded'
          )
            return {
              status: 'conflict',
              reason: 'clientLegalEntityCapacityExceeded',
            };
          const code = codeFrom(body);
          return code === undefined
            ? { status: 'conflict' }
            : { status: 'conflict', code };
        }
        if (response.status === 400) {
          const body = await optionalJson(response);
          const code = codeFrom(body);
          return {
            status: 'validation',
            message: messageFrom(body),
            ...(code === undefined ? {} : { code }),
          };
        }
        if (!response.ok) return { status: 'error' };
        return {
          status: 'ok',
          value: (await response.json()) as T,
        };
      } catch (error: unknown) {
        if (error instanceof DOMException && error.name === 'AbortError')
          throw error;
        return { status: 'error' };
      }
    },
    async download(path, request = {}) {
      try {
        const response = await authenticatedFetch(path, {
          ...request,
          method: 'GET',
        });
        const rejection = accessFailure(response);
        if (rejection) return rejection;
        if (!response.ok) return { status: 'error' };
        return { status: 'ok', value: await response.blob() };
      } catch (error: unknown) {
        if (error instanceof DOMException && error.name === 'AbortError')
          throw error;
        return { status: 'error' };
      }
    },
  };
}

function accessFailure(
  response: Response,
): { status: 'unauthorized' | 'forbidden' | 'notFound' } | undefined {
  if (response.status === 401) return { status: 'unauthorized' };
  if (response.status === 403) return { status: 'forbidden' };
  if (response.status === 404) return { status: 'notFound' };
  return undefined;
}

function requestHeaders(
  identityHeaders: Record<string, string> | undefined,
  requestSpecificHeaders: Record<string, string> | undefined,
  companyContextId: string | undefined,
): Record<string, string> | undefined {
  const workspaceId = selectedWorkspaceId();
  if (
    !identityHeaders &&
    !requestSpecificHeaders &&
    !companyContextId &&
    !workspaceId
  )
    return undefined;
  return {
    ...identityHeaders,
    ...(workspaceId ? { 'x-workspace-context-id': workspaceId } : {}),
    ...requestSpecificHeaders,
    ...(companyContextId
      ? { 'x-company-context-id': companyContextId }
      : undefined),
  };
}

async function optionalJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return undefined;
  }
}

function messageFrom(value: unknown): string | undefined {
  return isRecord(value) && typeof value.message === 'string'
    ? value.message
    : undefined;
}

function codeFrom(value: unknown): string | undefined {
  return isRecord(value) && typeof value.code === 'string'
    ? value.code
    : undefined;
}

function isPossibleDuplicateConflict(value: unknown): value is {
  code: 'possible_duplicate_review_required';
  duplicate_review_reference: string;
} {
  return (
    isRecord(value) &&
    value.code === 'possible_duplicate_review_required' &&
    typeof value.duplicate_review_reference === 'string' &&
    value.duplicate_review_reference.length > 0
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
