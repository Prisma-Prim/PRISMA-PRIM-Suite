import { Module } from '@nestjs/common';
import { AccountabilityModule } from '../accountability/accountability.module.js';
import { DatabaseModule } from '../database/database.module.js';
import { CompanyService } from './company.service.js';
import { PostgresActiveCompanyContextLookup } from './postgres-active-company-context.lookup.js';

@Module({
  imports: [AccountabilityModule, DatabaseModule],
  providers: [CompanyService, PostgresActiveCompanyContextLookup],
  exports: [CompanyService, PostgresActiveCompanyContextLookup],
})
export class CompanyModule {}
