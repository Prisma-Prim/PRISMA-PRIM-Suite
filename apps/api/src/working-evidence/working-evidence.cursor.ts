import { HttpException } from '@nestjs/common';
import {
  createWorkingEvidenceContinuationCursor,
  type ContinuationCursorKey,
} from '../continuation-cursor/continuation-cursor.js';
import { integer, uuid } from './working-evidence.contract.js';

export type WorkingEvidencePosition =
  | { kind: 'cases'; offset: number }
  | { kind: 'history'; offset: number }
  | {
      kind: 'sources';
      createdAt: string;
      documentId: string;
      versionNumber: number;
    };

export function workingEvidenceCursors(
  key: ContinuationCursorKey<WorkingEvidencePosition['kind']>,
) {
  return createWorkingEvidenceContinuationCursor<WorkingEvidencePosition>({
    key,
    position: {
      encode: (position) =>
        position.kind === 'sources'
          ? [position.createdAt, position.documentId, position.versionNumber]
          : [position.offset],
      decode: ({ kind, position }) => {
        if (kind === 'sources') {
          const [createdAt, documentId, versionNumber] = position;
          if (
            position.length !== 3 ||
            typeof createdAt !== 'string' ||
            !Number.isFinite(Date.parse(createdAt)) ||
            new Date(createdAt).toISOString() !== createdAt
          )
            throw new Error();
          return {
            kind,
            createdAt,
            documentId: uuid(documentId),
            versionNumber: integer(versionNumber, 1, 50),
          };
        }
        if (position.length !== 1) throw new Error();
        const offset = integer(position[0], 0, 2147483647);
        return kind === 'cases'
          ? { kind: 'cases', offset }
          : { kind: 'history', offset };
      },
    },
    invalid: () => new HttpException({ code: 'invalid_request' }, 400),
    wrongKind: () => new HttpException({ code: 'invalid_request' }, 400),
    unavailable: () => new HttpException({ code: 'content_unavailable' }, 503),
  });
}
