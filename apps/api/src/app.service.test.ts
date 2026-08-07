import { describe, expect, it } from 'vitest';
import { AppService } from './app.service.js';

describe('AppService', () => {
  it('reports that the API is healthy', () => {
    const service = new AppService();

    expect(service.getHealth()).toEqual({
      service: 'prisma-prim-api',
      status: 'ok',
    });
  });
});
