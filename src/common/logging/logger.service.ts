import { Injectable } from '@nestjs/common';

import type { HttpRequestLog } from './logging.types';

@Injectable()
export class AppLoggerService {
  logHttpRequest(entry: HttpRequestLog): void {
    process.stdout.write(`${JSON.stringify(entry)}\n`);
  }
}
