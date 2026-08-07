import { Injectable } from '@nestjs/common';

export interface HealthStatus {
  service: 'prisma-prim-api';
  status: 'ok';
}

@Injectable()
export class AppService {
  getHealth(): HealthStatus {
    return {
      service: 'prisma-prim-api',
      status: 'ok',
    };
  }
}
