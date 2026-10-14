import { Injectable } from '@nestjs/common';

import type { HealthStatus } from './health.types';

@Injectable()
export class HealthService {
  getHealth(): HealthStatus {
    return {
      status: 'ok',
      service: 'TED Education API',
      timestamp: new Date().toISOString(),
    };
  }
}