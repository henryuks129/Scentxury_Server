/**
 * ============================================
 * ADMIN BI SERVICE
 * ============================================
 *
 * Business Intelligence for the admin dashboard:
 * - Real-time sales stats
 * - Inventory alerts (low stock)
 * - Expense CRUD
 * - Daily summary generation
 * - Inventory transaction history
 *
 * @file src/services/admin.service.ts
 */

import { Order } from '@models/Order.js';
import { Product } from '@models/Product.js';
import { Expense, IExpense, ExpenseCategory } from '@models/Expense.js';
import { DailySummary, IDailySummary } from '@models/DailySummary.js';
import { InventoryTransaction, IInventoryTransaction } from '@models/InventoryTransaction.js';
import { NotFoundError, BadRequestError } from '@utils/errors.js';
import mongoose from 'mongoose';

// ============================================
// TYPES
// ============================================

export interface DashboardStats {
  today: {
    orders: number;
    revenue: number;
    unitsSold: number;
  };
  thisMonth: {
    orders: number;
    revenue: number;
    grossProfit: number;
  };
  allTime: {
    orders: number;
    revenue: number;
  };
  recentOrders: Array<{
    orderNumber: string;
    status: string;
    total: number;
    createdAt: Date;
  }>;
  lowStockAlerts: Array<{
    productId: string;
    productName: string;
    variantSku: string;
    stock: number;
  }>;
}

export interface CreateExpenseData {
  category: ExpenseCategory;
  description: string;
  amount: number;
  currency?: 'NGN' | 'USD';
  isRecurring?: boolean;
  recurringPeriod?: 'daily' | 'weekly' | 'monthly' | 'yearly';
  expenseDate: Date;
  receiptUrl?: string;
  vendor?: string;
}

export interface InventoryReportQuery {
  productId?: string;
  variantSku?: string;
  transactionType?: string;
  startDate?: Date;
  endDate?: Date;
  page?: number;
  limit?: number;
}

// Low stock threshold
const LOW_STOCK_THRESHOLD = 10;

// ============================================
// ADMIN SERVICE
// ============================================

export class AdminService {
  /**
   * Get dashboard summary stats
   */
  static async getDashboardStats(): Promise<DashboardStats> {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    const [todayStats, monthStats, allTimeStats, recentOrders, lowStockProducts] =
      await Promise.all([
        // Today's stats from completed/delivered orders
        Order.aggregate([
          { $match: { createdAt: { $gte: todayStart }, paymentStatus: 'paid' } },
          {
            $group: {
              _id: null,
              orders: { $sum: 1 },
              revenue: { $sum: '$total' },
              unitsSold: { $sum: { $sum: '$items.quantity' } },
            },
          },
        ]),

        // This month
        Order.aggregate([
          { $match: { createdAt: { $gte: monthStart }, paymentStatus: 'paid' } },
          {
            $group: {
              _id: null,
              orders: { $sum: 1 },
              revenue: { $sum: '$total' },
              cogs: { $sum: { $sum: { $map: { input: '$items', as: 'i', in: { $multiply: ['$$i.costPrice', '$$i.quantity'] } } } } },
            },
          },
        ]),

        // All time
        Order.aggregate([
          { $match: { paymentStatus: 'paid' } },
          { $group: { _id: null, orders: { $sum: 1 }, revenue: { $sum: '$total' } } },
        ]),

        // Recent orders (last 10)
        Order.find({})
          .sort({ createdAt: -1 })
          .limit(10)
          .select('orderNumber status total createdAt')
          .lean(),

        // Low stock products
        Product.aggregate([
          { $match: { isActive: true } },
          { $unwind: '$variants' },
          { $match: { 'variants.stock': { $lte: LOW_STOCK_THRESHOLD } } },
          {
            $project: {
              productId: '$_id',
              productName: '$name',
              variantSku: '$variants.sku',
              stock: '$variants.stock',
            },
          },
          { $limit: 20 },
        ]),
      ]);

    const today = todayStats[0] ?? { orders: 0, revenue: 0, unitsSold: 0 };
    const month = monthStats[0] ?? { orders: 0, revenue: 0, cogs: 0 };
    const allTime = allTimeStats[0] ?? { orders: 0, revenue: 0 };

    return {
      today: {
        orders: today.orders,
        revenue: today.revenue,
        unitsSold: today.unitsSold,
      },
      thisMonth: {
        orders: month.orders,
        revenue: month.revenue,
        grossProfit: month.revenue - month.cogs,
      },
      allTime: {
        orders: allTime.orders,
        revenue: allTime.revenue,
      },
      recentOrders: recentOrders.map((o) => ({
        orderNumber: (o as { orderNumber: string; status: string; total: number; createdAt: Date }).orderNumber,
        status: (o as { orderNumber: string; status: string; total: number; createdAt: Date }).status,
        total: (o as { orderNumber: string; status: string; total: number; createdAt: Date }).total,
        createdAt: (o as { orderNumber: string; status: string; total: number; createdAt: Date }).createdAt,
      })),
      lowStockAlerts: lowStockProducts.map((p) => ({
        productId: (p as { productId: mongoose.Types.ObjectId; productName: string; variantSku: string; stock: number }).productId.toString(),
        productName: (p as { productId: mongoose.Types.ObjectId; productName: string; variantSku: string; stock: number }).productName,
        variantSku: (p as { productId: mongoose.Types.ObjectId; productName: string; variantSku: string; stock: number }).variantSku,
        stock: (p as { productId: mongoose.Types.ObjectId; productName: string; variantSku: string; stock: number }).stock,
      })),
    };
  }

  /**
   * Create an expense record
   */
  static async createExpense(data: CreateExpenseData, adminId: string): Promise<IExpense> {
    if (data.isRecurring && !data.recurringPeriod) {
      throw new BadRequestError('recurringPeriod is required for recurring expenses');
    }

    const expense = await Expense.create({
      ...data,
      currency: data.currency ?? 'NGN',
      createdBy: new mongoose.Types.ObjectId(adminId),
    });

    return expense;
  }

  /**
   * Get expenses with optional date filter
   */
  static async getExpenses(options: {
    startDate?: Date;
    endDate?: Date;
    category?: ExpenseCategory;
    page?: number;
    limit?: number;
  } = {}): Promise<{ expenses: IExpense[]; total: number }> {
    const { startDate, endDate, category, page = 1, limit = 20 } = options;
    const skip = (page - 1) * limit;

    const filter: Record<string, unknown> = {};
    if (category) filter.category = category;
    if (startDate || endDate) {
      const dateFilter: Record<string, Date> = {};
      if (startDate) dateFilter.$gte = startDate;
      if (endDate) dateFilter.$lte = endDate;
      filter.expenseDate = dateFilter;
    }

    const [expenses, total] = await Promise.all([
      Expense.find(filter).sort({ expenseDate: -1 }).skip(skip).limit(limit).lean(),
      Expense.countDocuments(filter),
    ]);

    return { expenses: expenses as unknown as IExpense[], total };
  }

  /**
   * Delete an expense
   */
  static async deleteExpense(expenseId: string): Promise<void> {
    const result = await Expense.findByIdAndDelete(expenseId);
    if (!result) {
      throw new NotFoundError('Expense', 'RES_005');
    }
  }

  /**
   * Get inventory transaction log
   */
  static async getInventoryTransactions(
    query: InventoryReportQuery = {}
  ): Promise<{ transactions: IInventoryTransaction[]; total: number }> {
    const { productId, variantSku, transactionType, startDate, endDate, page = 1, limit = 20 } = query;
    const skip = (page - 1) * limit;

    const filter: Record<string, unknown> = {};
    if (productId) filter.productId = new mongoose.Types.ObjectId(productId);
    if (variantSku) filter.variantSku = variantSku;
    if (transactionType) filter.transactionType = transactionType;
    if (startDate || endDate) {
      const dateFilter: Record<string, Date> = {};
      if (startDate) dateFilter.$gte = startDate;
      if (endDate) dateFilter.$lte = endDate;
      filter.timestamp = dateFilter;
    }

    const [transactions, total] = await Promise.all([
      InventoryTransaction.find(filter)
        .sort({ timestamp: -1 })
        .skip(skip)
        .limit(limit)
        .populate('productId', 'name slug')
        .lean(),
      InventoryTransaction.countDocuments(filter),
    ]);

    return { transactions: transactions as unknown as IInventoryTransaction[], total };
  }

  /**
   * Generate daily summary for a given date (idempotent — upserts)
   */
  static async generateDailySummary(date: Date): Promise<IDailySummary> {
    const dayStart = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const dayEnd = new Date(dayStart.getTime() + 86400000);
    const dateString = dayStart.toISOString().slice(0, 10);

    // Aggregate orders for that day
    const [orderStats] = await Order.aggregate([
      { $match: { createdAt: { $gte: dayStart, $lt: dayEnd } } },
      {
        $group: {
          _id: null,
          totalOrders: { $sum: 1 },
          completedOrders: {
            $sum: { $cond: [{ $eq: ['$status', 'delivered'] }, 1, 0] },
          },
          cancelledOrders: {
            $sum: { $cond: [{ $eq: ['$status', 'cancelled'] }, 1, 0] },
          },
          grossRevenue: {
            $sum: { $cond: [{ $eq: ['$paymentStatus', 'paid'] }, '$subtotal', 0] },
          },
          discountsGiven: {
            $sum: { $cond: [{ $eq: ['$paymentStatus', 'paid'] }, '$discount', 0] },
          },
          deliveryFeesCollected: {
            $sum: { $cond: [{ $eq: ['$paymentStatus', 'paid'] }, '$deliveryFee', 0] },
          },
          cogs: {
            $sum: {
              $cond: [
                { $eq: ['$paymentStatus', 'paid'] },
                {
                  $sum: {
                    $map: {
                      input: '$items',
                      as: 'i',
                      in: { $multiply: ['$$i.costPrice', '$$i.quantity'] },
                    },
                  },
                },
                0,
              ],
            },
          },
          paystackRevenue: {
            $sum: {
              $cond: [
                { $and: [{ $eq: ['$paymentStatus', 'paid'] }, { $eq: ['$paymentMethod', 'paystack'] }] },
                '$total',
                0,
              ],
            },
          },
          stripeRevenue: {
            $sum: {
              $cond: [
                { $and: [{ $eq: ['$paymentStatus', 'paid'] }, { $eq: ['$paymentMethod', 'stripe'] }] },
                '$total',
                0,
              ],
            },
          },
          bankTransferRevenue: {
            $sum: {
              $cond: [
                { $and: [{ $eq: ['$paymentStatus', 'paid'] }, { $eq: ['$paymentMethod', 'bank_transfer'] }] },
                '$total',
                0,
              ],
            },
          },
        },
      },
    ]);

    const stats = orderStats ?? {
      totalOrders: 0, completedOrders: 0, cancelledOrders: 0,
      grossRevenue: 0, discountsGiven: 0, deliveryFeesCollected: 0,
      cogs: 0, paystackRevenue: 0, stripeRevenue: 0, bankTransferRevenue: 0,
    };

    // Get expenses for the day
    const [expenseStats] = await Expense.aggregate([
      { $match: { expenseDate: { $gte: dayStart, $lt: dayEnd } } },
      { $group: { _id: null, total: { $sum: '$amount' } } },
    ]);
    const totalExpenses = expenseStats?.total ?? 0;

    const netRevenue = stats.grossRevenue - stats.discountsGiven + stats.deliveryFeesCollected;
    const grossProfit = netRevenue - stats.cogs;
    const grossProfitMargin = netRevenue > 0 ? (grossProfit / netRevenue) * 100 : 0;
    const netProfit = grossProfit - totalExpenses;
    const netProfitMargin = netRevenue > 0 ? (netProfit / netRevenue) * 100 : 0;
    const avgOrderValue = stats.totalOrders > 0 ? stats.grossRevenue / stats.totalOrders : 0;

    const summary = await DailySummary.findOneAndUpdate(
      { dateString },
      {
        date: dayStart,
        dateString,
        totalOrders: stats.totalOrders,
        completedOrders: stats.completedOrders,
        cancelledOrders: stats.cancelledOrders,
        grossRevenue: stats.grossRevenue,
        discountsGiven: stats.discountsGiven,
        deliveryFeesCollected: stats.deliveryFeesCollected,
        netRevenue,
        costOfGoodsSold: stats.cogs,
        grossProfit,
        grossProfitMargin,
        totalExpenses,
        netProfit,
        netProfitMargin,
        avgOrderValue,
        paymentBreakdown: {
          paystack: stats.paystackRevenue,
          stripe: stats.stripeRevenue,
          bankTransfer: stats.bankTransferRevenue,
        },
        generatedAt: new Date(),
      },
      { upsert: true, new: true }
    );

    return summary!;
  }

  /**
   * Get daily summaries for a date range
   */
  static async getDailySummaries(
    startDate: Date,
    endDate: Date
  ): Promise<IDailySummary[]> {
    const start = startDate.toISOString().slice(0, 10);
    const end = endDate.toISOString().slice(0, 10);

    return DailySummary.find({
      dateString: { $gte: start, $lte: end },
    })
      .sort({ dateString: 1 })
      .lean() as unknown as IDailySummary[];
  }
}

export default AdminService;
