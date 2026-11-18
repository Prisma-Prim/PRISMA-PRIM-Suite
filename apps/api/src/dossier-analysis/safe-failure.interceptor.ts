import {
  HttpException,
  Injectable,
  ServiceUnavailableException,
  type CallHandler,
  type ExecutionContext,
  type NestInterceptor,
} from '@nestjs/common';
import { catchError, defer, throwError, type Observable } from 'rxjs';

/** Never hand driver or parser errors (which may contain source data) to Nest's logger. */
export function safeDossierFailure(error: unknown): HttpException {
  return error instanceof HttpException
    ? error
    : new ServiceUnavailableException('Dossier analysis is unavailable.');
}

@Injectable()
export class DossierSafeFailureInterceptor implements NestInterceptor {
  intercept(
    _context: ExecutionContext | undefined,
    next: CallHandler,
  ): Observable<unknown> {
    return defer(() => next.handle()).pipe(
      catchError((error: unknown) =>
        throwError(() => safeDossierFailure(error)),
      ),
    );
  }
}
