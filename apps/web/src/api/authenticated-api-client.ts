import type { BrowserIdentity } from '../access-composition';

export type ApiResult<T> =
  | { status: 'ok'; value: T }
  | { status: 'unauthorized' | 'forbidden' | 'error' }
  | { status: 'validation'; message?: string };

export interface ApiRequest {
  method?: 'GET' | 'POST' | 'DELETE';
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
        if (response.status === 400) {
          const body = await optionalJson(response);
          return {
            status: 'validation',
            message:
              typeof body?.message === 'string' ? body.message : undefined,
          };
        }
        if (!response.ok) return { status: 'error' };
        return {
          status: 'ok',
          value: (response.status === 204
            ? undefined
            : await response.json()) as T,
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

async function optionalJson(
  response: Response,
): Promise<{ message?: unknown } | undefined> {
  try {
    return (await response.json()) as { message?: unknown };
  } catch {
    return undefined;
  }
}
