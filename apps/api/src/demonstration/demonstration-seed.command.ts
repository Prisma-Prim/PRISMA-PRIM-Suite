import { randomBytes } from 'node:crypto';
import { startDemonstrationApplication } from './demonstration-application.js';
import {
  DemonstrationSeedIdentity,
  ProviderCallLedger,
  failClosedProviderAdapters,
} from './demonstration-identity.js';
import { runDemonstrationScenario } from './demonstration-runner.js';
import {
  DEMONSTRATION_MARKER,
  DEMONSTRATION_PERSONA_PROVIDER,
  DEMONSTRATION_SCENARIO,
  demonstrationIdempotencyKey,
} from './demonstration-scenario.js';
import {
  classifyDemonstrationTarget,
  type DemonstrationTargetRefusal,
} from './demonstration-target-guard.js';

/**
 * The operator command (Platform PRD section 17): refuse any target that is
 * not the dedicated demonstration Workspace, then boot the application in this
 * process on loopback with the seed-only identity and fail-closed provider
 * adapters, and run the scenario through the public API.
 */

export const DEMONSTRATION_SEED_EXIT_CODES = {
  converged: 0,
  failed: 1,
  refused: 2,
  stopped: 3,
} as const;

export type DemonstrationSeedRefusal =
  | 'invalid-arguments'
  | 'configuration-incomplete'
  | 'confirmation-required'
  | 'confirmation-mismatch'
  | 'production-environment'
  | 'workspace-name-without-demo'
  | 'owner-provider-reserved'
  | DemonstrationTargetRefusal;

export interface DemonstrationSeedCommandInput {
  readonly argv: readonly string[];
  readonly environment: Readonly<Record<string, string | undefined>>;
  /** Receives one manifest JSON line at a time. */
  readonly write: (line: string) => void;
  readonly migrationsFolder?: string;
}

export interface DemonstrationSeedCommandResult {
  readonly exitCode: (typeof DEMONSTRATION_SEED_EXIT_CODES)[keyof typeof DEMONSTRATION_SEED_EXIT_CODES];
  /** An unexpected failure rejects instead; the entry point reports it. */
  readonly outcome: 'converged' | 'refused' | 'stopped';
  readonly refusal?: DemonstrationSeedRefusal;
  readonly providerCallAttempts: number;
}

interface SeedTarget {
  readonly databaseUrl: string;
  readonly owner: { readonly provider: string; readonly subject: string };
  readonly workspaceId: string;
  readonly workspaceName: string;
}

const CONFIRMATION_OPTION = '--confirm-workspace';
// The delivered admission grammar for a configured Workspace identifier.
const UUID = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/iu;
/** Placeholder profile for an owner who has never signed in; replaced by the owner's next verified sign-in. */
const NEW_OWNER_PROFILE = {
  displayName: 'DEMO Workspace owner',
  email: 'workspace-owner@example.test',
};

export async function runDemonstrationSeedCommand(
  input: DemonstrationSeedCommandInput,
): Promise<DemonstrationSeedCommandResult> {
  const scenario = DEMONSTRATION_SCENARIO;
  const ledger = new ProviderCallLedger();
  const refuse = (
    refusal: DemonstrationSeedRefusal,
  ): DemonstrationSeedCommandResult => {
    input.write(
      JSON.stringify({
        scenario: scenario.version,
        result: 'refused',
        reason: refusal,
      }),
    );
    return {
      exitCode: DEMONSTRATION_SEED_EXIT_CODES.refused,
      outcome: 'refused',
      refusal,
      providerCallAttempts: ledger.attempts,
    };
  };

  if (input.environment.NODE_ENV?.trim() === 'production')
    return refuse('production-environment');
  const confirmation = readConfirmation(input.argv);
  if (confirmation.kind === 'invalid') return refuse('invalid-arguments');
  const target = readTarget(input.environment);
  if (!target) return refuse('configuration-incomplete');
  if (confirmation.kind === 'absent') return refuse('confirmation-required');
  if (confirmation.workspaceId.toLowerCase() !== target.workspaceId)
    return refuse('confirmation-mismatch');
  if (!target.workspaceName.includes(DEMONSTRATION_MARKER))
    return refuse('workspace-name-without-demo');
  if (target.owner.provider === DEMONSTRATION_PERSONA_PROVIDER)
    return refuse('owner-provider-reserved');

  const classification = await classifyDemonstrationTarget({
    databaseUrl: target.databaseUrl,
    workspaceId: target.workspaceId,
    workspaceName: target.workspaceName,
    owner: target.owner,
    companies: scenario.steps.flatMap((step) =>
      step.kind === 'company.register'
        ? [
            {
              displayName: step.displayName,
              registrationKey: demonstrationIdempotencyKey(step),
            },
          ]
        : [],
    ),
    migrationsFolder: input.migrationsFolder ?? './drizzle',
  });
  if (classification.kind === 'refused') return refuse(classification.reason);

  const identity = new DemonstrationSeedIdentity({
    token: randomBytes(32).toString('base64url'),
    owner: {
      ...target.owner,
      ...(classification.owner ?? NEW_OWNER_PROFILE),
    },
    personas: scenario.personas,
  });
  const application = await startDemonstrationApplication({
    databaseUrl: target.databaseUrl,
    bootstrap: {
      ...target.owner,
      workspaceId: target.workspaceId,
      workspaceName: target.workspaceName,
    },
    identity,
    providers: failClosedProviderAdapters(ledger),
    scenario,
  });
  try {
    const result = await runDemonstrationScenario({
      origin: application.origin,
      headersFor: (principal) => identity.headersFor(principal),
      scenario,
      now: application.now,
      onLine: (line) => input.write(JSON.stringify(line)),
    });
    return result.kind === 'converged'
      ? {
          exitCode: DEMONSTRATION_SEED_EXIT_CODES.converged,
          outcome: 'converged',
          providerCallAttempts: ledger.attempts,
        }
      : {
          exitCode: DEMONSTRATION_SEED_EXIT_CODES.stopped,
          outcome: 'stopped',
          providerCallAttempts: ledger.attempts,
        };
  } finally {
    await application.close();
  }
}

type Confirmation =
  | { readonly kind: 'absent' }
  | { readonly kind: 'invalid' }
  | { readonly kind: 'given'; readonly workspaceId: string };

/** The only accepted option is one explicit Workspace confirmation. */
function readConfirmation(argv: readonly string[]): Confirmation {
  const values: string[] = [];
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--') continue;
    if (argument === CONFIRMATION_OPTION) {
      const value = argv[index + 1];
      if (value === undefined || value.startsWith('--'))
        return { kind: 'invalid' };
      values.push(value);
      index += 1;
    } else if (argument?.startsWith(`${CONFIRMATION_OPTION}=`)) {
      values.push(argument.slice(CONFIRMATION_OPTION.length + 1));
    } else return { kind: 'invalid' };
  }
  if (values.length === 0) return { kind: 'absent' };
  const [workspaceId] = values;
  if (values.length > 1 || !workspaceId || !UUID.test(workspaceId))
    return { kind: 'invalid' };
  return { kind: 'given', workspaceId };
}

function readTarget(
  environment: Readonly<Record<string, string | undefined>>,
): SeedTarget | undefined {
  const databaseUrl = environment.DATABASE_URL?.trim();
  const provider = environment.ACCESS_BOOTSTRAP_EXTERNAL_PROVIDER?.trim();
  const subject = environment.ACCESS_BOOTSTRAP_EXTERNAL_SUBJECT?.trim();
  const workspaceId = environment.ACCESS_BOOTSTRAP_WORKSPACE_ID?.trim();
  const workspaceName = environment.ACCESS_BOOTSTRAP_WORKSPACE_NAME?.trim();
  if (
    !databaseUrl ||
    !provider ||
    !subject ||
    !workspaceId ||
    !workspaceName ||
    !UUID.test(workspaceId)
  )
    return undefined;
  return {
    databaseUrl,
    owner: { provider, subject },
    workspaceId: workspaceId.toLowerCase(),
    workspaceName,
  };
}
