import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import {
  ACCESS_ADMISSION,
  configuredAccessAdmission,
} from '../access/access-admission.js';
import { INCLUDE_REVOKED_ASSIGNMENTS_IN_ADMINISTRATION } from '../access/company-context-assignment.service.js';
import { SYNCHRONIZE_ACCESS_IDENTITY_PROFILE } from '../access/access.service.js';
import { EXTERNAL_IDENTITY_VERIFIER } from '../access/external-identity-verifier.js';
import { IDENTITY_SESSION_REVOKER } from '../access/identity-session-revoker.js';
import { VerifiedPrincipalAdapter } from '../access/verified-principal.adapter.js';
import { INVITATION_ACCEPTANCE_PROVIDER } from '../access/workspace-invitation-acceptance-provider.js';
import { WORKSPACE_INVITATION_PROVIDER } from '../access/workspace-invitation-provider.js';
import { AppModule } from '../app.module.js';
import { SERVER_CLOCK } from '../clock/server-clock.js';
import { DatabaseContext } from '../database/database-context.js';
import { DATABASE } from '../database/database.constants.js';
import { DemonstrationDatabaseContext } from './demonstration-database-context.js';
import {
  DemonstrationPrincipalAdapter,
  protectDemonstrationPersonaAdmission,
  type DemonstrationProviderAdapters,
  type DemonstrationSeedIdentity,
} from './demonstration-identity.js';
import {
  demonstrationPersonaAdmissions,
  type DemonstrationScenario,
} from './demonstration-scenario.js';

export interface DemonstrationApplication {
  /** The loopback origin the seed runner calls; nothing else is served. */
  readonly origin: string;
  /** Shared run instant for public pricing payloads and server validation. */
  readonly now: () => Date;
  /** Advances only the seed clock to its next whole second, once. */
  readonly beginPricing: () => void;
  close(): Promise<void>;
}

export interface DemonstrationApplicationInput {
  readonly databaseUrl: string;
  readonly bootstrap: {
    readonly provider: string;
    readonly subject: string;
    readonly workspaceId: string;
    readonly workspaceName: string;
  };
  readonly identity: DemonstrationSeedIdentity;
  readonly providers: DemonstrationProviderAdapters;
  readonly scenario: DemonstrationScenario;
}

/**
 * Boots the unchanged application inside the seed's own process, bound to
 * loopback, with only these replacements: the seed identity verifier, the
 * fail-closed provider adapters, admission limited to the configured bootstrap
 * principal plus the scenario personas, and revoked assignment history in the
 * administration projection, with target protection on every writable
 * database transaction.
 */
export async function startDemonstrationApplication(
  input: DemonstrationApplicationInput,
): Promise<DemonstrationApplication> {
  // Only this short-lived synthetic composition owns a fixed clock. Request
  // transit and database lock waits cannot expire its first pricing start.
  // The served application's ServerClockModule continues to use real time.
  const runInstant = new Date().getTime();
  let instant = runInstant;
  const now = () => new Date(instant);
  const beginPricing = () => {
    instant = (Math.floor(runInstant / 1000) + 1) * 1000;
  };
  const connectionUrl = new URL(input.databaseUrl);
  // Put this last in the URL options: node-postgres gives URL settings priority
  // over Pool options. Even a configured options value must retain this guard.
  connectionUrl.searchParams.set(
    'options',
    `${connectionUrl.searchParams.get('options') ?? ''} -c default_transaction_read_only=on`.trim(),
  );
  const pool = new Pool({ connectionString: connectionUrl.toString() });
  const database = drizzle({ client: pool });
  // The deterministic header mode never applies inside the seed's process:
  // the actor adapter is replaced below, and the mode stays cleared while the
  // application listens, so every other identity check uses the seed verifier.
  const identityMode = process.env.ACCESS_IDENTITY_MODE;
  delete process.env.ACCESS_IDENTITY_MODE;
  let application: INestApplication | undefined;
  let closed = false;
  const close = async () => {
    if (closed) return;
    closed = true;
    try {
      await application?.close();
    } finally {
      if (identityMode !== undefined)
        process.env.ACCESS_IDENTITY_MODE = identityMode;
      await pool.end();
    }
  };
  try {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(DATABASE)
      .useValue(database)
      .overrideProvider(SERVER_CLOCK)
      .useValue({ now })
      .overrideProvider(DatabaseContext)
      .useValue(new DemonstrationDatabaseContext(database, input.bootstrap))
      .overrideProvider(ACCESS_ADMISSION)
      .useValue(
        protectDemonstrationPersonaAdmission(
          configuredAccessAdmission({
            ACCESS_BOOTSTRAP_EXTERNAL_PROVIDER: input.bootstrap.provider,
            ACCESS_BOOTSTRAP_EXTERNAL_SUBJECT: input.bootstrap.subject,
            ACCESS_BOOTSTRAP_WORKSPACE_ID: input.bootstrap.workspaceId,
            ACCESS_BOOTSTRAP_WORKSPACE_NAME: input.bootstrap.workspaceName,
            ACCESS_ACCEPTED_INVITATIONS_JSON: JSON.stringify(
              demonstrationPersonaAdmissions(
                input.bootstrap.workspaceId,
                input.scenario,
              ),
            ),
          }),
        ),
      )
      // Existing seed principals retain their persisted profile. Actor status,
      // membership, grants and Company authorization are still resolved afresh
      // by AccessService on every request.
      .overrideProvider(SYNCHRONIZE_ACCESS_IDENTITY_PROFILE)
      .useValue(false)
      // The normal administration projection stays active-only. The seed sees
      // revoked history so it can stop before it sends a replacement grant.
      .overrideProvider(INCLUDE_REVOKED_ASSIGNMENTS_IN_ADMINISTRATION)
      .useValue(true)
      .overrideProvider(EXTERNAL_IDENTITY_VERIFIER)
      .useValue(input.identity)
      .overrideProvider(VerifiedPrincipalAdapter)
      .useValue(new DemonstrationPrincipalAdapter(input.identity))
      .overrideProvider(IDENTITY_SESSION_REVOKER)
      .useValue(input.providers.sessionRevoker)
      .overrideProvider(WORKSPACE_INVITATION_PROVIDER)
      .useValue(input.providers.invitations)
      .overrideProvider(INVITATION_ACCEPTANCE_PROVIDER)
      .useValue(input.providers.invitationAcceptance)
      .compile();
    application = moduleRef.createNestApplication({ logger: false });
    application.setGlobalPrefix('api');
    await application.listen(0, '127.0.0.1');
    return { origin: await application.getUrl(), now, beginPricing, close };
  } catch (error) {
    await close();
    throw error;
  }
}
