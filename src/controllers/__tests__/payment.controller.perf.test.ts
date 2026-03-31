/**
 * Payment Controller — Performance Tests
 *
 * @file src/controllers/__tests__/payment.controller.perf.test.ts
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { app } from '../../app.js';
import { PaymentService } from '@services/payment.service.js';
import { Order } from '@models/Order.js';
import { measureTime } from '../../test/helpers.js';

vi.mock('@services/payment.service.js');
vi.mock('@models/Order.js');
vi.mock('@models/User.js');
vi.mock('../../queues/receipt.queue.js', () => ({
  addGeneratePDFReceiptJob: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('../../queues/notification.queue.js', () => ({
  addPaymentNotification: vi.fn().mockResolvedValue(undefined),
}));

describe('PaymentController Performance', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('POST /payments/webhook/paystack should respond within 200ms', async () => {
    vi.mocked(PaymentService.handlePaystackWebhook).mockResolvedValue(undefined);

    // Warm up: first supertest request incurs cold-start overhead (route compilation,
    // middleware init) that is not representative of steady-state latency.
    await request(app)
      .post('/api/v1/payments/webhook/paystack')
      .set('x-paystack-signature', 'test-sig')
      .send({ event: 'charge.success', data: { reference: 'ref' } });

    const { duration } = await measureTime(async () => {
      await request(app)
        .post('/api/v1/payments/webhook/paystack')
        .set('x-paystack-signature', 'test-sig')
        .send({ event: 'charge.success', data: { reference: 'ref' } });
    });

    expect(duration).toBeLessThan(200);
  });

  it('should handle 20 concurrent webhook requests within 1s', async () => {
    vi.mocked(PaymentService.handlePaystackWebhook).mockResolvedValue(undefined);

    const { duration } = await measureTime(async () => {
      await Promise.all(
        Array.from({ length: 20 }, () =>
          request(app)
            .post('/api/v1/payments/webhook/paystack')
            .set('x-paystack-signature', 'test-sig')
            .send({ event: 'charge.success', data: { reference: 'ref' } })
        )
      );
    });

    expect(duration).toBeLessThan(1000);
  });
});
