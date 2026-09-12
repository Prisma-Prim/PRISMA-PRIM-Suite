import type { BrowserIdentity } from '../access-composition';

/** The governed-union conflicts the server states explicitly. */
export const CLIENT_UNION_CONFLICT_CODES = [
  'client_union_comparison_stale',
  'client_union_differences_require_review',
  'client_union_contact_capacity_exceeded',
  'client_union_blocked',
  'client_union_reversal_blocked',
  'client_union_changed_intent',
] as const;

export type ClientUnionConflictCode =
  (typeof CLIENT_UNION_CONFLICT_CODES)[number];

export type ApiResult<T> =
  | { status: 'ok'; value: T }
  | {
      status: 'conflict';
      reason: 'possibleDuplicateReviewRequired';
      duplicateReviewReference: string;
    }
  | {
      status: 'conflict';
      reason: 'clientUnionConflict';
      code: ClientUnionConflictCode;
    }
  | {
      status: 'unauthorized' | 'forbidden' | 'notFound' | 'conflict' | 'error';
      reason?: undefined;
    }
  | { status: 'validation'; message?: string };

export interface ApiRequest {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  headers?: Record<string, string>;
  body?: string;
  companyContextId?: string;
  signal?: AbortSignal;
}

export interface AuthenticatedApiClient {
  request<T>(path: string, request?: ApiRequest): Promise<ApiResult<T>>;
}

export async function createAuthenticatedApiClient(
  identity: BrowserIdentity,
): Promise<AuthenticatedApiClient> {
  const token = identity.requestHeaders ? null : await identity.getToken();
  const identityHeaders =
    identity.requestHeaders ??
    (token ? { Authorization: `Bearer ${token}` } : undefined);

  return {
    async request<T>(
      path: string,
      request: ApiRequest = {},
    ): Promise<ApiResult<T>> {
      const headers = requestHeaders(
        identityHeaders,
        request.headers,
        request.companyContextId,
      );
      try {
        const response = await fetch(
          `${import.meta.env.VITE_API_URL ?? '/api'}${path}`,
          {
            method: request.method,
            credentials: 'include',
            headers,
            body: request.body,
            signal: request.signal,
          },
        );
        if (response.status === 401) return { status: 'unauthorized' };
        if (response.status === 403) return { status: 'forbidden' };
        if (response.status === 404) return { status: 'notFound' };
        if (response.status === 409) {
          const body = await optionalJson(response);
          if (isPossibleDuplicateConflict(body)) {
            return {
              status: 'conflict',
              reason: 'possibleDuplicateReviewRequired',
              duplicateReviewReference: body.duplicate_review_reference,
            };
          }
          const unionConflictCode = clientUnionConflictCode(body);
          if (unionConflictCode) {
            return {
              status: 'conflict',
              reason: 'clientUnionConflict',
              code: unionConflictCode,
            };
          }
          // An unrecognized conflict stays generic rather than being guessed.
          return { status: 'conflict' };
        }
        if (response.status === 400) {
          const body = await optionalJson(response);
          return {
            status: 'validation',
            message: messageFrom(body),
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
  };
}

function requestHeaders(
  identityHeaders: Record<string, string> | undefined,
  requestSpecificHeaders: Record<string, string> | undefined,
  companyContextId: string | undefined,
): Record<string, string> | undefined {
  if (!identityHeaders && !requestSpecificHeaders && !companyContextId)
    return undefined;
  return {
    ...identityHeaders,
    ...requestSpecificHeaders,
    ...(companyContextId
      ? { 'x-company-context-id': companyContextId }
      : undefined),
  };
}

function clientUnionConflictCode(
  body: unknown,
): ClientUnionConflictCode | undefined {
  if (typeof body !== 'object' || body === null) return undefined;
  const code: unknown = (body as { code?: unknown }).code;
  return CLIENT_UNION_CONFLICT_CODES.find((candidate) => candidate === code);
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
