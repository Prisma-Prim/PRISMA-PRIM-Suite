import { configureMissionPlanTransport } from './mission-plan/mission-plan-http.js';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { identityConfiguration } from './identity/identity-configuration.js';

function validateIdentityConfiguration(): void {
  if (process.env.NODE_ENV === 'production') identityConfiguration();
}

async function bootstrap(): Promise<void> {
  validateIdentityConfiguration();
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  const port = Number(process.env.API_PORT ?? 3000);

  configureMissionPlanTransport(app);
  app.setGlobalPrefix('api');
  app.enableCors({
    origin: process.env.WEB_ORIGIN ?? 'http://localhost:5173',
    credentials: true,
    exposedHeaders: [
      'Content-Disposition',
      'Content-Length',
      'X-Commercial-Pdf-Source',
      'X-Commercial-Pdf-Sha256',
      'X-Commercial-Pdf-Renderer',
    ],
  });

  await app.listen(port);
}

void bootstrap();
