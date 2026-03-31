/**
 * ============================================
 * ORDER SERVICE
 * ============================================
 *
 * Business logic for order lifecycle:
 * - Order creation with stock validation
 * - Status transitions with tracking history
 * - Cancellation with stock restock
 * - Admin and user order queries
 *
 * @file src/services/order.service.ts
 */

import { Order, IOrder, OrderStatus } from '@models/Order.js';
import { Product } from '@models/Product.js';
import { ProductService } from '@services/product.service.js';
import { CouponService } from '@services/coupon.service.js';
import {
  NotFoundError,
  BadRequestError,
  ForbiddenError,
} from '@utils/errors.js';
import type { PaginationMeta } from '@utils/response.js';
import { getIO } from '@config/socket.js';
import mongoose from 'mongoose';

// ============================================
// TYPES
// ============================================

export interface CreateOrderItem {
  productId: string;
  variantSku: string;
  quantity: number;
  priceAtPurchase?: number;
  currency?: 'NGN' | 'USD';
}

export interface CreateOrderData {
  items: CreateOrderItem[];
  shippingAddress: {
    recipientName: string;
    phone: string;
    street: string;
    city: string;
    state: string;
    country?: string;
    postalCode?: string;
    coordinates?: { lat: number; lng: number };
  };
  deliveryType?: 'same_day' | 'next_day' | 'standard';
  paymentMethod: 'paystack' | 'stripe' | 'bank_transfer';
  currency?: 'NGN' | 'USD';
  couponCode?: string;
  customerNotes?: string;
}

export interface OrderListResult {
  orders: IOrder[];
  pagination: PaginationMeta;
}

export interface AdminOrderQuery {
  page?: number;
  limit?: number;
  status?: OrderStatus;
  paymentStatus?: string;
  startDate?: Date;
  endDate?: Date;
  search?: string;
  sort?: string;
}

// ============================================
// DELIVERY FEE CALCULATOR
// ============================================

const DELIVERY_FEES: Record<string, number> = {
  same_day: 5000,
  next_day: 2500,
  standard: 1500,
};

// ============================================
// ORDER SERVICE
// ============================================

export class OrderService {
  /**
   * Create a new order:
   * 1. Resolve product prices from DB (never trust client prices)
   * 2. Validate stock
   * 3. Deduct stock atomically
   * 4. Persist order
   */
  static async createOrder(
    userId: string,
    data: CreateOrderData
  ): Promise<IOrder> {
    const currency = data.currency ?? 'NGN';

    // 1. Resolve products & build order items
    const resolvedItems = await Promise.all(
      data.items.map(async (item) => {
        const product = await Product.findOne({
          _id: item.productId,
          isActive: true,
        });

        if (!product) {
          throw new NotFoundError(`Product ${item.productId}`, 'RES_002');
        }

        const variant = product.variants.find((v) => v.sku === item.variantSku);
        if (!variant) {
          throw new BadRequestError(
            `Variant ${item.variantSku} not found`,
            'RES_002'
          );
        }

        if (!variant.isAvailable || variant.stock < item.quantity) {
          throw new BadRequestError(
            `Insufficient stock for ${variant.sku}: available ${variant.stock}`,
            'BIZ_002'
          );
        }

        const unitPrice =
          currency === 'NGN' ? variant.priceNGN : variant.priceUSD;

        return {
          productId: new mongoose.Types.ObjectId(item.productId),
          productName: product.name,
          variantSku: variant.sku,
          variantSize: variant.size,
          quantity: item.quantity,
          unitPrice,
          costPrice: variant.costPrice,
          discount: 0,
          total: unitPrice * item.quantity,
          image: product.images.thumbnail,
        };
      })
    );

    // 2. Calculate totals
    const subtotal = resolvedItems.reduce((sum, i) => sum + i.total, 0);
    const deliveryFee = DELIVERY_FEES[data.deliveryType ?? 'standard'] ?? 1500;

    // 2b. Apply coupon if provided
    let discount = 0;
    if (data.couponCode) {
      const couponResult = await CouponService.validateCoupon(
        data.couponCode,
        userId,
        subtotal
      );
      discount = couponResult.discountAmount;
    }

    const total = Math.max(0, subtotal - discount + deliveryFee);

    // 3. Deduct stock
    await ProductService.deductStock(
      resolvedItems.map((i) => ({
        productId: i.productId.toString(),
        variantSku: i.variantSku,
        quantity: i.quantity,
      }))
    );

    // 4. Create order
    const order = await Order.create({
      userId: new mongoose.Types.ObjectId(userId),
      items: resolvedItems,
      subtotal,
      discount,
      deliveryFee,
      total,
      currency,
      paymentMethod: data.paymentMethod,
      shippingAddress: {
        ...data.shippingAddress,
        country: data.shippingAddress.country ?? 'Nigeria',
      },
      deliveryType: data.deliveryType ?? 'standard',
      notes: data.customerNotes,
      ...(data.couponCode && { discountCode: data.couponCode }),
    });

    // 5. Mark coupon as used (fire-and-forget after order persisted)
    if (data.couponCode) {
      CouponService.applyCoupon(data.couponCode, userId, order._id.toString()).catch(
        (err: Error) => console.error('[CouponService] Failed to record usage:', err)
      );
    }

    // 6. Emit new-order event to admin dashboard
    getIO()?.to('admin-dashboard').emit('new-order', {
      orderId: order._id.toString(),
      orderNumber: order.orderNumber,
      total: order.total,
      currency: order.currency,
      paymentMethod: order.paymentMethod,
      itemCount: order.items.length,
      createdAt: order.createdAt,
    });

    return order;
  }

  /**
   * Get orders for a specific user (paginated)
   */
  static async getUserOrders(
    userId: string,
    options: { page?: number; limit?: number; status?: string } = {}
  ): Promise<OrderListResult> {
    const { page = 1, limit = 20, status } = options;
    const skip = (page - 1) * limit;

    const query: Record<string, unknown> = {
      userId: new mongoose.Types.ObjectId(userId),
    };
    if (status) query.status = status;

    const [orders, total] = await Promise.all([
      Order.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      Order.countDocuments(query),
    ]);

    const totalPages = Math.ceil(total / limit);

    return {
      orders: orders as unknown as IOrder[],
      pagination: {
        page,
        limit,
        total,
        totalPages,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1,
      },
    };
  }

  /**
   * Get single order by order number.
   * If userId is provided, verifies ownership (non-admin access).
   */
  static async getOrderByNumber(
    orderNumber: string,
    userId?: string
  ): Promise<IOrder> {
    const order = await Order.findOne({ orderNumber });

    if (!order) {
      throw new NotFoundError('Order', 'RES_003');
    }

    if (userId && order.userId.toString() !== userId) {
      throw new ForbiddenError('Access denied to this order');
    }

    return order;
  }

  /**
   * Update order status (admin operation)
   */
  static async updateOrderStatus(
    orderNumber: string,
    status: OrderStatus,
    notes?: string,
    adminId?: string
  ): Promise<IOrder> {
    const order = await Order.findOne({ orderNumber });

    if (!order) {
      throw new NotFoundError('Order', 'RES_003');
    }

    // Validate status transition
    OrderService.validateStatusTransition(order.status, status);

    order.status = status;
    if (notes) order.adminNotes = notes;

    // Record in tracking history (handled by pre-save hook)
    if (adminId) {
      order.trackingHistory.push({
        status,
        timestamp: new Date(),
        note: notes,
        updatedBy: new mongoose.Types.ObjectId(adminId),
      });
    }

    // If delivered, record actual delivery
    if (status === 'delivered') {
      order.actualDelivery = new Date();
    }

    await order.save();

    // Emit status change to admin dashboard and per-order room
    const io = getIO();
    if (io) {
      const payload = {
        orderId: order._id.toString(),
        orderNumber: order.orderNumber,
        previousStatus: order.trackingHistory.at(-2)?.status ?? 'unknown',
        newStatus: status,
        updatedAt: new Date(),
      };
      io.to('admin-dashboard').emit('order-status-change', payload);
      io.to(`order:${order.orderNumber}`).emit('order-status-change', payload);
    }

    return order;
  }

  /**
   * Cancel an order and restock items
   */
  static async cancelOrder(
    orderNumber: string,
    userId: string,
    reason: string,
    isAdmin = false
  ): Promise<IOrder> {
    const order = await Order.findOne({ orderNumber });

    if (!order) {
      throw new NotFoundError('Order', 'RES_003');
    }

    // Only owner or admin can cancel
    if (!isAdmin && order.userId.toString() !== userId) {
      throw new ForbiddenError('Access denied');
    }

    // Can only cancel pending/confirmed orders (customer), or any non-delivered (admin)
    const cancellableStatuses: OrderStatus[] = isAdmin
      ? ['pending', 'confirmed', 'processing', 'shipped']
      : ['pending', 'confirmed'];

    if (!cancellableStatuses.includes(order.status)) {
      throw new BadRequestError(
        `Cannot cancel order with status: ${order.status}`
      );
    }

    order.status = 'cancelled';
    order.notes = reason;
    await order.save();

    // Restock items (fire-and-forget — non-critical path)
    ProductService.restockItems(
      order.items.map((item) => ({
        productId: item.productId.toString(),
        variantSku: item.variantSku,
        quantity: item.quantity,
      })),
      order._id.toString()
    ).catch((err) => {
      console.error('Restock failed after cancellation:', err);
    });

    // Emit cancellation to admin dashboard
    getIO()?.to('admin-dashboard').emit('order-cancelled', {
      orderId: order._id.toString(),
      orderNumber: order.orderNumber,
      reason,
      cancelledAt: new Date(),
    });

    return order;
  }

  /**
   * Admin: Get all orders with filters
   */
  static async getAdminOrders(query: AdminOrderQuery = {}): Promise<OrderListResult> {
    const {
      page = 1,
      limit = 20,
      status,
      paymentStatus,
      startDate,
      endDate,
      search,
      sort = '-createdAt',
    } = query;

    const skip = (page - 1) * limit;
    const filter: Record<string, unknown> = {};

    if (status) filter.status = status;
    if (paymentStatus) filter.paymentStatus = paymentStatus;
    if (startDate || endDate) {
      const dateFilter: Record<string, Date> = {};
      if (startDate) dateFilter.$gte = startDate;
      if (endDate) dateFilter.$lte = endDate;
      filter.createdAt = dateFilter;
    }
    if (search) {
      filter.orderNumber = { $regex: search, $options: 'i' };
    }

    const sortObj: Record<string, 1 | -1> =
      sort.startsWith('-')
        ? { [sort.slice(1)]: -1 }
        : { [sort]: 1 };

    const [orders, total] = await Promise.all([
      Order.find(filter).sort(sortObj).skip(skip).limit(limit).lean(),
      Order.countDocuments(filter),
    ]);

    const totalPages = Math.ceil(total / limit);

    return {
      orders: orders as unknown as IOrder[],
      pagination: {
        page,
        limit,
        total,
        totalPages,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1,
      },
    };
  }

  /**
   * Validate allowed status transitions
   */
  private static validateStatusTransition(
    current: OrderStatus,
    next: OrderStatus
  ): void {
    const transitions: Record<OrderStatus, OrderStatus[]> = {
      pending: ['confirmed', 'cancelled'],
      confirmed: ['processing', 'cancelled'],
      processing: ['shipped', 'cancelled'],
      shipped: ['out_for_delivery', 'delivered'],
      out_for_delivery: ['delivered'],
      delivered: ['refunded'],
      cancelled: [],
      refunded: ['returned'],
      returned: [],
    };

    const allowed = transitions[current] ?? [];
    if (!allowed.includes(next)) {
      throw new BadRequestError(
        `Invalid status transition: ${current} → ${next}. Allowed: ${allowed.join(', ') || 'none'}`
      );
    }
  }
}

export default OrderService;
