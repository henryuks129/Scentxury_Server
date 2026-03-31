/**
 * ============================================
 * INVENTORY SERVICE
 * ============================================
 *
 * Manages all stock operations with full audit trail.
 * - Deducts stock on confirmed payment
 * - Handles restock, manual adjustments, reservations
 * - Updates DailySummary after each sale
 * - Emits real-time Socket.io alerts for low/out-of-stock
 *
 * @file src/services/inventory.service.ts
 */

import { Product, IProduct, IVariant } from '@models/Product.js';
import { Order, IOrder } from '@models/Order.js';
import { InventoryTransaction } from '@models/InventoryTransaction.js';
import { DailySummary } from '@models/DailySummary.js';
import { redisClient } from '@config/redis.js';
import { dashboardEvents } from '@services/socket.service.js';
import { NotFoundError, BadRequestError } from '@utils/errors.js';

// ============================================
// TYPES
// ============================================

export interface IRestockMeta {
  costPerUnit: number;
  supplierName?: string;
  batchNumber?: string;
}

export interface ILowStockProduct {
  product: IProduct;
  variant: IVariant;
  currentStock: number;
  threshold: number;
  daysUntilStockout: number;
}

// ============================================
// INVENTORY SERVICE
// ============================================

export class InventoryService {
  // ----------------------------------------
  // 6.4.1 Deduct Stock On Purchase
  // ----------------------------------------

  /**
   * Called by PaymentService after successful payment.
   * Atomically decrements stock for each order item.
   * Creates audit trail records and emits low/out-of-stock alerts.
   */
  static async deductStockOnPurchase(orderId: string): Promise<void> {
    const order = await Order.findById(orderId).lean<IOrder>();

    if (!order) throw new NotFoundError('Order');

    for (const item of order.items) {
      const { variantSku, quantity } = item;

      // Atomic update — decrement stock
      // Pass item.productId directly so Mongoose handles ObjectId casting
      const product = await Product.findOneAndUpdate(
        {
          _id: item.productId,
          'variants.sku': variantSku,
          'variants.stock': { $gte: quantity }, // prevent negative stock
        },
        {
          $inc: {
            'variants.$.stock': -quantity,
            'stats.purchaseCount': quantity,
          },
        },
        { new: true }
      ).lean<IProduct>();

      if (!product) {
        // Product not found or insufficient stock — log but continue
        console.warn(`[InventoryService] Could not deduct stock for SKU ${variantSku} — insufficient or not found`);
        continue;
      }

      const variant = product.variants?.find((v) => v.sku === variantSku);
      if (!variant) continue;

      const newStock = variant.stock;
      const oldStock = newStock + quantity;
      // Derive string form from the returned product (guaranteed valid ObjectId string)
      const productIdStr = String(product._id);

      // Mark unavailable when sold out
      if (newStock <= 0) {
        await Product.updateOne(
          { _id: product._id, 'variants.sku': variantSku },
          { $set: { 'variants.$.isAvailable': false } }
        );
      }

      // Audit trail
      await InventoryTransaction.create({
        productId: productIdStr,
        variantSku,
        transactionType: 'sale',
        quantityChanged: -quantity,
        beforeStock: oldStock,
        afterStock: Math.max(newStock, 0),
        orderId,
        reason: `Sale — Order #${order.orderNumber}`,
      });

      // Emit Socket.io alerts
      const threshold = variant.lowStockThreshold ?? 10;
      if (newStock <= 0) {
        dashboardEvents.outOfStockAlert({
          productId: productIdStr,
          productName: product.name,
          variantSku,
        });
      } else if (newStock <= threshold) {
        dashboardEvents.lowStockAlert({
          productId: productIdStr,
          productName: product.name,
          variantSku,
          variantSize: variant.size,
          currentStock: newStock,
        });
      }
    }

    // Update daily summary
    await InventoryService.updateDailySummaryForOrder(order);
  }

  // ----------------------------------------
  // Restock Variant
  // ----------------------------------------

  /**
   * Add stock to a variant. Recalculates weighted average cost price.
   */
  static async restockVariant(
    productId: string,
    variantSku: string,
    quantity: number,
    meta: IRestockMeta,
    adminId: string
  ): Promise<IVariant> {
    const product = await Product.findOne({
      _id: productId,
      'variants.sku': variantSku,
    });
    if (!product) throw new NotFoundError('Product or variant');

    const variant = product.variants.find((v) => v.sku === variantSku);
    if (!variant) throw new NotFoundError('Variant');

    const oldStock = variant.stock;
    const oldCost = variant.costPrice;

    // Weighted average cost: ((oldStock * oldCost) + (quantity * newCostPerUnit)) / (oldStock + quantity)
    const newAvgCost =
      oldStock + quantity > 0
        ? (oldStock * oldCost + quantity * meta.costPerUnit) / (oldStock + quantity)
        : meta.costPerUnit;

    // Increment stock and update cost
    await Product.updateOne(
      { _id: productId, 'variants.sku': variantSku },
      {
        $set: {
          'variants.$.costPrice': Math.round(newAvgCost * 100) / 100,
          'variants.$.isAvailable': true,
        },
        $inc: { 'variants.$.stock': quantity },
      }
    );

    const newStock = oldStock + quantity;

    // Audit trail
    await InventoryTransaction.create({
      productId,
      variantSku,
      transactionType: 'restock',
      quantityChanged: quantity,
      beforeStock: oldStock,
      afterStock: newStock,
      createdBy: adminId,
      reason: `Restock — supplier: ${meta.supplierName ?? 'unknown'}, batch: ${meta.batchNumber ?? 'N/A'}`,
    });

    return {
      _id: variant._id,
      sku: variant.sku,
      size: variant.size,
      priceNGN: variant.priceNGN,
      priceUSD: variant.priceUSD,
      costPrice: newAvgCost,
      stock: newStock,
      lowStockThreshold: variant.lowStockThreshold,
      isAvailable: true,
    } as IVariant;
  }

  // ----------------------------------------
  // Adjust Stock (Manual Admin)
  // ----------------------------------------

  /**
   * Set variant stock to an exact value.
   * Positive difference = add; negative = damage / write-off.
   */
  static async adjustStock(
    productId: string,
    variantSku: string,
    newStock: number,
    reason: string,
    adminId: string
  ): Promise<IVariant> {
    const product = await Product.findOne({
      _id: productId,
      'variants.sku': variantSku,
    });
    if (!product) throw new NotFoundError('Product or variant');

    const variant = product.variants.find((v) => v.sku === variantSku);
    if (!variant) throw new NotFoundError('Variant');

    const oldStock = variant.stock;
    const quantityChanged = newStock - oldStock;
    const txType = quantityChanged < 0 ? 'damaged' : 'adjustment';

    await Product.updateOne(
      { _id: productId, 'variants.sku': variantSku },
      {
        $set: {
          'variants.$.stock': newStock,
          'variants.$.isAvailable': newStock > 0,
        },
      }
    );

    await InventoryTransaction.create({
      productId,
      variantSku,
      transactionType: txType,
      quantityChanged,
      beforeStock: oldStock,
      afterStock: newStock,
      createdBy: adminId,
      reason,
    });

    return {
      _id: variant._id,
      sku: variant.sku,
      size: variant.size,
      priceNGN: variant.priceNGN,
      priceUSD: variant.priceUSD,
      costPrice: variant.costPrice,
      stock: newStock,
      lowStockThreshold: variant.lowStockThreshold,
      isAvailable: newStock > 0,
    } as IVariant;
  }

  // ----------------------------------------
  // Reserve Stock (Cart Hold)
  // ----------------------------------------

  /**
   * Reserve stock for a cart session (30 min TTL).
   * Fails if available stock would go negative.
   */
  static async reserveStock(
    productId: string,
    variantSku: string,
    quantity: number,
    sessionId: string
  ): Promise<void> {
    // Verify sufficient stock before reserving
    const product = await Product.findOne({
      _id: productId,
      'variants.sku': variantSku,
    }).lean<IProduct>();
    if (!product) throw new NotFoundError('Product or variant');

    const variant = product.variants?.find((v) => v.sku === variantSku);
    if (!variant) throw new NotFoundError('Variant');

    if (variant.stock < quantity) {
      throw new BadRequestError(`Insufficient stock for SKU ${variantSku}. Available: ${variant.stock}`);
    }

    // Atomically decrement available stock (reserve = soft-hold)
    await Product.updateOne(
      { _id: productId, 'variants.sku': variantSku },
      { $inc: { 'variants.$.stock': -quantity } }
    );

    // Set Redis reservation key with 30-min TTL
    const redisKey = `reserve:${productId}:${variantSku}:${sessionId}`;
    await redisClient.setex(redisKey, 1800, String(quantity));

    await InventoryTransaction.create({
      productId,
      variantSku,
      transactionType: 'reserved',
      quantityChanged: -quantity,
      beforeStock: variant.stock,
      afterStock: variant.stock - quantity,
      reason: `Cart reservation — session: ${sessionId}`,
    });
  }

  // ----------------------------------------
  // Release Reservation
  // ----------------------------------------

  /**
   * Release a cart reservation (cart expired or item removed).
   */
  static async releaseReservation(
    productId: string,
    variantSku: string,
    quantity: number,
    sessionId: string
  ): Promise<void> {
    // Return stock
    await Product.updateOne(
      { _id: productId, 'variants.sku': variantSku },
      { $inc: { 'variants.$.stock': quantity } }
    );

    // Delete Redis key
    const redisKey = `reserve:${productId}:${variantSku}:${sessionId}`;
    await redisClient.del(redisKey);

    const product = await Product.findOne({
      _id: productId,
      'variants.sku': variantSku,
    }).lean<IProduct>();

    const variant = product?.variants?.find((v) => v.sku === variantSku);

    await InventoryTransaction.create({
      productId,
      variantSku,
      transactionType: 'unreserved',
      quantityChanged: quantity,
      beforeStock: (variant?.stock ?? 0) - quantity,
      afterStock: variant?.stock ?? 0,
      reason: `Reservation released — session: ${sessionId}`,
    });
  }

  // ----------------------------------------
  // Update Daily Summary
  // ----------------------------------------

  /**
   * Increment today's DailySummary with the order's financials.
   * Called after every successful payment.
   */
  static async updateDailySummaryForOrder(order: IOrder): Promise<void> {
    const dateString = new Date().toISOString().split('T')[0]!; // e.g. "2026-03-25"
    const today = new Date(`${dateString}T00:00:00.000Z`);

    // Calculate cost of goods sold for this order
    const cogs = order.items.reduce(
      (sum, item) => sum + (item.costPrice ?? 0) * item.quantity,
      0
    );

    const unitsSoldBySize: Record<string, number> = { '20ml': 0, '50ml': 0, '100ml': 0, total: 0 };
    for (const item of order.items) {
      const sz = item.variantSize as '20ml' | '50ml' | '100ml';
      if (unitsSoldBySize[sz] !== undefined) unitsSoldBySize[sz] += item.quantity;
      unitsSoldBySize['total'] = (unitsSoldBySize['total'] ?? 0) + item.quantity;
    }

    // Payment method key mapping
    const pmKey = order.paymentMethod === 'bank_transfer'
      ? 'bankTransfer'
      : order.paymentMethod ?? 'paystack';

    // Upsert DailySummary
    const summary = await DailySummary.findOneAndUpdate(
      { dateString },
      {
        $setOnInsert: { date: today, dateString },
        $inc: {
          totalOrders: 1,
          grossRevenue: order.total,
          discountsGiven: order.discount ?? 0,
          deliveryFeesCollected: order.deliveryFee ?? 0,
          netRevenue: order.total - (order.discount ?? 0),
          costOfGoodsSold: cogs,
          [`unitsBySize.20ml`]: unitsSoldBySize['20ml'],
          [`unitsBySize.50ml`]: unitsSoldBySize['50ml'],
          [`unitsBySize.100ml`]: unitsSoldBySize['100ml'],
          [`unitsBySize.total`]: unitsSoldBySize.total,
          [`paymentBreakdown.${pmKey}`]: order.total,
        },
      },
      { upsert: true, new: true }
    );

    if (!summary) return;

    // Recalculate derived fields
    const grossProfit = summary.netRevenue - summary.costOfGoodsSold;
    const grossProfitMargin =
      summary.netRevenue > 0 ? (grossProfit / summary.netRevenue) * 100 : 0;
    const avgOrderValue =
      summary.totalOrders > 0 ? summary.netRevenue / summary.totalOrders : 0;

    await DailySummary.updateOne(
      { dateString },
      {
        $set: {
          grossProfit,
          grossProfitMargin: Math.round(grossProfitMargin * 100) / 100,
          avgOrderValue: Math.round(avgOrderValue * 100) / 100,
          generatedAt: new Date(),
        },
      }
    );

    // Emit real-time dashboard event
    dashboardEvents.dailySummaryUpdated({
      totalOrders: summary.totalOrders,
      netRevenue: summary.netRevenue,
      grossProfit,
      unitsSold: unitsSoldBySize['total'] ?? 0,
    });
  }

  // ----------------------------------------
  // 6.4.1 Get Low Stock Products
  // ----------------------------------------

  /**
   * Return products where any variant stock is at or below threshold.
   * Calculates days until stockout based on sales velocity.
   */
  static async getLowStockProducts(threshold?: number): Promise<ILowStockProduct[]> {
    const effectiveThreshold = threshold ?? 10;

    const products = await Product.find({ isActive: true }).lean<IProduct[]>();

    const lowStockItems: ILowStockProduct[] = [];

    for (const product of products) {
      for (const variant of product.variants ?? []) {
        if (variant.stock <= effectiveThreshold) {
          // Sales velocity: units sold / days since product created
          const createdAt = (product as IProduct & { createdAt: Date }).createdAt;
          const daysSinceCreation = createdAt
            ? Math.max((Date.now() - new Date(createdAt).getTime()) / 86400000, 1)
            : 30;
          const velocity = (product.stats?.purchaseCount ?? 0) / daysSinceCreation;
          const daysUntilStockout =
            velocity > 0 ? Math.floor(variant.stock / velocity) : 999;

          lowStockItems.push({
            product,
            variant,
            currentStock: variant.stock,
            threshold: effectiveThreshold,
            daysUntilStockout,
          });
        }
      }
    }

    return lowStockItems;
  }
}
