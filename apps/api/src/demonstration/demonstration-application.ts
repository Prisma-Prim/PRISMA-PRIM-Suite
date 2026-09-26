import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import {
  ACCESS_ADMISSION,
  configuredAccessAdmission,
} from '../access/access-admission.js';
import { EXTERNAL_IDENTITY_VERIFIER } from '../access/external-identity-verifier.js';
import { IDENTITY_SESSION_REVOKER } from '../access/identity-session-revoker.js';
import { VerifiedPrincipalAdapter } from '../access/verified-principal.adapter.js';
import { INVITATION_ACCEPTANCE_PROVIDER } from '../access/workspace-invitation-acceptance-provider.js';
import { WORKSPACE_INVITATION_PROVIDER } from '../access/workspace-invitation-provider.js';
import { AppModule } from '../app.module.js';
import { DATABASE } from '../database/database.constants.js';
import {
  DemonstrationPrincipalAdapter,
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
 * fail-closed provider adapters, and admission limited to the configured
 * bootstrap principal plus the scenario personas.
 */
export async function startDemonstrationApplication(
  input: DemonstrationApplicationInput,
): Promise<DemonstrationApplication> {
  const pool = new Pool({ connectionString: input.databaseUrl });
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
      .useValue(drizzle({ client: pool }))
      .overrideProvider(ACCESS_ADMISSION)
      .useValue(
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
      )
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
    return { origin: await application.getUrl(), close };
  } catch (error) {
    await close();
    throw error;
  }
}
