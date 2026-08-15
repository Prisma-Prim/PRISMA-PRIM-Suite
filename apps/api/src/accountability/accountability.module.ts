import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module.js';
import { AccountabilityService } from './accountability.service.js';

@Module({
  imports: [DatabaseModule],
  providers: [AccountabilityService],
  exports: [AccountabilityService],
})
export class AccountabilityModule {}
