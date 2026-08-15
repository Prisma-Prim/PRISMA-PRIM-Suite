import type { ExternalPrincipal } from './access.types.js';

export const ACCESS_ADMISSION = Symbol('ACCESS_ADMISSION');

export type AccessAdmissionDecision =
  | {
      kind: 'bootstrap';
      workspaceKey: string;
      workspaceName: string;
    }
  | { kind: 'invitation'; workspaceKey: string };

export interface AccessAdmission {
  resolve(principal: ExternalPrincipal): AccessAdmissionDecision | undefined;
}

interface AcceptedInvitation {
  provider: string;
  subject: string;
  workspaceKey: string;
}

interface BootstrapAdmission extends AcceptedInvitation {
  workspaceName: string;
}

export function configuredAccessAdmission(
  environment: Record<string, string | undefined>,
): AccessAdmission {
  const bootstrapValues = [
    environment.ACCESS_BOOTSTRAP_EXTERNAL_PROVIDER,
    environment.ACCESS_BOOTSTRAP_EXTERNAL_SUBJECT,
    environment.ACCESS_BOOTSTRAP_WORKSPACE_KEY,
    environment.ACCESS_BOOTSTRAP_WORKSPACE_NAME,
  ];
  const hasBootstrapValue = bootstrapValues.some(
    (value) => value !== undefined,
  );
  const bootstrap = hasBootstrapValue
    ? parseBootstrap(bootstrapValues)
    : undefined;
  const invitations = parseInvitations(
    environment.ACCESS_ACCEPTED_INVITATIONS_JSON,
  );
  const identities = new Set<string>();
  for (const entry of [...(bootstrap ? [bootstrap] : []), ...invitations]) {
    const key = identityKey(entry.provider, entry.subject);
    if (identities.has(key)) invalidConfiguration();
    identities.add(key);
  }

  return {
    resolve(principal) {
      if (
        bootstrap?.provider === principal.provider &&
        bootstrap.subject === principal.subject
      ) {
        return {
          kind: 'bootstrap',
          workspaceKey: bootstrap.workspaceKey,
          workspaceName: bootstrap.workspaceName,
        };
      }
      const invitation = invitations.find(
        (entry) =>
          entry.provider === principal.provider &&
          entry.subject === principal.subject,
      );
      return invitation
        ? { kind: 'invitation', workspaceKey: invitation.workspaceKey }
        : undefined;
    },
  };
}

function parseBootstrap(values: Array<string | undefined>): BootstrapAdmission {
  const [provider, subject, workspaceKey, workspaceName] = values.map((value) =>
    value?.trim(),
  );
  if (!provider || !subject || !workspaceKey || !workspaceName)
    return invalidConfiguration();
  return { provider, subject, workspaceKey, workspaceName };
}

function parseInvitations(value: string | undefined): AcceptedInvitation[] {
  if (!value?.trim()) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    return invalidConfiguration();
  }
  if (!Array.isArray(parsed)) return invalidConfiguration();
  return parsed.map((entry) => {
    if (!isRecord(entry)) return invalidConfiguration();
    const provider = requiredString(entry.provider);
    const subject = requiredString(entry.subject);
    const workspaceKey = requiredString(entry.workspaceKey);
    return { provider, subject, workspaceKey };
  });
}

function requiredString(value: unknown): string {
  if (typeof value !== 'string' || !value.trim()) return invalidConfiguration();
  return value.trim();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function identityKey(provider: string, subject: string): string {
  return `${provider}\u0000${subject}`;
}

function invalidConfiguration(): never {
  throw new Error('Access admission configuration is invalid.');
}
