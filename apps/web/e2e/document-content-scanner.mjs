import { Buffer } from 'node:buffer';
import { setTimeout, clearTimeout } from 'node:timers';
import { createServer } from 'node:net';

/** Synthetic external provider for browser acceptance, never production malware proof. */
export async function startDocumentAcceptanceScanner() {
  const sockets = new Set();
  const server = createServer((socket) => {
    sockets.add(socket);
    socket.on('close', () => sockets.delete(socket));
    socket.on('error', () => socket.destroy());
    socket.setTimeout(10_000, () => socket.destroy());
    let input = Buffer.alloc(0);
    socket.on('data', (chunk) => {
      input = Buffer.concat([input, chunk]);
      if (input.length > 5242880 + 4096) {
        socket.destroy();
        return;
      }
      if (input.equals(Buffer.from('zVERSION\0'))) {
        socket.end('ClamAV 0.0/DEMO deterministic boundary\0');
        return;
      }
      if (input.length < 10) return;
      if (!input.subarray(0, 10).equals(Buffer.from('zINSTREAM\0'))) {
        socket.destroy();
        return;
      }
      let offset = 10;
      while (offset + 4 <= input.length) {
        const size = input.readUInt32BE(offset);
        if (size === 0) {
          socket.end('stream: OK\0');
          return;
        }
        if (size > 5242880) {
          socket.destroy();
          return;
        }
        if (offset + 4 + size > input.length) return;
        offset += 4 + size;
      }
    });
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  if (!address || typeof address === 'string')
    throw new Error('Missing acceptance scanner port.');
  return {
    host: '127.0.0.1',
    port: String(address.port),
    close: () =>
      new Promise((resolve, reject) => {
        for (const socket of sockets) socket.destroy();
        const timer = setTimeout(
          () => reject(new Error('Acceptance scanner cleanup timed out.')),
          1000,
        );
        server.close((error) => {
          clearTimeout(timer);
          if (error) reject(error);
          else resolve();
        });
      }),
  };
}
