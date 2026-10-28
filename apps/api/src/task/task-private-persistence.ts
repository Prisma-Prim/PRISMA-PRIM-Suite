import { HttpException, InternalServerErrorException } from '@nestjs/common';

/** Driver errors can retain bound instruction text. Never pass those errors to diagnostics. */
export async function taskPrivatePersistence<T>(
  work: () => Promise<T>,
): Promise<T> {
  try {
    return await work();
  } catch (error: unknown) {
    if (error instanceof HttpException) throw error;
    throw new InternalServerErrorException(
      'Task persistence could not be confirmed.',
    );
  }
}
