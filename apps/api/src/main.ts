import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { identityConfiguration } from './identity/identity-configuration.js';

function validateIdentityConfiguration(): void {
  if (process.env.NODE_ENV === 'production') identityConfiguration();
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
