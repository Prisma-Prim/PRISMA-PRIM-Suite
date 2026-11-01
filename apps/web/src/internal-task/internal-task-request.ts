import type { ApiResult } from '../api/authenticated-api-client';
import {
  InternalTaskResponseError,
  type Receipt,
} from './internal-task-response';
export type ViewState =
  | 'loading'
  | 'ready'
  | 'error'
  | 'denied'
  | 'missing'
  | 'unavailable'
  | 'unsupported'
  | 'malformed';
export type Command = {
  path: string;
  body: string;
  key: string;
  live: () => boolean;
  recoveryLive: () => boolean;
};
export type Mutation =
  | { kind: 'idle' | 'invalid' | 'conflict' }
  | {
      kind: 'pending' | 'uncertain';
      command: Command;
      message?: 'unsupported' | 'malformed';
    }
  | { kind: 'confirmed'; command: Command; receipt: Receipt };
export type Request = (
  path: string,
  options?: {
    method?: 'GET' | 'POST';
    body?: string;
    key?: string;
    live?: () => boolean;
    recoveryLive?: () => boolean;
  },
) => Promise<ApiResult<unknown> | undefined>;

export function responseState(
  result: ApiResult<unknown>,
  missing: ViewState,
): ViewState {
  if (result.status === 'notFound') return missing;
  if (result.status === 'forbidden' || result.status === 'unauthorized')
    return 'denied';
  if (result.status === 'error' && result.code === 'INTERNAL_TASK_UNSUPPORTED')
    return 'unsupported';
  if (result.status === 'error' && result.code === 'INTERNAL_TASK_UNAVAILABLE')
    return 'unavailable';
  return 'error';
}
export function formatFailure(error: unknown): ViewState {
  return error instanceof InternalTaskResponseError ? error.kind : 'malformed';
}
