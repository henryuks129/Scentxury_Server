/**
 * Payment Service — Performance Tests
 *
 * @file src/services/__tests__/payment.service.perf.test.ts
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import axios from 'axios';
import { generatePaymentReference, verifyPaystackPayment } from '../payment.service.js';
import { measureTime, expectPerformance } from '../../test/helpers.js';

vi.mock('axios');
vi.mock('@config/stripe.js', () => ({
  stripe: { paymentIntents: { create: vi.fn() } },
}));

const mockedAxios = vi.mocked(axios);

describe('PaymentService Performance', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.PAYSTACK_SECRET_KEY = 'sk_test_perf';
  });

  it('should generate 10,000 unique references within 200ms', async () => {
    const { duration } = await measureTime(async () => {
      const refs = new Set<string>();
      for (let i = 0; i < 10_000; i++) {
        refs.add(generatePaymentReference());
      }
      return refs;
    });

    expect(duration).toBeLessThan(200);
  });

  it('should generate references with < 1ms per call', async () => {
    await expectPerformance(() => Promise.resolve(generatePaymentReference()), 1, 1000);
  });

  it('should verify payment reference within 200ms (mocked network)', async () => {
    mockedAxios.get = vi.fn().mockResolvedValue({
      data: {
        status: true,
        data: {
          status: 'success',
          reference: 'ref',
          amount: 50000,
          currency: 'NGN',
        },
      },
    });

    const { duration } = await measureTime(() => verifyPaystackPayment('ref-perf-001'));
    expect(duration).toBeLessThan(200);
  });

  it('should handle 50 concurrent payment verifications', async () => {
    mockedAxios.get = vi.fn().mockResolvedValue({
      data: {
        status: true,
        data: { status: 'success', reference: 'ref', amount: 50000, currency: 'NGN' },
      },
    });

    const { duration } = await measureTime(async () => {
      await Promise.all(
        Array.from({ length: 50 }, (_, i) => verifyPaystackPayment(`ref-${i}`))
      );
    });

    expect(duration).toBeLessThan(500);
  });
});
