import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DatabaseModule } from '../database/database.module.js';
import { AccountabilityModule } from '../accountability/accountability.module.js';
import { AccessController } from './access.controller.js';
import { AccessService } from './access.service.js';
import { ExternalPrincipalAdapter } from './external-principal.adapter.js';
import {
  ACCESS_ADMISSION,
  configuredAccessAdmission,
} from './access-admission.js';

@Module({
  imports: [DatabaseModule, AccountabilityModule],
  controllers: [AccessController],
  providers: [
    AccessService,
    ExternalPrincipalAdapter,
    {
      provide: ACCESS_ADMISSION,
      inject: [ConfigService],
      useFactory: (configuration: ConfigService) =>
        configuredAccessAdmission({
          ACCESS_BOOTSTRAP_EXTERNAL_PROVIDER: configuration.get(
            'ACCESS_BOOTSTRAP_EXTERNAL_PROVIDER',
          ),
          ACCESS_BOOTSTRAP_EXTERNAL_SUBJECT: configuration.get(
            'ACCESS_BOOTSTRAP_EXTERNAL_SUBJECT',
          ),
          ACCESS_BOOTSTRAP_WORKSPACE_KEY: configuration.get(
            'ACCESS_BOOTSTRAP_WORKSPACE_KEY',
          ),
          ACCESS_BOOTSTRAP_WORKSPACE_NAME: configuration.get(
            'ACCESS_BOOTSTRAP_WORKSPACE_NAME',
          ),
          ACCESS_ACCEPTED_INVITATIONS_JSON: configuration.get(
            'ACCESS_ACCEPTED_INVITATIONS_JSON',
          ),
        }),
    },
  ],
  exports: [AccessService],
})
export class AccessModule {}
