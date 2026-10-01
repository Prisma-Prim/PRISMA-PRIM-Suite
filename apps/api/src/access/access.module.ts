import { TaskAccessService } from './task-access.service.js';
import { ProjectResponsibleAccessService } from './project-responsible-access.service.js';
import { CommercialResponsibleAccessService } from './commercial-responsible-access.service.js';
import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DatabaseModule } from '../database/database.module.js';
import {
  ACCESS_ADMISSION,
  configuredAccessAdmission,
} from './access-admission.js';
import { CompanyContextAuthorization } from './company-context-authorization.js';

@Module({
  imports: [DatabaseModule],
  providers: [
    TaskAccessService,
    ProjectResponsibleAccessService,
    CommercialResponsibleAccessService,
    CompanyContextAuthorization,
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
          ACCESS_BOOTSTRAP_WORKSPACE_ID: configuration.get(
            'ACCESS_BOOTSTRAP_WORKSPACE_ID',
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
  exports: [
    ACCESS_ADMISSION,
    CompanyContextAuthorization,
    TaskAccessService,
    ProjectResponsibleAccessService,
    CommercialResponsibleAccessService,
  ],
})
export class AccessModule {}
