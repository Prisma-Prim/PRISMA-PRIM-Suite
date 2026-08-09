import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';

function validateIdentityConfiguration(): void {
  if (
    process.env.NODE_ENV === 'production' &&
    (!process.env.CLERK_SECRET_KEY || !process.env.CLERK_PUBLISHABLE_KEY)
  ) {
    throw new Error(
      'CLERK_SECRET_KEY and CLERK_PUBLISHABLE_KEY are required in production.',
    );
  }
}

async function bootstrap(): Promise<void> {
  validateIdentityConfiguration();
  const app = await NestFactory.create(AppModule);
  const port = Number(process.env.API_PORT ?? 3000);

  app.setGlobalPrefix('api');
  app.enableCors({
    origin: process.env.WEB_ORIGIN ?? 'http://localhost:5173',
    credentials: true,
  });

  await app.listen(port);
}

void bootstrap();
