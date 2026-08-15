import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module.js';
import { AccountabilityModule } from '../accountability/accountability.module.js';
import { AccessController } from './access.controller.js';
import { AccessService } from './access.service.js';
import { ExternalPrincipalAdapter } from './external-principal.adapter.js';

@Module({
  imports: [DatabaseModule, AccountabilityModule],
  controllers: [AccessController],
  providers: [AccessService, ExternalPrincipalAdapter],
  exports: [AccessService],
})
export class AccessModule {}
