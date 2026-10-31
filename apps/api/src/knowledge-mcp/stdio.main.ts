import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createKnowledgeMcpServer } from './server.js';

const HELP = `PRISMA-PRIM read-only knowledge MCP bridge

Usage: node dist/knowledge-mcp/stdio.main.js

Required operator environment variables:
  PRISMA_KNOWLEDGE_API_ORIGIN
  PRISMA_KNOWLEDGE_WORKSPACE_ID
  PRISMA_KNOWLEDGE_COMPANY_ID
  PRISMA_KNOWLEDGE_BEARER_TOKEN

Use a legitimate PRISMA credential for the selected Workspace/Company.
No ChatGPT/Codex session credential or model API key is used.
The API verifies identity, current grants, source admission and Document access.
HTTPS is required except numeric-loopback HTTP for local qualification.
No other command-line arguments are accepted. Normal stdout is MCP only.
`;

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (args.length === 1 && args[0] === '--help') {
    process.stdout.write(HELP);
    return;
  }
  if (args.length !== 0) {
    process.stderr.write(
      'Usage: node dist/knowledge-mcp/stdio.main.js [--help]\n',
    );
    process.exitCode = 2;
    return;
  }
  const server = createKnowledgeMcpServer(process.env);
  const transport = new StdioServerTransport();
  let closing: Promise<void> | undefined;
  function close(): void {
    closing ??= server.close().finally(() => process.stdin.pause());
    void closing.catch(() => {
      process.stderr.write('Knowledge MCP could not close cleanly.\n');
      process.exitCode = 1;
    });
  }
  process.once('SIGINT', close);
  process.once('SIGTERM', close);
  process.stdin.once('end', close);
  process.stdin.once('close', close);
  await server.connect(transport);
}

void main().catch(() => {
  process.stderr.write('Knowledge MCP could not start.\n');
  process.exitCode = 1;
  process.stdin.pause();
});
