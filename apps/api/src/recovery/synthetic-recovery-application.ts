import { timingSafeEqual, randomBytes } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { UnauthorizedException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { AppModule } from '../app.module.js';
import {
  EXTERNAL_IDENTITY_VERIFIER,
  type ExternalIdentityVerifier,
} from '../access/external-identity-verifier.js';
import { DATABASE } from '../database/database.constants.js';

export interface RecoveryPrincipal {
  readonly key: string;
  readonly provider: string;
  readonly subject: string;
  readonly displayName: string;
  readonly email: string;
}

/** Ordinary compiled App; only the existing verifier and DB boundaries change. */
export async function startRecoveryApplication(input: {
  readonly databaseUrl: string;
  readonly principals: readonly RecoveryPrincipal[];
}): Promise<{
  readonly origin: string;
  headersFor(key: string): Readonly<Record<string, string>>;
  close(): Promise<void>;
}> {
  const token = randomBytes(32);
  const verifier: ExternalIdentityVerifier = {
    async verify(request) {
      const value = request.headers['x-recovery-verification-token'];
      const key = request.headers['x-recovery-verification-principal'];
      if (typeof value !== 'string' || typeof key !== 'string')
        throw new UnauthorizedException();
      const presented = Buffer.from(value, 'base64url');
      if (
        presented.length !== token.length ||
        !timingSafeEqual(presented, token)
      )
        throw new UnauthorizedException();
      const principal = input.principals.find((entry) => entry.key === key);
      if (!principal) throw new UnauthorizedException();
      return {
        provider: principal.provider,
        subject: principal.subject,
        displayName: principal.displayName,
        email: principal.email,
      };
    },
  };
  const pool = new Pool({ connectionString: input.databaseUrl });
  let application: INestApplication | undefined;
  let closed = false;
  const close = async () => {
    if (closed) return;
    closed = true;
    try {
      await application?.close();
    } finally {
      token.fill(0);
      await pool.end();
    }
  };
  try {
    // No migration, seed, grants, profile override or admission override.
    // Configured admission is ordinarily empty; persisted roles decide.
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(DATABASE)
      .useValue(drizzle({ client: pool }))
      .overrideProvider(EXTERNAL_IDENTITY_VERIFIER)
      .useValue(verifier)
      .compile();
    application = module.createNestApplication({ logger: false });
    application.setGlobalPrefix('api');
    await application.listen(0, '127.0.0.1');
    return {
      origin: await application.getUrl(),
      headersFor: (key) => ({
        'x-recovery-verification-token': token.toString('base64url'),
        'x-recovery-verification-principal': key,
      }),
      close,
    };
  } catch (error) {
    await close();
    throw error;
  }
}
