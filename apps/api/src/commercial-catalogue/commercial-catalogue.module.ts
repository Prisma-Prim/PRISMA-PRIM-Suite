import { Module } from '@nestjs/common';
import { AccessModule } from '../access/access.module.js';
import { DatabaseModule } from '../database/database.module.js';
import { CommercialCatalogueService } from './commercial-catalogue.service.js';

@Module({
  imports: [AccessModule, DatabaseModule],
  providers: [CommercialCatalogueService],
  exports: [CommercialCatalogueService],
})
export class CommercialCatalogueModule {}
