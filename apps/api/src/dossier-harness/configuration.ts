import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { PlanFailure } from './provider.js';

export function harnessConfiguration(environment = process.env) {
  if (environment.DOSSIER_HARNESS_ENABLED !== 'true') return null;
  const clientId = environment.CHATGPT_PLAN_CLIENT_ID;
  const callback = environment.CHATGPT_PLAN_REDIRECT_URI;
  const encodedKey = environment.DOSSIER_HARNESS_ENCRYPTION_KEY;
  if (
    !clientId ||
    !/^[\w.-]{1,200}$/u.test(clientId) ||
    clientId === 'dynamic_agent_client' ||
    !callback ||
    !encodedKey
  )
    return null;
  const key = Buffer.from(encodedKey, 'base64');
  if (key.length !== 32 || key.toString('base64') !== encodedKey) return null;
  let url: URL;
  try {
    url = new URL(callback);
  } catch {
    return null;
  }
  if (
    (url.protocol !== 'https:' &&
      !(url.protocol === 'http:' && url.hostname === '127.0.0.1')) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== '/chatgpt/callback'
  )
    return null;
  return { clientId, redirectUri: url.href, origin: url.origin, key };
}

export class CredentialVault {
  constructor(private readonly key: Buffer) {}
  seal(value: unknown, owner: string) {
    const iv = randomBytes(12),
      cipher = createCipheriv('aes-256-gcm', this.key, iv);
    cipher.setAAD(Buffer.from(owner));
    const bytes = Buffer.concat([
      cipher.update(JSON.stringify(value), 'utf8'),
      cipher.final(),
    ]);
    return Buffer.concat([iv, cipher.getAuthTag(), bytes]).toString('base64');
  }
  open(value: string, owner: string): unknown {
    try {
      const bytes = Buffer.from(value, 'base64');
      const decipher = createDecipheriv(
        'aes-256-gcm',
        this.key,
        bytes.subarray(0, 12),
      );
      decipher.setAAD(Buffer.from(owner));
      decipher.setAuthTag(bytes.subarray(12, 28));
      return JSON.parse(
        Buffer.concat([
          decipher.update(bytes.subarray(28)),
          decipher.final(),
        ]).toString('utf8'),
      );
    } catch {
      throw new PlanFailure('reauth');
    }
  }
}
