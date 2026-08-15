import { Module } from '@nestjs/common';
import { AccessModule } from '../access/access.module.js';
import { ExternalPrincipalAdapter } from '../access/external-principal.adapter.js';
import { AccountabilityModule } from '../accountability/accountability.module.js';
import { DatabaseModule } from '../database/database.module.js';
import { CompanyController } from './company.controller.js';
import { CompanyService } from './company.service.js';

@Module({
  imports: [AccessModule, AccountabilityModule, DatabaseModule],
  controllers: [CompanyController],
  providers: [CompanyService, ExternalPrincipalAdapter],
  exports: [CompanyService],
})
export class CompanyModule {}
