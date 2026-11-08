import { createHash } from 'node:crypto';
import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from 'node:http';
import type { Socket } from 'node:net';

export const GUARDDUTY_DEMO_BUCKET = 'demo-document-scan-bucket';
/** Obviously fake credentials for the standard AWS environment provider. */
export const GUARDDUTY_DEMO_AWS_ENVIRONMENT = {
  AWS_ACCESS_KEY_ID: 'DEMO-ACCESS-KEY-ID',
  AWS_SECRET_ACCESS_KEY: 'DEMO-SECRET-ACCESS-KEY',
  AWS_EC2_METADATA_DISABLED: 'true',
};

type FakeS3Operation = 'put' | 'get-tagging' | 'delete';
type FakeS3Failure = 'transport' | 'access-denied' | 'hang';
export interface FakeS3Request {
  operation: FakeS3Operation;
  bucket: string;
  key: string;
  versionId: string | null;
  serverSideEncryption: string | undefined;
  contentType: string | undefined;
  body: Buffer;
}

/**
 * Deterministic local S3-compatible HTTP boundary for the GuardDuty engine.
 * The real AWS SDK talks to it with path-style addressing; it proves the
 * adapter's wire use, not GuardDuty's malware detection.
 */
export async function openGuardDutyS3Fake() {
  const sockets = new Set<Socket>();
  const requests: FakeS3Request[] = [];
  const stored = new Map<string, Buffer>();
  let scanStatus: string | undefined = 'NO_THREATS_FOUND';
  let untaggedPolls = 0;
  let versioned = false;
  let failures: Partial<Record<FakeS3Operation, FakeS3Failure>> = {};

  const server = createServer((request, response) => {
    // An unexpected fixture failure reaches the SDK as a transport error.
    handle(request, response).catch(() => request.socket.destroy());
  });
  server.on('connection', (socket) => {
    sockets.add(socket);
    socket.once('close', () => sockets.delete(socket));
  });

  async function handle(
    request: IncomingMessage,
    response: ServerResponse,
  ): Promise<void> {
    const body = await readBody(request);
    const url = new URL(request.url ?? '/', 'http://127.0.0.1');
    const [bucket = '', ...keySegments] = url.pathname
      .slice(1)
      .split('/')
      .map((segment) => decodeURIComponent(segment));
    const key = keySegments.join('/');
    const operation: FakeS3Operation | undefined =
      request.method === 'PUT' && !url.searchParams.has('tagging')
        ? 'put'
        : request.method === 'GET' && url.searchParams.has('tagging')
          ? 'get-tagging'
          : request.method === 'DELETE'
            ? 'delete'
            : undefined;
    if (!operation) {
      respondError(response, 400, 'InvalidRequest');
      return;
    }
    const encryption = request.headers['x-amz-server-side-encryption'];
    requests.push({
      operation,
      bucket,
      key,
      versionId: url.searchParams.get('versionId'),
      serverSideEncryption:
        typeof encryption === 'string' ? encryption : undefined,
      contentType: request.headers['content-type'],
      body,
    });
    const failure = failures[operation];
    if (failure === 'transport') {
      request.socket.destroy();
      return;
    }
    if (failure === 'hang') return;
    if (failure === 'access-denied') {
      respondError(response, 403, 'AccessDenied');
      return;
    }
    if (bucket !== GUARDDUTY_DEMO_BUCKET) {
      respondError(response, 404, 'NoSuchBucket');
      return;
    }
    if (operation === 'put') {
      stored.set(key, body);
      response.writeHead(200, {
        ETag: `"${createHash('md5').update(body).digest('hex')}"`,
        ...(versioned ? { 'x-amz-version-id': `demo-version-${key}` } : {}),
      });
      response.end();
      return;
    }
    if (operation === 'delete') {
      stored.delete(key);
      response.writeHead(204);
      response.end();
      return;
    }
    if (!stored.has(key)) {
      respondError(response, 404, 'NoSuchKey');
      return;
    }
    const tags = [{ key: 'DemoUnrelatedTag', value: 'DEMO' }];
    if (untaggedPolls > 0) untaggedPolls -= 1;
    else if (scanStatus !== undefined)
      tags.push({ key: 'GuardDutyMalwareScanStatus', value: scanStatus });
    response.writeHead(200, { 'content-type': 'application/xml' });
    response.end(
      `<?xml version="1.0" encoding="UTF-8"?><Tagging xmlns="http://s3.amazonaws.com/doc/2006-03-01/"><TagSet>${tags
        .map(
          (tag) =>
            `<Tag><Key>${tag.key}</Key><Value>${tag.value}</Value></Tag>`,
        )
        .join('')}</TagSet></Tagging>`,
    );
  }

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  if (!address || typeof address === 'string')
    throw new Error('Expected fake S3 address.');

  return {
    /** Document scanner settings selecting GuardDuty against this fake. */
    settings: {
      DOCUMENT_MALWARE_SCANNER_ENGINE: 'guardduty',
      DOCUMENT_MALWARE_SCANNER_GUARDDUTY_BUCKET: GUARDDUTY_DEMO_BUCKET,
      DOCUMENT_MALWARE_SCANNER_GUARDDUTY_REGION: 'eu-west-3',
      DOCUMENT_MALWARE_SCANNER_GUARDDUTY_TEST_ENDPOINT: `http://127.0.0.1:${address.port}`,
    },
    requests,
    /** Objects still present: empty once every scan object was deleted. */
    get storedKeys(): string[] {
      return [...stored.keys()];
    },
    /** The status GuardDuty reports; undefined never tags the object. */
    reportStatus(status: string | undefined, options: { after?: number } = {}) {
      scanStatus = status;
      untaggedPolls = options.after ?? 0;
    },
    enableVersioning() {
      versioned = true;
    },
    fail(operation: FakeS3Operation, failure: FakeS3Failure) {
      failures = { ...failures, [operation]: failure };
    },
    reset() {
      requests.length = 0;
      stored.clear();
      scanStatus = 'NO_THREATS_FOUND';
      untaggedPolls = 0;
      versioned = false;
      failures = {};
    },
    async close() {
      for (const socket of sockets) socket.destroy();
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
    },
  };
}

function readBody(request: IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    request.on('data', (chunk: Buffer) => chunks.push(chunk));
    request.once('end', () => resolve(Buffer.concat(chunks)));
    request.once('error', reject);
  });
}

function respondError(
  response: ServerResponse,
  status: number,
  code: string,
): void {
  response.writeHead(status, { 'content-type': 'application/xml' });
  response.end(
    `<?xml version="1.0" encoding="UTF-8"?><Error><Code>${code}</Code><Message>DEMO ${code}</Message><RequestId>DEMO</RequestId></Error>`,
  );
}
