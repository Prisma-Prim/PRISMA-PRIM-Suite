import { describe, expect, it } from 'vitest';
import { identityConfiguration } from './identity-configuration.js';

describe('identityConfiguration', () => {
  it('provides the exact configured frontend origin as an authorized party', () => {
    expect(
      identityConfiguration({
        NODE_ENV: 'production',
        CLERK_SECRET_KEY: 'secret',
        CLERK_PUBLISHABLE_KEY: 'publishable',
        WEB_ORIGIN: 'https://suite.example.test',
      }),
    ).toEqual({
      secretKey: 'secret',
      publishableKey: 'publishable',
      webOrigin: 'https://suite.example.test',
    });
  });

  it.each([undefined, 'https://suite.example.test/path', 'not-an-origin'])(
    'fails closed for an invalid production WEB_ORIGIN: %s',
    (webOrigin) => {
      expect(() =>
        identityConfiguration({
          NODE_ENV: 'production',
          CLERK_SECRET_KEY: 'secret',
          CLERK_PUBLISHABLE_KEY: 'publishable',
          WEB_ORIGIN: webOrigin,
        }),
      ).toThrow('production identity configuration is incomplete');
    },
  );
});
