import { ConflictException, ForbiddenException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { lastValueFrom, throwError } from 'rxjs';
import {
  DossierSafeFailureInterceptor,
  safeDossierFailure,
} from './safe-failure.interceptor.js';

describe('analysis failure boundary', () => {
  it('replaces an unexpected error with a generic response without its contents', () => {
    const secret = 'private document text or database parameter';
    const result = safeDossierFailure(new Error(secret));
    expect(result.getStatus()).toBe(503);
    expect(JSON.stringify(result.getResponse())).not.toContain(secret);
    expect(result.message).not.toContain(secret);
    expect(result.cause).toBeUndefined();
  });
  it('maps an error emitted by the controller observable', async () => {
    const interceptor = new DossierSafeFailureInterceptor();
    const response = interceptor.intercept(undefined, {
      handle: () => throwError(() => new Error('private source contents')),
    });
    let caught: unknown;
    try {
      await lastValueFrom(response);
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(Error);
    if (!(caught instanceof Error)) throw new Error('Expected mapped error.');
    expect(caught.message).toBe('Dossier analysis is unavailable.');
  });
  it('preserves intended denials and concurrency conflicts', () => {
    const forbidden = new ForbiddenException();
    const conflict = new ConflictException('Reload the analysis.');
    expect(safeDossierFailure(forbidden)).toBe(forbidden);
    expect(safeDossierFailure(conflict)).toBe(conflict);
  });
});
