import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module.js';
import { AccountabilityService } from './accountability.service.js';
import { ClientUnionAccountabilityService } from './client-union-accountability.service.js';

@Module({
  imports: [DatabaseModule],
  providers: [AccountabilityService, ClientUnionAccountabilityService],
  exports: [AccountabilityService, ClientUnionAccountabilityService],
})
export class AccountabilityModule {}
