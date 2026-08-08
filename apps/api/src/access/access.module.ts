import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module.js';
import { AccessController } from './access.controller.js';
import { AccessService } from './access.service.js';
import { ExternalPrincipalAdapter } from './external-principal.adapter.js';

@Module({
  imports: [DatabaseModule],
  controllers: [AccessController],
  providers: [AccessService, ExternalPrincipalAdapter],
})
export class AccessModule {}
