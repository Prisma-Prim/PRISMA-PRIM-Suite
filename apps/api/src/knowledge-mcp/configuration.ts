const INVALID_CONFIGURATION =
  'Knowledge MCP configuration is invalid or incomplete.';
const UUID =
  /^[\da-f]{8}-[\da-f]{4}-[1-5][\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/iu;

export interface KnowledgeMcpConfiguration {
  readonly apiOrigin: string;
  readonly workspaceId: string;
  readonly companyId: string;
  readonly bearerToken: string;
}

/** Only operator configuration may select the upstream or authenticated context. */
export function readKnowledgeMcpConfiguration(
  environment: Readonly<Record<string, string | undefined>>,
): KnowledgeMcpConfiguration {
  const origin = environment.PRISMA_KNOWLEDGE_API_ORIGIN;
  const workspaceId = environment.PRISMA_KNOWLEDGE_WORKSPACE_ID;
  const companyId = environment.PRISMA_KNOWLEDGE_COMPANY_ID;
  const bearerToken = environment.PRISMA_KNOWLEDGE_BEARER_TOKEN;
  if (
    !origin ||
    !workspaceId ||
    !UUID.test(workspaceId) ||
    !companyId ||
    !UUID.test(companyId) ||
    !bearerToken ||
    bearerToken.length > 8192 ||
    !/^[A-Za-z\d._~+/-]+=*$/u.test(bearerToken)
  )
    throw new Error(INVALID_CONFIGURATION);

  let url: URL;
  try {
    url = new URL(origin);
  } catch {
    throw new Error(INVALID_CONFIGURATION);
  }
  const numericLoopback = ['127.0.0.1', '[::1]'].includes(url.hostname);
  if (
    (url.protocol !== 'https:' &&
      !(url.protocol === 'http:' && numericLoopback)) ||
    url.username ||
    url.password ||
    url.pathname !== '/' ||
    url.search ||
    url.hash
  )
    throw new Error(INVALID_CONFIGURATION);
  return {
    apiOrigin: url.origin,
    workspaceId: workspaceId.toLowerCase(),
    companyId: companyId.toLowerCase(),
    bearerToken,
  };
}

export function isKnowledgeUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID.test(value);
}
