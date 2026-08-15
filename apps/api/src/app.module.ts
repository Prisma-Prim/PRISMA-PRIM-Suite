import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AccessAccountabilityCompositionModule } from './accountability/access-accountability-composition.module.js';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { DatabaseModule } from './database/database.module.js';
import { IdentityModule } from './identity/identity.module.js';
import { CompanyModule } from './company/company.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    DatabaseModule,
    IdentityModule,
    AccessAccountabilityCompositionModule,
    CompanyModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
