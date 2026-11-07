import { Module } from '@nestjs/common';
import { AccessModule } from '../access/access.module.js';
import { AccountabilityModule } from '../accountability/accountability.module.js';
import { ServerClockModule } from '../clock/server-clock.js';
import { DatabaseModule } from '../database/database.module.js';
import { ProjectModule } from '../project/project.module.js';
import { CertificationService } from './certification.service.js';

@Module({
  imports: [
    AccessModule,
    AccountabilityModule,
    DatabaseModule,
    ProjectModule,
    ServerClockModule,
  ],
  providers: [CertificationService],
  exports: [CertificationService],
})
export class CertificationModule {}
