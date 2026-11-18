import { exportJWK, generateKeyPair, SignJWT } from 'jose';
import { object, text } from './provider.js';

/** Fictional external HTTP only; native PRISMA, JWT verification and PostgreSQL are real. */
export async function createPlanHttpFixture() {
  const key = await generateKeyPair('RS256');
  const jwk = {
    ...(await exportJWK(key.publicKey)),
    kid: 'fictional-plan-key',
    alg: 'RS256',
    use: 'sig',
  };
  let reviews = 0;
  let refreshes = 0;
  const controls: {
    failure: 'none' | 'quota' | 'fabricated';
    wait: (() => Promise<void>) | null;
    refreshWait: (() => Promise<void>) | null;
    grant: boolean;
    expiresIn: number;
    verbose: boolean;
  } = {
    failure: 'none',
    wait: null,
    refreshWait: null,
    grant: true,
    expiresIn: 3600,
    verbose: false,
  };
  const json = (v: unknown) =>
    new Response(JSON.stringify(v), {
      headers: { 'content-type': 'application/json' },
    });
  const transport: typeof fetch = async (input, init) => {
    const url = new URL(String(input));
    if (
      !['https://auth.openai.com', 'https://api.openai.com'].includes(
        url.origin,
      )
    )
      throw new Error('Unexpected external host');
    if (url.pathname === '/.well-known/openid-configuration')
      return json({
        issuer: 'https://auth.openai.com',
        authorization_endpoint:
          'https://auth.openai.com/api/accounts/authorize',
        token_endpoint: 'https://auth.openai.com/api/accounts/oauth/token',
        jwks_uri: 'https://auth.openai.com/jwks',
        revocation_endpoint: 'https://auth.openai.com/revoke',
      });
    if (url.pathname === '/jwks') return json({ keys: [jwk] });
    if (url.pathname === '/api/accounts/oauth/token') {
      const body = new URLSearchParams(String(init?.body));
      if (body.get('grant_type') === 'refresh_token') {
        refreshes++;
        await controls.refreshWait?.();
      }
      const token = await new SignJWT({
        nonce: body.get('code'),
        email: 'fictional-plan@example.test',
      })
        .setProtectedHeader({ alg: 'RS256', kid: jwk.kid })
        .setIssuer('https://auth.openai.com')
        .setAudience('fictional-client')
        .setSubject('fictional-plan-user')
        .setIssuedAt()
        .setExpirationTime('1h')
        .sign(key.privateKey);
      return json({
        token_type: 'Bearer',
        expires_in: controls.expiresIn,
        access_token: 'fictional-access',
        refresh_token: 'fictional-refresh',
        id_token: token,
        scope: controls.grant
          ? 'openid profile email offline_access resource.invoke chatgpt.tokens.use.direct'
          : 'openid profile email',
      });
    }
    if (url.pathname === '/v1/models')
      return json({
        models: [
          {
            visibility: 'list',
            slug: 'fixture-model',
            display_name: 'Fictional test model',
          },
        ],
      });
    if (url.pathname === '/revoke') return new Response('', { status: 200 });
    if (url.pathname === '/v1/responses') {
      reviews++;
      await controls.wait?.();
      if (controls.failure === 'quota')
        return new Response('', { status: 429 });
      const body = object(JSON.parse(String(init?.body)));
      if (!Array.isArray(body.input)) throw new Error('Expected input');
      const data = object(
        JSON.parse(text(object(body.input[0]).content, 64_000)),
      );
      if (!Array.isArray(data.passages)) throw new Error('Expected passages');
      const p =
        data.passages
          .map(object)
          .find(
            (passage) =>
              typeof passage.locator === 'string' &&
              passage.locator.includes('#table:'),
          ) ?? object(data.passages[0]);
      if (typeof p.start !== 'number') throw new Error('Expected offset');
      const start = p.start;
      const quote = text(p.text).slice(0, 20);
      const result = Array.from({ length: controls.verbose ? 8 : 1 }, () => ({
        field: 'scope',
        value: controls.verbose ? 'Ж'.repeat(2000) : 'Проверить документ',
        rationale: controls.verbose
          ? 'Ж'.repeat(4000)
          : 'Propunere fictivă pentru verificare',
        citations: [
          {
            sourceId: p.sourceId,
            documentVersionId: p.documentVersionId,
            locator: p.locator,
            passageSha256: p.passageSha256,
            start,
            end: start + quote.length,
            quote: controls.failure === 'fabricated' ? 'invented' : quote,
          },
        ],
      }));
      return new Response(
        'data: ' +
          JSON.stringify({
            type: 'response.completed',
            response: {
              status: 'completed',
              output: [
                {
                  type: 'message',
                  content: [
                    { type: 'output_text', text: JSON.stringify(result) },
                  ],
                },
              ],
            },
          }) +
          '\n\n',
        { headers: { 'content-type': 'text/event-stream' } },
      );
    }
    throw new Error('Unexpected external operation');
  };
  return {
    transport,
    controls,
    reviewCount: () => reviews,
    refreshCount: () => refreshes,
  };
}
