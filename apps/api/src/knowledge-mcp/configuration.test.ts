import { describe, expect, it } from 'vitest';
import { readKnowledgeMcpConfiguration } from './configuration.js';

const workspaceId = 'abcdefab-cdef-4abc-8def-abcdefabcdef';
const companyId = 'fedcbafe-dcba-4fed-9cba-fedcbafedcba';
const environment = {
  PRISMA_KNOWLEDGE_API_ORIGIN: 'https://prisma.example.test',
  PRISMA_KNOWLEDGE_WORKSPACE_ID: workspaceId,
  PRISMA_KNOWLEDGE_COMPANY_ID: companyId,
  PRISMA_KNOWLEDGE_BEARER_TOKEN: 'synthetic-prisma-token',
};

describe('MCP operator UUID configuration', () => {
  it('canonicalizes only Workspace and Company UUID spelling', () => {
    const configuration = readKnowledgeMcpConfiguration({
      ...environment,
      PRISMA_KNOWLEDGE_WORKSPACE_ID: workspaceId.toUpperCase(),
      PRISMA_KNOWLEDGE_COMPANY_ID: companyId.replace('fedc', 'FeDc'),
    });
    expect(configuration).toEqual({
      apiOrigin: environment.PRISMA_KNOWLEDGE_API_ORIGIN,
      workspaceId,
      companyId,
      bearerToken: environment.PRISMA_KNOWLEDGE_BEARER_TOKEN,
    });
  });

  it.each([6, 7, 8])(
    'rejects unsupported UUID version %s in either context',
    (version) => {
      for (const key of [
        'PRISMA_KNOWLEDGE_WORKSPACE_ID',
        'PRISMA_KNOWLEDGE_COMPANY_ID',
      ]) {
        expect(() =>
          readKnowledgeMcpConfiguration({
            ...environment,
            [key]: workspaceId.replace('-4abc-', `-${version}abc-`),
          }),
        ).toThrow('Knowledge MCP configuration is invalid or incomplete.');
      }
    },
  );
});
