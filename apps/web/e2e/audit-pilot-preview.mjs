import { createHash } from 'node:crypto';
import { isIP } from 'node:net';
import { URL } from 'node:url';
import { preview } from 'vite';
import { pilotGuide } from './audit-pilot-guide.mjs';

export const pilotParticipants = Object.freeze({
  manager: {
    subject: 'local-demonstration-user',
    displayName: 'Ada Ionescu',
    email: 'ada@example.test',
  },
  auditor: {
    subject: 'responsible-colleague',
    displayName: 'Ion Popa',
    email: 'ion@example.test',
  },
  approver: {
    subject: 'workspace-owner',
    displayName: 'Workspace Owner',
    email: 'owner@example.test',
  },
  reader: {
    subject: 'commercial-readonly-member',
    displayName: 'Commercial Reader',
    email: 'commercial-reader@example.test',
  },
});

export function pilotIdentity(role) {
  const participant = Object.hasOwn(pilotParticipants, role)
    ? pilotParticipants[role]
    : undefined;
  if (!participant) return null;
  return {
    'x-test-external-provider': 'local-demo',
    'x-test-external-subject': participant.subject,
    'x-test-display-name': participant.displayName,
    'x-test-email': participant.email,
  };
}

function selectedRole(request) {
  const cookie = request.headers.cookie
    ?.split(';')
    .map((value) => value.trim())
    .find((value) => value.startsWith('prisma-audit-pilot-role='));
  const value = cookie?.slice('prisma-audit-pilot-role='.length) ?? 'manager';
  return Object.hasOwn(pilotParticipants, value) ? value : null;
}

const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');

/** Local test transport only: the native API still establishes all grants and decisions. */
export async function startPilotPreview({
  port = 4173,
  apiOrigin,
  webRoot,
  outDir = 'dist',
  specimen,
  inputs = {},
  certificate,
}) {
  const target = new URL(apiOrigin);
  if (
    target.protocol !== 'http:' ||
    isIP(target.hostname) !== 4 ||
    !target.hostname.startsWith('127.') ||
    target.username ||
    target.password ||
    target.search ||
    target.hash ||
    target.pathname !== '/'
  ) {
    throw new Error('The pilot API must be a numeric-loopback HTTP origin.');
  }
  const manifest = {
    schema: 'prisma-prim-local-audit-pilot/v1',
    classification:
      'fictional local demonstration; not real-pilot qualification',
    preparedThrough: 'signed agreement; no approved team or decision',
    companyName: specimen.companyName,
    companyId: specimen.companyId,
    projectTitle: specimen.projectTitle,
    projectId: specimen.projectId,
    orderReference: specimen.orderReference,
    caseId: specimen.caseId,
    today: specimen.today,
    source: specimen.source,
    inputs,
    participants: pilotParticipants,
    originals: {
      pdf: {
        bytes: specimen.pdf.length,
        sha256: sha256(specimen.pdf),
        nativeBinding: specimen.source,
      },
      docx: {
        bytes: specimen.docx.length,
        sha256: sha256(specimen.docx),
        nativeBinding: 'deliberate upload remains to be performed',
      },
    },
  };
  let origin;
  const files = new Map([
    [
      '/__pilot/sources/evidence.pdf',
      {
        bytes: specimen.pdf,
        type: 'application/pdf',
        name: 'fictional-evidence.pdf',
      },
    ],
    [
      '/__pilot/sources/review.docx',
      {
        bytes: specimen.docx,
        type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        name: 'fictional-reviewed-values.docx',
      },
    ],
  ]);
  const send = (response, status, body, type = 'text/plain; charset=utf-8') => {
    response.writeHead(status, {
      'content-type': type,
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
    });
    response.end(body);
  };
  const middleware = async (request, response, next) => {
    if (!origin) return send(response, 503, 'Pilot is starting.');
    if (
      request.headers.host !== new URL(origin).host ||
      (request.headers.origin && request.headers.origin !== origin) ||
      request.headers['sec-fetch-site'] === 'cross-site'
    )
      return send(response, 403, 'Local pilot origin required.');
    const role = selectedRole(request);
    if (!role) return send(response, 403, 'Unknown fictional participant.');
    const url = new URL(request.url, origin);
    if (!url.pathname.startsWith('/__pilot')) return next();
    if (request.method !== 'GET') return send(response, 405, 'GET required.');
    if (url.pathname === '/__pilot') {
      response.setHeader(
        'content-security-policy',
        "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'",
      );
      return send(
        response,
        200,
        pilotGuide(
          manifest,
          url.searchParams.get('lang') === 'ru' ? 'ru' : 'ro',
        ),
        'text/html; charset=utf-8',
      );
    }
    if (url.pathname === '/__pilot/manifest')
      return send(response, 200, JSON.stringify(manifest), 'application/json');
    if (url.pathname.startsWith('/__pilot/actor/')) {
      const selected = url.pathname.slice('/__pilot/actor/'.length);
      if (!Object.hasOwn(pilotParticipants, selected))
        return send(response, 404, 'Unknown fictional participant.');
      response.writeHead(303, {
        location: '/#projects',
        'set-cookie': `prisma-audit-pilot-role=${selected}; Path=/; HttpOnly; SameSite=Strict`,
        'cache-control': 'no-store',
      });
      return response.end();
    }
    let file = files.get(url.pathname);
    if (
      url.pathname === '/__pilot/sources/certificate-example.pdf' &&
      certificate
    ) {
      try {
        const bytes = await certificate(role);
        if (!bytes)
          return send(
            response,
            409,
            'An authorized granting decision and Certificate texts are required.',
          );
        file = {
          bytes,
          type: 'application/pdf',
          name: `fictional-certificate-${sha256(bytes).slice(0, 12)}.pdf`,
        };
      } catch {
        return send(response, 404, 'Example unavailable.');
      }
    }
    if (!file) return send(response, 404, 'Unknown pilot resource.');
    response.setHeader(
      'content-disposition',
      `attachment; filename="${file.name}"`,
    );
    response.setHeader('content-length', file.bytes.length);
    response.setHeader('etag', `"${sha256(file.bytes)}"`);
    return send(response, 200, file.bytes, file.type);
  };
  const server = await preview({
    configFile: false,
    root: webRoot,
    build: { outDir },
    logLevel: 'error',
    plugins: [
      {
        name: 'local-fictional-audit-pilot',
        configurePreviewServer(server) {
          server.middlewares.use(
            (request, response, next) =>
              void middleware(request, response, next).catch(() =>
                send(response, 500, 'Pilot resource unavailable.'),
              ),
          );
        },
      },
    ],
    preview: {
      host: '127.0.0.1',
      port,
      strictPort: true,
      open: false,
      proxy: {
        '/api': {
          target: target.origin,
          changeOrigin: true,
          configure(proxy) {
            proxy.on('proxyReq', (outgoing, incoming) => {
              outgoing.removeHeader('authorization');
              outgoing.removeHeader('cookie');
              for (const [name, value] of Object.entries(
                pilotIdentity(selectedRole(incoming)) ?? {},
              ))
                outgoing.setHeader(name, value);
            });
          },
        },
      },
    },
  });
  const address = server.httpServer.address();
  if (!address || typeof address === 'string') {
    await new Promise((resolve) => server.httpServer.close(resolve));
    throw new Error('Pilot preview has no numeric loopback address.');
  }
  origin = `http://127.0.0.1:${address.port}`;
  let closing;
  return {
    origin,
    manifest,
    close() {
      closing ??= new Promise((resolve, reject) => {
        server.httpServer.close((error) => (error ? reject(error) : resolve()));
        server.httpServer.closeAllConnections();
      });
      return closing;
    },
  };
}
