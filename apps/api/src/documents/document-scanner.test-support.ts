import { createServer, type Socket } from 'node:net';

/** Deterministic external ClamAV wire boundary; not real scanner evidence. */
export async function openDocumentScannerFixture() {
  const scannerSockets = new Set<Socket>();
  let scanCount = 0;
  let scanMode: 'clean' | 'unsafe' | 'unavailable' | 'malformed' = 'clean';
  let holdScan: ((complete: () => void) => void) | undefined;

  // Actual scanner adapter with a deterministic external ClamAV wire fixture.
  // This is not real ClamAV/definitions evidence and mocks no owning module.
  const scanner = createServer((socket) => {
    scannerSockets.add(socket);
    socket.on('close', () => scannerSockets.delete(socket));
    let input = Buffer.alloc(0);
    let completed = false;
    socket.on('data', (chunk) => {
      if (completed) return;
      input = Buffer.concat([input, chunk]);
      if (input.equals(Buffer.from('zVERSION\0'))) {
        completed = true;
        socket.end('ClamAV 1.4.3\0');
        return;
      }
      if (!input.subarray(0, 10).equals(Buffer.from('zINSTREAM\0'))) return;
      let offset = 10;
      while (offset + 4 <= input.length) {
        const size = input.readUInt32BE(offset);
        if (size === 0) {
          completed = true;
          scanCount += 1;
          const complete = () => {
            if (scanMode === 'unavailable') socket.destroy();
            else
              socket.end(
                scanMode === 'unsafe'
                  ? 'stream: DEMO.Test FOUND\0'
                  : scanMode === 'malformed'
                    ? 'uncertain\0'
                    : 'stream: OK\0',
              );
          };
          if (holdScan) holdScan(complete);
          else complete();
          return;
        }
        if (offset + 4 + size > input.length) return;
        offset += 4 + size;
      }
    });
  });
  await new Promise<void>((resolve, reject) => {
    scanner.once('error', reject);
    scanner.listen(0, '127.0.0.1', resolve);
  });
  const scannerAddress = scanner.address();
  if (!scannerAddress || typeof scannerAddress === 'string')
    throw new Error('Expected scanner fixture address.');

  return {
    environment: {
      DOCUMENT_MALWARE_SCANNER_HOST: '127.0.0.1',
      DOCUMENT_MALWARE_SCANNER_PORT: String(scannerAddress.port),
    },
    reset() {
      scanMode = 'clean';
      scanCount = 0;
      holdScan = undefined;
    },
    get scanCount() {
      return scanCount;
    },
    setScanMode(mode: 'clean' | 'unsafe' | 'unavailable' | 'malformed') {
      scanMode = mode;
    },
    holdNextScan() {
      if (holdScan) throw new Error('A scanner barrier is already waiting.');
      let releaseScan: (() => void) | undefined;
      const reached = new Promise<void>((resolve) => {
        holdScan = (complete) => {
          holdScan = undefined;
          releaseScan = complete;
          resolve();
        };
      });
      return {
        reached,
        release() {
          const complete = releaseScan;
          releaseScan = undefined;
          complete?.();
        },
      };
    },
    async close() {
      for (const socket of scannerSockets) socket.destroy();
      await new Promise<void>((resolve, reject) =>
        scanner.close((error) => (error ? reject(error) : resolve())),
      );
    },
  };
}
