import { describe, expect, it } from 'vitest';
import { ChatGptPlanClient, PlanFailure } from './provider.js';

const event = (value: unknown) => 'data: ' + JSON.stringify(value) + '\r\n\r\n';
const completed = {
  type: 'response.completed',
  response: {
    status: 'completed',
    output: [
      { type: 'message', content: [{ type: 'output_text', text: '[]' }] },
    ],
  },
};
const request = { model: 'available-model', instructions: 'Review', input: [] };

describe('official subscription Responses boundary', () => {
  it('classifies malformed completed JSON as invalid without exposing content', async () => {
    const client = new ChatGptPlanClient(
      async () =>
        new Response(
          event({
            ...completed,
            response: {
              status: 'completed',
              output: [
                {
                  type: 'message',
                  content: [
                    { type: 'output_text', text: 'private invalid JSON' },
                  ],
                },
              ],
            },
          }),
        ),
    );
    await expect(client.review('private-token', request)).rejects.toMatchObject(
      { kind: 'invalid' },
    );
  });
  it('accepts completed structured output across fragmented SSE frames', async () => {
    const bytes = new TextEncoder().encode(event(completed));
    const client = new ChatGptPlanClient(async (url, init) => {
      expect(String(url)).toBe('https://api.openai.com/v1/responses');
      const body: unknown = JSON.parse(String(init?.body));
      expect(body).toMatchObject({ store: false, stream: true });
      expect(JSON.stringify(body)).not.toContain('max_output_tokens');
      return new Response(
        new ReadableStream({
          start(c) {
            c.enqueue(bytes.slice(0, 13));
            c.enqueue(bytes.slice(13));
            c.close();
          },
        }),
        { headers: { 'content-type': 'text/event-stream' } },
      );
    });
    await expect(client.review('private-token', request)).resolves.toEqual([]);
  });

  it('never publishes streamed text without a completed response', async () => {
    const client = new ChatGptPlanClient(
      async () =>
        new Response(
          event({
            type: 'response.output_text.delta',
            delta: '[{"field":"taxId"}]',
          }),
        ),
    );
    await expect(client.review('private-token', request)).rejects.toMatchObject(
      { kind: 'interrupted' },
    );
  });

  it('stops on subscription quota errors without a paid fallback', async () => {
    let requests = 0;
    const client = new ChatGptPlanClient(async () => {
      requests++;
      return new Response(
        event({
          type: 'response.failed',
          response: {
            error: {
              code: 'subscription_sharing_usage_limit_exceeded',
              message: 'private diagnostics',
            },
          },
        }),
      );
    });
    const failure = await client
      .review('private-token', request)
      .catch((e: unknown) => e);
    expect(failure).toBeInstanceOf(PlanFailure);
    expect(failure).toMatchObject({ kind: 'quota' });
    expect(String(failure)).not.toContain('private');
    expect(requests).toBe(1);
  });
});
