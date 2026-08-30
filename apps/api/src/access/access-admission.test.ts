import { describe, expect, it } from 'vitest';
import { configuredAccessAdmission } from './access-admission.js';

const FIRST_WORKSPACE_ID = '00000000-0000-4000-8000-000000000071';

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
      ACCESS_BOOTSTRAP_WORKSPACE_ID: FIRST_WORKSPACE_ID,
      ACCESS_BOOTSTRAP_WORKSPACE_NAME: 'First Workspace',
      ACCESS_ACCEPTED_INVITATIONS_JSON: JSON.stringify([
        {
          provider: 'clerk',
          subject: 'invited-subject',
          workspaceId: FIRST_WORKSPACE_ID,
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
      workspaceId: FIRST_WORKSPACE_ID,
      workspaceName: 'First Workspace',
    });
    expect(
      admission.resolve({
        provider: 'clerk',
        subject: 'invited-subject',
        displayName: 'Invited User',
        email: 'invited@example.test',
      }),
    ).toEqual({ kind: 'invitation', workspaceId: FIRST_WORKSPACE_ID });
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
      ACCESS_BOOTSTRAP_EXTERNAL_PROVIDER: 'clerk',
      ACCESS_BOOTSTRAP_EXTERNAL_SUBJECT: 'bootstrap-subject',
      ACCESS_BOOTSTRAP_WORKSPACE_ID: 'not-a-uuid',
      ACCESS_BOOTSTRAP_WORKSPACE_NAME: 'First Workspace',
    },
    {
      ACCESS_BOOTSTRAP_EXTERNAL_PROVIDER: 'clerk',
      ACCESS_BOOTSTRAP_EXTERNAL_SUBJECT: 'bootstrap-subject',
      ACCESS_BOOTSTRAP_WORKSPACE_ID: FIRST_WORKSPACE_ID,
      ACCESS_BOOTSTRAP_WORKSPACE_KEY: 'first-workspace',
      ACCESS_BOOTSTRAP_WORKSPACE_NAME: 'First Workspace',
    },
    {
      ACCESS_ACCEPTED_INVITATIONS_JSON: 'not-json',
    },
    {
      ACCESS_ACCEPTED_INVITATIONS_JSON: JSON.stringify([
        { provider: 'clerk', subject: '', workspaceKey: 'workspace' },
      ]),
    },
    {
      ACCESS_ACCEPTED_INVITATIONS_JSON: JSON.stringify([
        {
          provider: 'clerk',
          subject: 'invited-subject',
          workspaceId: 'not-a-uuid',
        },
      ]),
    },
    {
      ACCESS_ACCEPTED_INVITATIONS_JSON: JSON.stringify([
        {
          provider: 'clerk',
          subject: 'invited-subject',
          workspaceId: FIRST_WORKSPACE_ID,
          workspaceKey: 'first-workspace',
        },
      ]),
    },
  ])('rejects incomplete or invalid admission configuration', (environment) => {
    expect(() => configuredAccessAdmission(environment)).toThrow(
      'Access admission configuration is invalid.',
    );
  });
});
