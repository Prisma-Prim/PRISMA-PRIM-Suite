import type { TaskResultDocumentReference } from '../documents/document-task-result-reference.service.js';
import type { TaskActor } from './task.types.js';

export type TaskResultDeclaration = {
  id: string;
  revision: number;
  declaration: string;
  actor: TaskActor;
  occurredAt: string;
  reference: TaskResultDocumentReference;
} & (
  | { kind: 'recorded' }
  | { kind: 'corrected'; predecessorId: string; reason: string }
);

export interface TaskResultReceipt {
  action: 'recorded' | 'corrected' | 'unchanged';
  taskId: string;
  resultId: string;
  resultRevision: number;
}
