/**
 * ============================================
 * PAYMENT CONTROLLER
 * ============================================
 *
 * Handles Paystack and Stripe payment endpoints.
 * Validates requests, delegates to PaymentService,
 * and queues post-payment background jobs.
 *
 * @file src/controllers/payment.controller.ts
 */

import { Request, Response, NextFunction } from 'express';
import { PaymentService } from '@services/payment.service.js';
import { Order } from '@models/Order.js';
import {
  InitializePaymentSchema,
  VerifyPaymentSchema,
} from '@validators/payment.validator.js';
import { addGeneratePDFReceiptJob } from '../queues/receipt.queue.js';
import { addPaymentNotification } from '../queues/notification.queue.js';
import {
  BadRequestError,
  NotFoundError,
} from '@utils/errors.js';

// ============================================
// PAYSTACK
// ============================================

/**
 * POST /api/v1/payments/paystack/initialize
 * Initialize a Paystack payment for an order.
 */
export async function initializePaystackPayment(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const validated = InitializePaymentSchema.parse(req.body);

    if (validated.paymentMethod !== 'paystack') {
      throw new BadRequestError('Use paymentMethod: "paystack" for this endpoint');
    }

    const order = await Order.findById(validated.orderId);
    if (!order) {
      throw new NotFoundError('Order');
    }

    if (order.paymentStatus === 'paid') {
      throw new BadRequestError('Order has already been paid');
    }

    const result = await PaymentService.initializePaystackPayment({
      orderId: validated.orderId,
      email: validated.email,
      amount: validated.amount,
      reference: validated.reference,
      callbackUrl: validated.callbackUrl,
    });

    // Store reference on order
    order.paymentReference = result.reference;
    order.paymentMethod = 'paystack';
    await order.save();

    res.status(200).json({
      success: true,
      message: 'Paystack payment initialized',
      data: {
        authorizationUrl: result.authorizationUrl,
        accessCode: result.accessCode,
        reference: result.reference,
      },
    });
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/v1/payments/paystack/verify?reference=xxx
 * Verify a Paystack payment and update order status.
 */
export async function verifyPaystackPayment(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { reference } = VerifyPaymentSchema.parse(req.query);

    const result = await PaymentService.verifyPaystackPayment(reference);

    if (result.status === 'success') {
      const order = await Order.findOne({ paymentReference: reference });

      if (order && order.paymentStatus !== 'paid') {
        order.paymentStatus = 'paid';
        if (order.status === 'pending') {
          order.status = 'confirmed';
        }
        await order.save();

        // Queue receipt and notification
        await Promise.all([
          addGeneratePDFReceiptJob({
            orderId: String(order._id),
            orderNumber: order.orderNumber,
            userEmail: '', // populated from user record
            sendEmail: true,
          }),
          addPaymentNotification({
            type: 'payment-confirmation',
            orderId: String(order._id),
            orderNumber: order.orderNumber,
            userId: String(order.userId),
            userEmail: '',
            amount: order.total,
            currency: order.currency,
            paymentMethod: 'paystack',
          }),
        ]);
      }
    }

    res.status(200).json({
      success: true,
      message: 'Payment verified',
      data: {
        status: result.status,
        reference: result.reference,
        amount: result.amount,
        currency: result.currency,
        paidAt: result.paidAt,
      },
    });
  } catch (error) {
    next(error);
  }
}

/**
 * POST /api/v1/payments/webhook/paystack
 * Handle Paystack webhook events.
 * Note: Raw body required — no JSON middleware on this route.
 */
export async function handlePaystackWebhook(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const signature = req.headers['x-paystack-signature'] as string;

    if (!signature) {
      throw new BadRequestError('Missing Paystack webhook signature');
    }

    await PaymentService.handlePaystackWebhook(req.body, signature);

    res.status(200).json({ success: true, message: 'Webhook received' });
  } catch (error) {
    next(error);
  }
}

// ============================================
// STRIPE
// ============================================

/**
 * POST /api/v1/payments/stripe/intent
 * Create a Stripe PaymentIntent for USD payments.
 */
export async function createStripePaymentIntent(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const validated = InitializePaymentSchema.parse(req.body);

    if (validated.paymentMethod !== 'stripe') {
      throw new BadRequestError('Use paymentMethod: "stripe" for this endpoint');
    }

    const order = await Order.findById(validated.orderId);
    if (!order) {
      throw new NotFoundError('Order');
    }

    if (order.paymentStatus === 'paid') {
      throw new BadRequestError('Order has already been paid');
    }

    // Stripe amount is in cents
    const amountInCents = Math.round(validated.amount * 100);

    const result = await PaymentService.createStripePaymentIntent({
      orderId: validated.orderId,
      email: validated.email,
      amount: amountInCents,
      currency: validated.currency?.toLowerCase() || 'usd',
    });

    // Update order payment method
    order.paymentMethod = 'stripe';
    order.currency = 'USD';
    await order.save();

    res.status(200).json({
      success: true,
      message: 'Stripe PaymentIntent created',
      data: {
        clientSecret: result.clientSecret,
        paymentIntentId: result.paymentIntentId,
        amount: result.amount,
        currency: result.currency,
      },
    });
  } catch (error) {
    next(error);
  }
}

/**
 * POST /api/v1/payments/webhook/stripe
 * Handle Stripe webhook events.
 * Note: Raw body buffer required for signature verification.
 */
export async function handleStripeWebhook(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const signature = req.headers['stripe-signature'] as string;

    if (!signature) {
      throw new BadRequestError('Missing Stripe webhook signature');
    }

    // req.body must be raw Buffer here (set in routes with express.raw())
    const stripeEvent = PaymentService.verifyStripeWebhookSignature(req.body, signature);

    await PaymentService.handleStripeWebhook({
      type: stripeEvent.type,
      data: { object: stripeEvent.data.object as unknown as Record<string, unknown> },
    });

    res.status(200).json({ success: true, message: 'Webhook received' });
  } catch (error) {
    next(error);
  }
}
