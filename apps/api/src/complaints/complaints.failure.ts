import { HttpException, InternalServerErrorException } from '@nestjs/common';

// Catch outside the transaction promise: deferred COMMIT failures must be as
// confidential as statement failures. Never attach a driver error as a cause.
export async function protectComplaintOutcome<T>(
  work: () => Promise<T>,
): Promise<T> {
  try {
    return await work();
  } catch (error) {
    if (error instanceof HttpException) throw error;
    throw new InternalServerErrorException({
      code: 'COMPLAINT_OPERATION_FAILED',
      message:
        'The outcome could not be confirmed. Retry the unchanged command.',
    });
  }
}
