import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { DATABASE } from './database.constants.js';
import { DatabaseContext } from './database-context.js';

@Module({
  providers: [
    {
      provide: DATABASE,
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const connectionString = configService.get<string>('DATABASE_URL');

        if (!connectionString) {
          throw new Error('DATABASE_URL is required to start the API.');
        }

        const pool = new Pool({ connectionString });
        return drizzle({ client: pool });
      },
    },
    DatabaseContext,
  ],
  exports: [DATABASE, DatabaseContext],
})
export class DatabaseModule {}
