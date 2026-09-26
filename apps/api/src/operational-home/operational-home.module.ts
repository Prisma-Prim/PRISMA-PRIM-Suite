import { Module } from '@nestjs/common';
import { ClientModule } from '../client/client.module.js';
import { ServerClockModule } from '../clock/server-clock.js';
import { DatabaseModule } from '../database/database.module.js';
import { ProjectModule } from '../project/project.module.js';
import { TaskModule } from '../task/task.module.js';
import { OperationalHomeService } from './operational-home.service.js';

// Exports only the service its composed REST controller consumes.
@Module({
  imports: [
    ClientModule,
    DatabaseModule,
    ProjectModule,
    ServerClockModule,
    TaskModule,
  ],
  providers: [OperationalHomeService],
  exports: [OperationalHomeService],
})
export class OperationalHomeModule {}
