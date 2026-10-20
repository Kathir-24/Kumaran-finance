import { Test } from '@nestjs/testing';
import { HealthController } from './health.controller';

describe('HealthController', () => {
  let controller: HealthController;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [HealthController],
    }).compile();
    controller = moduleRef.get(HealthController);
  });

  it('reports status ok', () => {
    const result = controller.check();
    expect(result.status).toBe('ok');
    expect(result.service).toBe('chitflow-api');
    expect(typeof result.sentryActive).toBe('boolean');
  });

  it('returns a valid time', () => {
    const result = controller.check();
    expect(Number.isNaN(Date.parse(result.time))).toBe(false);
  });

  it('triggers sentry test error on demand', () => {
    expect(() => controller.triggerSentryTest()).toThrow(
      'Sentry Verification Diagnostic Test Error',
    );
  });
});
