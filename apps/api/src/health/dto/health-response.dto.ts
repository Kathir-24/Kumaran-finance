import { ApiProperty } from '@nestjs/swagger';

export class HealthCheckResponseDto {
  @ApiProperty({ example: 'ok', description: 'System health status' })
  status: string;

  @ApiProperty({ example: 'chitflow-api', description: 'Service identifier' })
  service: string;

  @ApiProperty({ example: 'connected', description: 'Database connectivity status', required: false })
  database?: string;

  @ApiProperty({ example: 'connected', description: 'Redis connectivity status', required: false })
  redis?: string;

  @ApiProperty({ example: false, description: 'Whether Sentry APM is active' })
  sentryActive: boolean;

  @ApiProperty({ example: '2026-10-22T07:28:14.000Z', description: 'Server timestamp' })
  time: string;
}

export class LivenessResponseDto {
  @ApiProperty({ example: 'alive', description: 'Process liveness status' })
  status: string;

  @ApiProperty({ example: 'chitflow-api', description: 'Service identifier' })
  service: string;

  @ApiProperty({ example: '2026-10-22T07:28:14.000Z', description: 'Server timestamp' })
  time: string;
}

