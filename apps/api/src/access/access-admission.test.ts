import { describe, expect, it } from 'vitest';
import { configuredAccessAdmission } from './access-admission.js';

describe('Access admission configuration', () => {
  it('fails closed when no admission is configured', () => {
    const admission = configuredAccessAdmission({});

    expect(
      admission.resolve({
        provider: 'clerk',
        subject: 'unknown-subject',
        displayName: 'Unknown User',
        email: 'unknown@example.test',
      }),
    ).toBeUndefined();
  });

  it('distinguishes the initial bootstrap principal from accepted invitations', () => {
    const admission = configuredAccessAdmission({
      ACCESS_BOOTSTRAP_EXTERNAL_PROVIDER: 'clerk',
      ACCESS_BOOTSTRAP_EXTERNAL_SUBJECT: 'bootstrap-subject',
      ACCESS_BOOTSTRAP_WORKSPACE_KEY: 'first-workspace',
      ACCESS_BOOTSTRAP_WORKSPACE_NAME: 'First Workspace',
      ACCESS_ACCEPTED_INVITATIONS_JSON: JSON.stringify([
        {
          provider: 'clerk',
          subject: 'invited-subject',
          workspaceKey: 'first-workspace',
        },
      ]),
    });

    expect(
      admission.resolve({
        provider: 'clerk',
        subject: 'bootstrap-subject',
        displayName: 'Bootstrap User',
        email: 'bootstrap@example.test',
      }),
    ).toEqual({
      kind: 'bootstrap',
      workspaceKey: 'first-workspace',
      workspaceName: 'First Workspace',
    });
    expect(
      admission.resolve({
        provider: 'clerk',
        subject: 'invited-subject',
        displayName: 'Invited User',
        email: 'invited@example.test',
      }),
    ).toEqual({ kind: 'invitation', workspaceKey: 'first-workspace' });
    expect(
      admission.resolve({
        provider: 'clerk',
        subject: 'uninvited-subject',
        displayName: 'Uninvited User',
        email: 'uninvited@example.test',
      }),
    ).toBeUndefined();
  });

  it.each([
    {
      ACCESS_BOOTSTRAP_EXTERNAL_PROVIDER: 'clerk',
    },
    {
      ACCESS_ACCEPTED_INVITATIONS_JSON: 'not-json',
    },
    {
      ACCESS_ACCEPTED_INVITATIONS_JSON: JSON.stringify([
        { provider: 'clerk', subject: '', workspaceKey: 'workspace' },
      ]),
    },
  ])('rejects incomplete or invalid admission configuration', (environment) => {
    expect(() => configuredAccessAdmission(environment)).toThrow(
      'Access admission configuration is invalid.',
    );
  });
});
