import { afterAll, afterEach } from 'vitest';

/**
 * `pg` 8 queues a query sent to a client that is still running another one,
 * and warns that `pg` 9.0 will refuse it. In this API that happens when work
 * inside `DatabaseContext.transaction` sends queries concurrently, for
 * example under `Promise.all`, because the transaction is one client (#1231).
 * This setup file fails the test, or the file, during which `pg` warned.
 * `pg` warns once per process and only from the third query in flight, so a
 * file reports its first offence; fixing it can reveal the next one.
 */
const QUEUED_QUERY =
  'Calling client.query() when the client is already executing a query';

const queued: string[] = [];

// The warning's own stack spends about ten frames inside pg and drizzle;
// keep enough to reach the application code that sent the query.
Error.stackTraceLimit = Math.max(Error.stackTraceLimit, 40);

process.on('warning', (warning) => {
  if (
    warning.name === 'DeprecationWarning' &&
    warning.message.startsWith(QUEUED_QUERY)
  )
    queued.push(warning.stack ?? warning.message);
});

function failOnQueuedQuery() {
  const [first] = queued;
  if (first === undefined) return;
  queued.length = 0;
  throw new Error(
    'A query was sent to a pg client that was still running another one; pg 9 refuses it. ' +
      'Inside a DatabaseContext transaction, send queries one after the other, never under Promise.all (#1231).\n' +
      first,
  );
}

afterEach(failOnQueuedQuery);
afterAll(failOnQueuedQuery);
