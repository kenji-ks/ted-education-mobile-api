export type HttpRequestLog = {
  level: 'info' | 'warn' | 'error';
  event: 'http_request_completed' | 'http_request_aborted';
  requestId: string;
  method: string;
  path: string;
  statusCode: number;
  durationMs: number;
};
