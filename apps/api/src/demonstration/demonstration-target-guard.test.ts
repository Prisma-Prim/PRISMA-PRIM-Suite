import { describe, expect, it } from 'vitest';
import { demonstrationWorkspaceRefusal } from './demonstration-target-guard.js';

const target = {
  workspaceId: '00000000-0000-4000-8000-000000000409',
  workspaceName: 'PRISMA DEMO Workspace',
};

describe('demonstration Workspace target contract', () => {
  it('refuses a stale configured name instead of overwriting an operator rename', () => {
    expect(
      demonstrationWorkspaceRefusal(
        [{ id: target.workspaceId, name: 'Renamed DEMO Workspace' }],
        target,
      ),
    ).toBe('workspace-name-mismatch');
  });
  it('allows an empty target and the exact confirmed DEMO Workspace', () => {
    expect(demonstrationWorkspaceRefusal([], target)).toBeNull();
    expect(
      demonstrationWorkspaceRefusal(
        [{ id: target.workspaceId, name: target.workspaceName }],
        target,
      ),
    ).toBeNull();
  });
  it('refuses another Workspace and a persisted name without DEMO', () => {
    expect(
      demonstrationWorkspaceRefusal(
        [
          {
            id: '00000000-0000-4000-8000-000000000410',
            name: 'Other DEMO Workspace',
          },
        ],
        target,
      ),
    ).toBe('other-workspace-present');
    expect(
      demonstrationWorkspaceRefusal(
        [{ id: target.workspaceId, name: 'Real Workspace' }],
        target,
      ),
    ).toBe('workspace-name-without-demo');
  });
});
