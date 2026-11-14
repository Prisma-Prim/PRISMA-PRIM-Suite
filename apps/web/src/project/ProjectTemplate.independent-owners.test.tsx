import { afterEach, expect, it, vi } from 'vitest';
import {
  act,
  render,
  screen,
  waitFor,
} from '../test/render-with-interface-locale';
import { deterministicBrowserIdentity } from '../access-composition';
import type { ActorContext } from '../access-types';
import { ProjectContracts } from '../contract/ProjectContracts';
import { ProjectDocuments } from './ProjectDocuments';
import { ProjectLifecycle } from './ProjectLifecycle';
import { ProjectResponsible } from './ProjectResponsible';
import { preparatoryLifecycle } from './project-lifecycle.test-fixtures';
import {
  companyGrants,
  withCompanyGrants,
} from '../access/company-grants.test-fixture';
import { projectDocumentGrants } from './project-document-grants.test-fixture';

const companyId = 'company';
const projectId = 'project';
const company = {
  id: companyId,
  displayName: 'Company Demo',
  projectPermissions: ['project.read'],
  documentPermissions: ['document.read'],
  grants: withCompanyGrants(
    withCompanyGrants(
      companyGrants({
        bundle: 'company_project_template_user',
        version: 'v1',
        assignmentId: 'template-grant',
      }),
      {
        bundle: 'company_project_access',
        version: 'v1',
        assignmentId: 'project-grant',
      },
      {
        bundle: 'company_contract_preparer',
        version: 'v1',
        assignmentId: 'contract-grant',
      },
      {
        bundle: 'company_commercial_intake',
        version: 'v1',
        assignmentId: 'intake-grant',
      },
    ),
    ...projectDocumentGrants(['document.read']),
  ),
} satisfies NonNullable<ActorContext['activeCompany']>;
const actor: ActorContext = {
  internalUserId: 'owner',
  workspaceMembershipId: 'member',
  workspaceId: 'workspace',
  workspaceName: 'Workspace',
  displayName: 'Owner',
  email: 'owner@example.test',
  active: true,
  workspacePermissions: ['client.manage'],
  activeCompany: company,
};
const changedActor: ActorContext = {
  ...actor,
  activeCompany: {
    ...company,
    grants: withCompanyGrants(company.grants, {
      bundle: 'company_project_template_user',
      version: 'v1',
      assignmentId: 'replacement-template-grant',
    }),
  },
};
type Owner = 'lifecycle' | 'responsible' | 'documents' | 'contracts';
const cases: Array<{
  owner: Owner;
  path: string;
  response: unknown;
  visibleText: string;
}> = [
  {
    owner: 'lifecycle',
    path: `/api/projects/${projectId}/lifecycle`,
    response: preparatoryLifecycle,
    visibleText: 'Preparatory',
  },
  {
    owner: 'responsible',
    path: `/api/projects/${projectId}/responsible`,
    response: {
      responsible: {
        workspaceMembershipId: 'responsible-member',
        displayLabel: 'Independent responsible',
      },
      revision: 1,
      mutable: true,
      lastChange: {
        actorDisplayName: 'Owner',
        occurredAt: '2026-10-16T12:00:00.000Z',
      },
    },
    visibleText: 'Independent responsible',
  },
  {
    owner: 'documents',
    path: `/api/projects/${projectId}/documents`,
    response: {
      mutable: true,
      documents: [
        {
          revision: 1,
          document: {
            id: 'document',
            companyId,
            clientId: 'client',
            clientDisplayName: 'Independent Client',
            title: 'Independent questionnaire',
            purpose: 'Preserve the existing Project reference',
            type: 'questionnaire',
            confidentiality: 'company-confidential',
            createdAt: '2026-10-16T12:00:00.000Z',
            workingRevision: 1,
            correction: 'allowed',
            version: {
              id: 'version',
              status: 'draft',
              representation: {
                id: 'representation',
                kind: 'external-reference',
                verification: 'unverified',
                access: 'denied',
              },
            },
          },
        },
      ],
    },
    visibleText: 'Independent questionnaire',
  },
  {
    owner: 'contracts',
    path: `/api/contracts/projects/${projectId}`,
    response: {
      items: [
        {
          id: 'contract',
          opportunityId: 'opportunity',
          clientRequestId: 'request',
          illustrativeReference: 42,
          kind: 'CONTRACT',
          provisional: true,
          linkedAt: '2026-10-16T12:00:00.000Z',
        },
      ],
    },
    visibleText: 'Illustrative Contract 42',
  },
];

afterEach(() => vi.unstubAllGlobals());

it.each(cases)(
  'retains the authorized $owner reply when only dedicated Template authority changes',
  async ({ owner, path, response, visibleText }) => {
    let resolveReply: ((response: Response) => void) | undefined;
    const reply = new Promise<Response>((resolve) => {
      resolveReply = resolve;
    });
    const reads: Array<{ signal: AbortSignal | null | undefined }> = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const requestedPath = new URL(input.toString(), window.location.origin)
          .pathname;
        if (requestedPath !== path)
          throw new Error('Unexpected public request: ' + requestedPath);
        reads.push({ signal: init?.signal });
        return reply;
      }),
    );
    const identity = deterministicBrowserIdentity();
    function element(givenActor: ActorContext) {
      switch (owner) {
        case 'lifecycle':
          return (
            <ProjectLifecycle
              actor={givenActor}
              identity={identity}
              projectId={projectId}
              responsible={null}
            />
          );
        case 'responsible':
          return (
            <ProjectResponsible
              actor={givenActor}
              identity={identity}
              projectId={projectId}
              projectStatus="preparatory"
            />
          );
        case 'documents':
          return (
            <ProjectDocuments
              actor={givenActor}
              identity={identity}
              projectId={projectId}
              projectStatus="preparatory"
            />
          );
        case 'contracts':
          return (
            <ProjectContracts
              actor={givenActor}
              identity={identity}
              projectId={projectId}
            />
          );
        default: {
          const exhaustive: never = owner;
          return exhaustive;
        }
      }
    }
    function release() {
      if (!resolveReply) throw new Error('The independent reply was not held.');
      resolveReply(Response.json(response));
    }
    const mounted = render(element(actor));
    try {
      await waitFor(() => expect(reads).toHaveLength(1));
      const first = reads[0];
      if (!first?.signal)
        throw new Error('The public read requires a cancellation signal.');
      mounted.rerender(element(changedActor));
      expect(first.signal.aborted).toBe(false);
      expect(reads).toHaveLength(1);
      await act(async () => {
        release();
        await reply;
      });
      expect(
        await screen.findByText(visibleText, { exact: true }),
      ).toBeVisible();
    } finally {
      await act(async () => {
        release();
        await reply;
      });
    }
  },
);
