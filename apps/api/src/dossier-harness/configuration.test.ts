import { describe, expect, it } from 'vitest';
import { CredentialVault, harnessConfiguration } from './configuration.js';

describe('subscription credential configuration and storage', () => {
  it('requires a provisioned hosted client, exact callback and operator-owned encryption key', () => {
    const valid = {
      DOSSIER_HARNESS_ENABLED: 'true',
      CHATGPT_PLAN_CLIENT_ID: 'provisioned-client',
      CHATGPT_PLAN_REDIRECT_URI: 'https://prisma.example/chatgpt/callback',
      DOSSIER_HARNESS_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString('base64'),
    };
    expect(harnessConfiguration(valid)?.clientId).toBe('provisioned-client');
    expect(
      harnessConfiguration({
        ...valid,
        CHATGPT_PLAN_CLIENT_ID: 'dynamic_agent_client',
      }),
    ).toBeNull();
    expect(
      harnessConfiguration({
        ...valid,
        CHATGPT_PLAN_REDIRECT_URI:
          'https://prisma.example/chatgpt/callback?token=bad',
      }),
    ).toBeNull();
    expect(
      harnessConfiguration({ ...valid, DOSSIER_HARNESS_ENCRYPTION_KEY: '' }),
    ).toBeNull();
    expect(
      harnessConfiguration({ ...valid, DOSSIER_HARNESS_ENABLED: 'false' }),
    ).toBeNull();
  });
  it('encrypts credentials with authenticated actor ownership and rejects tampering', () => {
    const vault = new CredentialVault(Buffer.alloc(32, 9));
    const ciphertext = vault.seal(
      { access: 'fictional-secret' },
      'workspace/company/actor',
    );
    expect(ciphertext).not.toContain('fictional-secret');
    expect(vault.open(ciphertext, 'workspace/company/actor')).toEqual({
      access: 'fictional-secret',
    });
    expect(() =>
      vault.open(ciphertext, 'workspace/company/another-actor'),
    ).toThrow();
    const changed = Buffer.from(ciphertext, 'base64');
    changed[30] ^= 1;
    expect(() =>
      vault.open(changed.toString('base64'), 'workspace/company/actor'),
    ).toThrow();
  });
});
