import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { ModuleKind, ScriptTarget, transpileModule } from 'typescript';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

let directory: string;
let entry: string;
const workspaceId = '00000000-0000-4000-8000-000000000001';
const companyId = '00000000-0000-4000-8000-000000000002';
const sourceId = '00000000-0000-4000-8000-000000000003';
const environment = {
  PRISMA_KNOWLEDGE_API_ORIGIN: 'http://127.0.0.1:43929',
  PRISMA_KNOWLEDGE_WORKSPACE_ID: workspaceId,
  PRISMA_KNOWLEDGE_COMPANY_ID: companyId,
  PRISMA_KNOWLEDGE_BEARER_TOKEN: 'synthetic-prisma-token',
};

beforeAll(async () => {
  directory = await mkdtemp(join(tmpdir(), 'prisma-knowledge-stdio-'));
  // Compile this owned entry with the repository TypeScript compiler. The parent
  // still verifies the complete Nest build; this focused proof runs real stdio.
  for (const name of [
    'configuration',
    'protocol',
    'rest-client',
    'server',
    'stdio.main',
  ]) {
    const fileName = resolve('src/knowledge-mcp', `${name}.ts`);
    const source = await readFile(fileName, 'utf8');
    const compiled = transpileModule(source, {
      fileName,
      compilerOptions: {
        module: ModuleKind.CommonJS,
        target: ScriptTarget.ES2023,
        esModuleInterop: true,
      },
    });
    await writeFile(join(directory, `${name}.js`), compiled.outputText);
  }
  await symlink(
    resolve('node_modules'),
    join(directory, 'node_modules'),
    'dir',
  );
  entry = join(directory, 'stdio.main.js');
});

afterAll(async () => {
  if (directory) await rm(directory, { recursive: true, force: true });
});

async function run(
  args: string[],
  values: Record<string, string> = environment,
) {
  const process = spawn(globalThis.process.execPath, [entry, ...args], {
    env: values,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let stdout = '';
  let stderr = '';
  process.stdout.on('data', (chunk) => {
    stdout += String(chunk);
  });
  process.stderr.on('data', (chunk) => {
    stderr += String(chunk);
  });
  const code = await new Promise<number | null>((resolve, reject) => {
    process.once('error', reject);
    process.once('exit', resolve);
  });
  return { code, stdout, stderr };
}

describe('compiled Codex-compatible stdio entry', () => {
  it('provides noninteractive help with variable names and no supplied values', async () => {
    const result = await run(['--help']);
    expect(result.code).toBe(0);
    expect(result.stdout).toContain('PRISMA_KNOWLEDGE_BEARER_TOKEN');
    expect(result.stdout).toContain('No ChatGPT/Codex session credential');
    expect(result.stdout).not.toContain(
      environment.PRISMA_KNOWLEDGE_BEARER_TOKEN,
    );
    expect(result.stderr).toBe('');
  });

  it('rejects command-line authority/configuration overrides without echoing them', async () => {
    const result = await run(['--token', 'do-not-print-this-value']);
    expect(result.code).toBe(2);
    expect(result.stdout).toBe('');
    expect(result.stderr).toBe(
      'Usage: node dist/knowledge-mcp/stdio.main.js [--help]\n',
    );
    expect(result.stderr).not.toContain('do-not-print-this-value');
  });

  it.each([
    {},
    { ...environment, PRISMA_KNOWLEDGE_API_ORIGIN: 'http://external.example' },
    { ...environment, PRISMA_KNOWLEDGE_API_ORIGIN: 'http://localhost:43929' },
    {
      ...environment,
      PRISMA_KNOWLEDGE_API_ORIGIN: 'https://name:secret@example.test',
    },
    { ...environment, PRISMA_KNOWLEDGE_API_ORIGIN: 'https://example.test/api' },
    {
      ...environment,
      PRISMA_KNOWLEDGE_API_ORIGIN: 'https://example.test/?token=secret',
    },
    {
      ...environment,
      PRISMA_KNOWLEDGE_API_ORIGIN: 'https://example.test/#secret',
    },
    { ...environment, PRISMA_KNOWLEDGE_API_ORIGIN: 'file:///private/path' },
    { ...environment, PRISMA_KNOWLEDGE_WORKSPACE_ID: 'not-a-uuid' },
    {
      ...environment,
      PRISMA_KNOWLEDGE_BEARER_TOKEN: 'token\r\nother-header: secret',
    },
  ])(
    'fails closed for missing, non-origin or invalid operator configuration',
    async (values) => {
      const result = await run([], values);
      expect(result.code).toBe(1);
      expect(result.stdout).toBe('');
      expect(result.stderr).toBe('Knowledge MCP could not start.\n');
    },
  );

  it('initializes and calls a literal passage through actual SDK stdio and owned HTTP', async () => {
    const text = 'Întrebarea este fictivă. Это буквальная цитата.';
    const source = {
      sourceId,
      documentId: '00000000-0000-4000-8000-000000000004',
      documentVersionId: '00000000-0000-4000-8000-000000000005',
      sourceSha256: 'a'.repeat(64),
      projectionSha256: 'b'.repeat(64),
      title: 'Fictional evidence',
      language: 'ro',
      versionStatus: 'official',
    };
    const passage = {
      source,
      locator: 'p1',
      text,
      passageSha256: createHash('sha256').update(text).digest('hex'),
      retrievedAt: '2026-10-30T12:00:00.000Z',
    };
    const requests: string[] = [];
    const api = createServer((request, response) => {
      requests.push(request.url ?? '');
      if (
        request.headers.authorization !== 'Bearer synthetic-prisma-token' ||
        request.headers['x-company-context-id'] !== companyId ||
        request.headers['x-workspace-context-id'] !== workspaceId
      ) {
        response.writeHead(401);
        response.end();
        return;
      }
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(JSON.stringify(passage));
    });
    await new Promise<void>((resolve) => api.listen(0, '127.0.0.1', resolve));
    const address = api.address();
    if (!address || typeof address === 'string')
      throw new Error('No test listener.');
    const transport = new StdioClientTransport({
      command: globalThis.process.execPath,
      args: [entry],
      env: {
        ...environment,
        PRISMA_KNOWLEDGE_API_ORIGIN: `http://127.0.0.1:${address.port}`,
      },
      stderr: 'pipe',
    });
    let diagnostics = '';
    transport.stderr?.on('data', (chunk) => {
      diagnostics += String(chunk);
    });
    const client = new Client({ name: 'actual-stdio-contract', version: '1' });
    try {
      await client.connect(transport);
      const tools = await client.listTools();
      expect(tools.tools.map(({ name }) => name)).toEqual([
        'list_knowledge_sources',
        'search_knowledge',
        'get_knowledge_passage',
      ]);
      const result = await client.callTool({
        name: 'get_knowledge_passage',
        arguments: { sourceId, locator: 'p1' },
      });
      expect(result.isError).not.toBe(true);
      expect(result.structuredContent).toEqual(passage);
      expect(requests).toEqual([
        `/api/knowledge/sources/${sourceId}/passages/p1?mode=current`,
      ]);
    } finally {
      await client.close();
      api.closeAllConnections();
      await new Promise<void>((resolve, reject) =>
        api.close((error) => (error ? reject(error) : resolve())),
      );
    }
    expect(diagnostics).toBe('');
  });
});
