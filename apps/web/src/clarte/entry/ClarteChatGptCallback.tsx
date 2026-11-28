import { CircleAlert, CircleCheck } from 'lucide-react';
import type { ChatGptCallbackDelivery } from '../../dossier-analysis/ChatGptCallback';
import { useHarnessCopy } from '../../dossier-analysis/harness-copy';
import { useClarteEntryCopy } from './clarte-entry.copy';
import { ClartePage } from './ClartePage';

const deliveryTone = {
  waiting: 'neutral',
  received: 'success',
  failed: 'danger',
} as const satisfies Record<ChatGptCallbackDelivery, string>;

/**
 * The small window the ChatGPT consent returns to. The owner hands the code to
 * the window that opened it; this screen only says how that delivery stands.
 */
export function ClarteChatGptCallback({
  delivery,
}: Readonly<{ delivery: ChatGptCallbackDelivery }>) {
  const copy = useHarnessCopy();
  const entryCopy = useClarteEntryCopy();
  const message = {
    waiting: copy.callbackWaiting,
    received: copy.callback,
    failed: copy.callbackError,
  } satisfies Record<ChatGptCallbackDelivery, string>;
  return (
    <ClartePage>
      <h1>{entryCopy.chatGptConnection}</h1>
      <p
        className={`clarte-page-callout clarte-page-callout--${deliveryTone[delivery]}`}
        role="status"
      >
        {delivery === 'waiting' ? (
          <span className="clarte-spinner" aria-hidden="true" />
        ) : delivery === 'received' ? (
          <CircleCheck aria-hidden="true" />
        ) : (
          <CircleAlert aria-hidden="true" />
        )}
        {message[delivery]}
      </p>
    </ClartePage>
  );
}
