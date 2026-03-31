/**
 * Delivery Service — Performance Tests
 *
 * @file src/services/__tests__/delivery.service.perf.test.ts
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import axios from 'axios';
import { DeliveryService } from '../delivery.service.js';
import { measureTime, expectPerformance } from '../../test/helpers.js';

vi.mock('axios');

const mockedAxios = vi.mocked(axios);

const ORIGIN = { lat: 6.5244, lng: 3.3792 };
const DESTINATION = { lat: 6.4541, lng: 3.3947 };

function todayAt(hour: number): Date {
  const d = new Date();
  d.setHours(hour, 0, 0, 0);
  return d;
}

describe('DeliveryService Performance', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.MAPBOX_ACCESS_TOKEN = 'pk.test';

    mockedAxios.get = vi.fn().mockResolvedValue({
      data: { routes: [{ duration: 3600, distance: 15_000 }] },
    });
  });

  it('should calculate ETA within 200ms (mocked Mapbox)', async () => {
    const { duration } = await measureTime(() =>
      DeliveryService.calculateETA({
        origin: ORIGIN,
        destination: DESTINATION,
        orderTime: todayAt(10),
      })
    );

    expect(duration).toBeLessThan(200);
  });

  it('should handle 100 concurrent ETA calculations', async () => {
    const { duration } = await measureTime(async () => {
      await Promise.all(
        Array.from({ length: 100 }, () =>
          DeliveryService.calculateETA({
            origin: ORIGIN,
            destination: DESTINATION,
            orderTime: todayAt(10),
          })
        )
      );
    });

    expect(duration).toBeLessThan(1000);
  });

  it('should calculate delivery fee within 1ms', async () => {
    await expectPerformance(
      () =>
        DeliveryService.calculateDeliveryFee({
          distance: 15_000,
          deliveryType: 'standard',
        }),
      1,
      1000
    );
  });

  it('should validate service area within 1ms', async () => {
    await expectPerformance(
      () => Promise.resolve(DeliveryService.isWithinServiceArea({ state: 'Lagos', city: 'Ikeja' })),
      1,
      5000
    );
  });
});
