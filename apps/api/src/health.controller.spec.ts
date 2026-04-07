import { Test } from '@nestjs/testing';
import { describe, expect, it } from '@jest/globals';

import { HealthController } from './health.controller';
import { HealthService } from './health.service';

describe('HealthController', () => {
  it('returns a stable health payload', async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [HealthService],
    }).compile();

    const controller = moduleRef.get(HealthController);

    expect(controller.getStatus()).toEqual({
      status: 'ok',
      service: 'api',
    });
  });
});
