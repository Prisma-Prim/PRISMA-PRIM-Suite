import { Module } from '@nestjs/common';
import { AccessModule } from '../access/access.module.js';
import { AccountabilityModule } from '../accountability/accountability.module.js';
import { DatabaseModule } from '../database/database.module.js';
import { CompanyService } from './company.service.js';

@Module({
  imports: [AccessModule, AccountabilityModule, DatabaseModule],
  providers: [CompanyService],
  exports: [CompanyService],
})
export class CompanyModule {}
