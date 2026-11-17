import { Module } from '@nestjs/common';
import { AccessModule } from '../access/access.module.js';
import { DatabaseModule } from '../database/database.module.js';
import { DossierAnalysisModule } from '../dossier-analysis/dossier-analysis.module.js';
import { ChatGptPlanClient, PLAN_HTTP } from './provider.js';
import { DossierHarnessConnectionService } from './connection.service.js';
import { DossierHarnessJobService } from './job.service.js';

@Module({
  imports: [AccessModule, DatabaseModule, DossierAnalysisModule],
  providers: [
    { provide: PLAN_HTTP, useValue: fetch },
    {
      provide: ChatGptPlanClient,
      useFactory: (transport: typeof fetch) => new ChatGptPlanClient(transport),
      inject: [PLAN_HTTP],
    },
    DossierHarnessConnectionService,
    DossierHarnessJobService,
  ],
  exports: [DossierHarnessConnectionService, DossierHarnessJobService],
})
export class DossierHarnessModule {}
