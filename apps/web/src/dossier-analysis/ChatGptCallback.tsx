import { useEffect, useState } from 'react';
import { useInterfacePreference } from '../clarte/InterfacePreferenceProvider';
import { ClarteChatGptCallback } from '../clarte/entry/ClarteChatGptCallback';
import { useHarnessCopy } from './harness-copy';

/** How handing the authorization code to the opening window stands. */
export type ChatGptCallbackDelivery = 'waiting' | 'received' | 'failed';

/** Authorization codes are transient; tokens never enter the browser. */
export function ChatGptCallback() {
  const c = useHarnessCopy();
  const { preference } = useInterfacePreference();
  const delivery = useChatGptCallbackDelivery();
  if (preference === 'clarte')
    return <ClarteChatGptCallback delivery={delivery} />;
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

/**
 * Hands the code of this callback URL to the window that opened it, once, and
 * closes this window when that window confirms. The URL loses its parameters
 * without a navigation.
 */
function useChatGptCallbackDelivery(): ChatGptCallbackDelivery {
  const [delivery, setDelivery] = useState<ChatGptCallbackDelivery>('waiting');
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
  return delivery;
}
