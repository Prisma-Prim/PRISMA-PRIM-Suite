import { createLocalJWKSet, jwtVerify } from 'jose';

export type PlanFailureKind =
  'quota' | 'reauth' | 'invalid' | 'unavailable' | 'interrupted';
export class PlanFailure extends Error {
  constructor(readonly kind: PlanFailureKind) {
    super('ChatGPT plan request did not complete.');
  }
}
export function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new PlanFailure('invalid');
  return Object.fromEntries(Object.entries(value));
}
export function text(value: unknown, max = 16_384): string {
  if (typeof value !== 'string' || !value || value.length > max)
    throw new PlanFailure('invalid');
  return value;
}
function parseJson(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    throw new PlanFailure('invalid');
  }
}
function failure(value: unknown): PlanFailure {
  let code = '';
  if (
    value &&
    typeof value === 'object' &&
    'code' in value &&
    typeof value.code === 'string'
  )
    code = value.code;
  if (
    [
      'subscription_sharing_usage_limit_exceeded',
      'rate_limit_exceeded',
      'insufficient_quota',
      'credit_balance_exhausted',
    ].includes(code)
  )
    return new PlanFailure('quota');
  if (
    [
      'subscription_sharing_usage_unavailable',
      'invalid_grant',
      'invalid_token',
      'token_expired',
    ].includes(code)
  )
    return new PlanFailure('reauth');
  return new PlanFailure('unavailable');
}
async function boundedBody(
  response: Response,
  max = 512 * 1024,
): Promise<string> {
  if (!response.body) throw new PlanFailure('interrupted');
  const reader = response.body.getReader(),
    decoder = new TextDecoder('utf-8', { fatal: true });
  let result = '',
    size = 0;
  try {
    for (;;) {
      const item = await reader.read();
      if (item.done) break;
      size += item.value.byteLength;
      if (size > max) throw new PlanFailure('invalid');
      result += decoder.decode(item.value, { stream: true });
    }
    return result + decoder.decode();
  } finally {
    await reader.cancel().catch(() => undefined);
  }
}
export interface PlanTokens {
  accessToken: string;
  refreshToken: string;
  idToken: string;
  expiresAt: number;
  scopes: string[];
}
function tokens(value: unknown): PlanTokens {
  const t = object(value);
  if (
    t.token_type !== 'Bearer' ||
    typeof t.expires_in !== 'number' ||
    !Number.isSafeInteger(t.expires_in) ||
    t.expires_in < 1 ||
    t.expires_in > 86400
  )
    throw new PlanFailure('invalid');
  const scopes = text(t.scope, 4096).split(/\s+/u);
  if (
    !scopes.includes('chatgpt.tokens.use.direct') ||
    !scopes.includes('resource.invoke')
  )
    throw new PlanFailure('reauth');
  return {
    accessToken: text(t.access_token),
    refreshToken: text(t.refresh_token),
    idToken: text(t.id_token),
    scopes,
    expiresAt: Date.now() + t.expires_in * 1000,
  };
}
export const PLAN_HTTP = Symbol('PLAN_HTTP');
/** All external I/O is injected at this real HTTP boundary, never in business services. */
export class ChatGptPlanClient {
  constructor(private readonly transport: typeof fetch = fetch) {}

  private async request<T>(
    work: (signal: AbortSignal) => Promise<T>,
    timeoutMs = 45_000,
  ): Promise<T> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await work(controller.signal);
    } catch (e) {
      if (e instanceof PlanFailure) throw e;
      throw new PlanFailure('interrupted');
    } finally {
      clearTimeout(timeout);
    }
  }
  private async json(url: string, init: RequestInit = {}): Promise<unknown> {
    return this.request(async (signal) => {
      const response = await this.transport(url, {
        ...init,
        signal,
        redirect: 'error',
      });
      if (!response.ok) {
        if (response.status === 401 || response.status === 403)
          throw new PlanFailure('reauth');
        if (response.status === 429) throw new PlanFailure('quota');
        throw new PlanFailure('unavailable');
      }
      return parseJson(await boundedBody(response));
    });
  }
  async discovery() {
    const d = object(
      await this.json(
        'https://auth.openai.com/.well-known/openid-configuration',
      ),
    );
    const endpoint = (value: unknown) => {
      const url = new URL(text(value, 2048));
      if (
        url.origin !== 'https://auth.openai.com' ||
        url.username ||
        url.password ||
        url.hash
      )
        throw new PlanFailure('invalid');
      return url.href;
    };
    if (d.issuer !== 'https://auth.openai.com')
      throw new PlanFailure('invalid');
    return {
      issuer: d.issuer,
      authorization: endpoint(d.authorization_endpoint),
      token: endpoint(d.token_endpoint),
      jwks: endpoint(d.jwks_uri),
      revoke:
        typeof d.revocation_endpoint === 'string'
          ? endpoint(d.revocation_endpoint)
          : null,
    };
  }
  async exchange(input: {
    endpoint: string;
    clientId: string;
    redirectUri: string;
    code: string;
    verifier: string;
  }) {
    return tokens(
      await this.json(input.endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'authorization_code',
          client_id: input.clientId,
          code: input.code,
          code_verifier: input.verifier,
          redirect_uri: input.redirectUri,
          resource: 'https://api.openai.com/v1',
        }),
      }),
    );
  }
  async verify(input: {
    jwks: string;
    idToken: string;
    clientId: string;
    nonce?: string;
    subject?: string;
  }) {
    const jwks = object(await this.json(input.jwks));
    if (!Array.isArray(jwks.keys) || jwks.keys.length > 20)
      throw new PlanFailure('invalid');
    const keys = jwks.keys.map((k) => object(k));
    const { payload } = await jwtVerify(
      input.idToken,
      createLocalJWKSet({ keys }),
      {
        issuer: 'https://auth.openai.com',
        audience: input.clientId,
        algorithms: ['RS256', 'ES256'],
        requiredClaims: ['sub', 'exp', 'iat'],
        clockTolerance: 5,
      },
    );
    if (
      (input.nonce && payload.nonce !== input.nonce) ||
      (input.subject && payload.sub !== input.subject)
    )
      throw new PlanFailure('invalid');
    return {
      subject: text(payload.sub, 512),
      label:
        typeof payload.email === 'string'
          ? text(payload.email, 254)
          : 'ChatGPT',
    };
  }
  async refresh(input: {
    endpoint: string;
    clientId: string;
    current: PlanTokens;
  }): Promise<PlanTokens> {
    const value = object(
      await this.json(input.endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'refresh_token',
          client_id: input.clientId,
          refresh_token: input.current.refreshToken,
          resource: 'https://api.openai.com/v1',
        }),
      }),
    );
    return tokens({
      ...value,
      id_token: value.id_token ?? input.current.idToken,
      refresh_token: value.refresh_token ?? input.current.refreshToken,
      scope: value.scope ?? input.current.scopes.join(' '),
    });
  }
  async revoke(
    endpoint: string | null,
    clientId: string,
    refreshToken: string,
  ): Promise<boolean> {
    if (!endpoint) return false;
    try {
      return await this.request(async (signal) => {
        const r = await this.transport(endpoint, {
          method: 'POST',
          redirect: 'error',
          signal,
          headers: { 'content-type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            client_id: clientId,
            token: refreshToken,
            token_type_hint: 'refresh_token',
          }),
        });
        await r.body?.cancel();
        return r.status === 200;
      });
    } catch {
      return false;
    }
  }
  async models(accessToken: string) {
    const value = object(
      await this.json('https://api.openai.com/v1/models', {
        headers: { authorization: 'Bearer ' + accessToken },
      }),
    );
    if (!Array.isArray(value.models) || value.models.length > 200)
      throw new PlanFailure('invalid');
    return value.models
      .map((v) => object(v))
      .filter((v) => v.visibility === 'list')
      .map((v) => ({
        id: text(v.slug, 120),
        label: text(v.display_name, 240),
      }));
  }
  async review(
    accessToken: string,
    request: { model: string; instructions: string; input: unknown[] },
  ): Promise<unknown> {
    return this.request(async (signal) => {
      const response = await this.transport(
        'https://api.openai.com/v1/responses',
        {
          method: 'POST',
          redirect: 'error',
          signal,
          headers: {
            authorization: 'Bearer ' + accessToken,
            'content-type': 'application/json',
          },
          body: JSON.stringify({ ...request, store: false, stream: true }),
        },
      );
      if (response.status === 401 || response.status === 403)
        throw new PlanFailure('reauth');
      if (response.status === 429) throw new PlanFailure('quota');
      if (!response.ok) throw new PlanFailure('unavailable');
      if (!response.body) throw new PlanFailure('interrupted');
      const reader = response.body.getReader(),
        decoder = new TextDecoder('utf-8', { fatal: true });
      let pending = '',
        size = 0;
      try {
        for (;;) {
          const item = await reader.read();
          if (item.done) throw new PlanFailure('interrupted');
          size += item.value.byteLength;
          if (size > 512 * 1024) throw new PlanFailure('invalid');
          pending += decoder.decode(item.value, { stream: true });
          pending = pending.replace(/\r\n/gu, '\n');
          let end = pending.indexOf('\n\n');
          while (end >= 0) {
            const frame = pending.slice(0, end);
            pending = pending.slice(end + 2);
            const data = frame
              .split('\n')
              .filter((l) => l.startsWith('data:'))
              .map((l) => l.slice(5).trimStart())
              .join('\n');
            if (data && data !== '[DONE]') {
              const event = object(parseJson(data));
              if (event.type === 'error') throw failure(event);
              if (
                event.type === 'response.failed' ||
                event.type === 'response.incomplete'
              )
                throw failure(object(event.response).error);
              if (event.type === 'response.completed') {
                const result = object(event.response);
                if (
                  result.status !== 'completed' ||
                  !Array.isArray(result.output)
                )
                  throw new PlanFailure('invalid');
                let output = '';
                for (const raw of result.output) {
                  const message = object(raw);
                  if (message.type !== 'message') continue;
                  if (!Array.isArray(message.content))
                    throw new PlanFailure('invalid');
                  for (const rawContent of message.content) {
                    const content = object(rawContent);
                    if (content.type !== 'output_text')
                      throw new PlanFailure('invalid');
                    output += text(content.text, 256 * 1024);
                  }
                }
                return parseJson(output);
              }
            }
            end = pending.indexOf('\n\n');
          }
        }
      } finally {
        await reader.cancel().catch(() => undefined);
      }
    }, 180_000);
  }
}
