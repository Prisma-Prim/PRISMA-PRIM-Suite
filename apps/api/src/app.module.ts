import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ApplicationCompositionModule } from './application-composition.module.js';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { IdentityModule } from './identity/identity.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    IdentityModule,
    ApplicationCompositionModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
