import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { expect, it } from 'vitest';
import { createKnowledgeMcpServer } from './server.js';

it('publishes exactly three non-destructive read-only evidence tools', async () => {
  const server = createKnowledgeMcpServer({
    PRISMA_KNOWLEDGE_API_ORIGIN: 'http://127.0.0.1:43929',
    PRISMA_KNOWLEDGE_WORKSPACE_ID: '00000000-0000-4000-8000-000000000001',
    PRISMA_KNOWLEDGE_COMPANY_ID: '00000000-0000-4000-8000-000000000002',
    PRISMA_KNOWLEDGE_BEARER_TOKEN: 'synthetic-prisma-token',
  });
  const client = new Client({
    name: 'knowledge-contract-client',
    version: '1',
  });
  const [clientTransport, serverTransport] =
    InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  await client.connect(clientTransport);
  try {
    const catalogue = await client.listTools();
    expect(catalogue.tools.map(({ name }) => name)).toEqual([
      'list_knowledge_sources',
      'search_knowledge',
      'get_knowledge_passage',
    ]);
    for (const tool of catalogue.tools) {
      expect(tool.annotations).toMatchObject({
        readOnlyHint: true,
        destructiveHint: false,
        openWorldHint: false,
      });
      expect(tool.inputSchema).toMatchObject({
        properties: {
          documentVersionId: { pattern: expect.stringContaining('[1-5]') },
        },
      });
      expect(tool.inputSchema.additionalProperties).toBe(false);
      expect(tool.outputSchema?.additionalProperties).toBe(false);
    }
  } finally {
    await client.close();
    await server.close();
  }
});
