import { useEffect, useState } from 'react';
import { useHarnessCopy } from './harness-copy';

/** Authorization codes are transient; tokens never enter the browser. */
export function ChatGptCallback() {
  const c = useHarnessCopy();
  const [delivery, setDelivery] = useState<'waiting' | 'received' | 'failed'>(
    'waiting',
  );
  const [result] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    return {
      state: params.get('state'),
      code: params.get('code'),
      error: params.has('error'),
    };
  });
  useEffect(() => {
    window.history.replaceState(null, '', '/chatgpt/callback');
    const opener: unknown = window.opener;
    if (
      !opener ||
      typeof opener !== 'object' ||
      !('postMessage' in opener) ||
      typeof opener.postMessage !== 'function' ||
      !result.state ||
      result.error ||
      !result.code
    ) {
      setDelivery('failed');
      return;
    }
    const receive = (event: MessageEvent<unknown>) => {
      if (
        event.source !== opener ||
        event.origin !== window.location.origin ||
        !event.data ||
        typeof event.data !== 'object' ||
        !('type' in event.data) ||
        event.data.type !== 'prisma-chatgpt-received' ||
        !('state' in event.data) ||
        event.data.state !== result.state
      )
        return;
      setDelivery('received');
      window.close();
    };
    window.addEventListener('message', receive);
    opener.postMessage(
      { type: 'prisma-chatgpt-callback', ...result },
      window.location.origin,
    );
    const timeout = setTimeout(() => setDelivery('failed'), 10_000);
    return () => {
      clearTimeout(timeout);
      window.removeEventListener('message', receive);
    };
  }, [result]);
  return (
    <main>
      <p role="status">
        {delivery === 'received'
          ? c.callback
          : delivery === 'waiting'
            ? c.callbackWaiting
            : c.callbackError}
      </p>
    </main>
  );
}
