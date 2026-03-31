/**
 * ============================================
 * ANALYTICS SERVICE
 * ============================================
 *
 * Generates business intelligence data for the admin dashboard.
 * Handles daily/weekly/monthly summaries, P&L, and inventory reports.
 *
 * @file src/services/analytics.service.ts
 */

import { Order } from '@models/Order.js';
import { Product } from '@models/Product.js';
import { User } from '@models/User.js';
import { Expense } from '@models/Expense.js';
import { DailySummary, IDailySummary } from '@models/DailySummary.js';
import { NotFoundError } from '@utils/errors.js';

// ============================================
// TYPES
// ============================================

export interface DashboardSummary {
  today: DailyMetrics;
  week: PeriodMetrics;
  month: PeriodMetrics;
  year: PeriodMetrics;
  lowStockAlerts: LowStockAlert[];
  recentOrders: RecentOrder[];
}

export interface DailyMetrics {
  revenue: number;
  orders: number;
  avgOrderValue: number;
  changePercent: number; // vs yesterday
}

export interface PeriodMetrics {
  revenue: number;
  orders: number;
  avgOrderValue: number;
  changePercent: number; // vs previous period
}

export interface LowStockAlert {
  productId: string;
  productName: string;
  variantSku: string;
  size: string;
  currentStock: number;
  threshold: number;
}

export interface RecentOrder {
  orderId: string;
  orderNumber: string;
  customerName: string;
  total: number;
  currency: string;
  status: string;
  paymentStatus: string;
  city: string;
  createdAt: Date;
}

export interface SalesDataPoint {
  date: string;
  revenue: number;
  orders: number;
  avgOrderValue: number;
}

export interface SalesAnalytics {
  data: SalesDataPoint[];
  total: number;
  orderCount: number;
  groupBy: 'day' | 'week' | 'month';
}

export interface InventoryReport {
  totalProducts: number;
  totalVariants: number;
  totalStockUnits: number;
  totalInventoryValue: number;
  lowStockProducts: LowStockAlert[];
  outOfStockProducts: LowStockAlert[];
  stockBySize: Record<string, number>;
}

export interface PnLReport {
  period: string;
  revenue: {
    gross: number;
    discounts: number;
    deliveryFees: number;
    net: number;
  };
  cogs: number;
  grossProfit: number;
  grossProfitMargin: number;
  expenses: Record<string, number>;
  totalExpenses: number;
  netProfit: number;
  netProfitMargin: number;
  comparison?: {
    prevNetProfit: number;
    revenueGrowth: number;
    profitGrowth: number;
  };
}

export interface ChartData {
  labels: string[];
  datasets: ChartDataset[];
}

export interface ChartDataset {
  label: string;
  data: number[];
  backgroundColor?: string | string[];
  borderColor?: string;
}

// ============================================
// HELPERS
// ============================================

function startOfDay(date: Date): Date {
  const d = new Date(date);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

function endOfDay(date: Date): Date {
  const d = new Date(date);
  d.setUTCHours(23, 59, 59, 999);
  return d;
}

function dateToString(date: Date): string {
  return date.toISOString().split('T')[0] as string;
}

// ============================================
// DASHBOARD SUMMARY
// ============================================

/**
 * Get real-time dashboard summary for the admin BI widget.
 */
async function getDashboardSummary(): Promise<DashboardSummary> {
  const now = new Date();
  const todayStart = startOfDay(now);
  const todayEnd = endOfDay(now);
  const yesterdayStart = startOfDay(new Date(now.getTime() - 86_400_000));
  const yesterdayEnd = endOfDay(new Date(now.getTime() - 86_400_000));
  const weekStart = new Date(now.getTime() - 7 * 86_400_000);
  const prevWeekStart = new Date(now.getTime() - 14 * 86_400_000);
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const prevMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const prevMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
  const yearStart = new Date(now.getFullYear(), 0, 1);
  const prevYearStart = new Date(now.getFullYear() - 1, 0, 1);
  const prevYearEnd = new Date(now.getFullYear() - 1, 11, 31, 23, 59, 59, 999);

  const [
    todayData,
    yesterdayData,
    weekData,
    prevWeekData,
    monthData,
    prevMonthData,
    yearData,
    prevYearData,
  ] = await Promise.all([
    aggregateOrderRevenue(todayStart, todayEnd),
    aggregateOrderRevenue(yesterdayStart, yesterdayEnd),
    aggregateOrderRevenue(weekStart, now),
    aggregateOrderRevenue(prevWeekStart, new Date(now.getTime() - 7 * 86_400_000)),
    aggregateOrderRevenue(monthStart, now),
    aggregateOrderRevenue(prevMonthStart, prevMonthEnd),
    aggregateOrderRevenue(yearStart, now),
    aggregateOrderRevenue(prevYearStart, prevYearEnd),
  ]);

  const calcChange = (curr: number, prev: number): number => {
    if (prev === 0) return curr > 0 ? 100 : 0;
    return Math.round(((curr - prev) / prev) * 100);
  };

  const [lowStockAlerts, recentOrders] = await Promise.all([
    getLowStockAlerts(),
    getRecentOrders(10),
  ]);

  return {
    today: {
      revenue: todayData.revenue,
      orders: todayData.orders,
      avgOrderValue: todayData.avgOrderValue,
      changePercent: calcChange(todayData.revenue, yesterdayData.revenue),
    },
    week: {
      revenue: weekData.revenue,
      orders: weekData.orders,
      avgOrderValue: weekData.avgOrderValue,
      changePercent: calcChange(weekData.revenue, prevWeekData.revenue),
    },
    month: {
      revenue: monthData.revenue,
      orders: monthData.orders,
      avgOrderValue: monthData.avgOrderValue,
      changePercent: calcChange(monthData.revenue, prevMonthData.revenue),
    },
    year: {
      revenue: yearData.revenue,
      orders: yearData.orders,
      avgOrderValue: yearData.avgOrderValue,
      changePercent: calcChange(yearData.revenue, prevYearData.revenue),
    },
    lowStockAlerts,
    recentOrders,
  };
}

async function aggregateOrderRevenue(
  start: Date,
  end: Date
): Promise<{ revenue: number; orders: number; avgOrderValue: number }> {
  const result = await Order.aggregate([
    {
      $match: {
        createdAt: { $gte: start, $lte: end },
        paymentStatus: 'paid',
      },
    },
    {
      $group: {
        _id: null,
        revenue: { $sum: '$total' },
        orders: { $sum: 1 },
      },
    },
  ]);

  const data = result[0] || { revenue: 0, orders: 0 };
  return {
    revenue: data.revenue,
    orders: data.orders,
    avgOrderValue: data.orders > 0 ? Math.round(data.revenue / data.orders) : 0,
  };
}

// ============================================
// SALES ANALYTICS
// ============================================

/**
 * Get sales data grouped by day, week, or month.
 */
async function getSalesAnalytics(
  startDate: Date,
  endDate: Date,
  groupBy: 'day' | 'week' | 'month' = 'day'
): Promise<SalesAnalytics> {
  const groupFormat: Record<string, object> = {
    day: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
    week: { $dateToString: { format: '%Y-W%V', date: '$createdAt' } },
    month: { $dateToString: { format: '%Y-%m', date: '$createdAt' } },
  };

  const result = await Order.aggregate([
    {
      $match: {
        createdAt: { $gte: startDate, $lte: endDate },
        paymentStatus: 'paid',
      },
    },
    {
      $group: {
        _id: groupFormat[groupBy],
        revenue: { $sum: '$total' },
        orders: { $sum: 1 },
      },
    },
    { $sort: { _id: 1 } },
  ]);

  const data: SalesDataPoint[] = result.map((d) => ({
    date: d._id,
    revenue: d.revenue,
    orders: d.orders,
    avgOrderValue: d.orders > 0 ? Math.round(d.revenue / d.orders) : 0,
  }));

  const total = data.reduce((sum, d) => sum + d.revenue, 0);
  const orderCount = data.reduce((sum, d) => sum + d.orders, 0);

  return { data, total, orderCount, groupBy };
}

// ============================================
// INVENTORY REPORT
// ============================================

/**
 * Get current inventory status across all products.
 */
async function getInventoryReport(): Promise<InventoryReport> {
  const products = await Product.find({ isActive: true }).lean();

  let totalVariants = 0;
  let totalStockUnits = 0;
  let totalInventoryValue = 0;
  const stockBySize: Record<string, number> = { '20ml': 0, '50ml': 0, '100ml': 0 };
  const lowStockProducts: LowStockAlert[] = [];
  const outOfStockProducts: LowStockAlert[] = [];

  for (const product of products) {
    for (const variant of (product as { variants?: { stock: number; costPrice: number; size: string; sku: string; lowStockThreshold: number }[] }).variants || []) {
      totalVariants++;
      totalStockUnits += variant.stock;
      totalInventoryValue += variant.stock * variant.costPrice;

      if (variant.size in stockBySize) {
        stockBySize[variant.size as keyof typeof stockBySize] = (stockBySize[variant.size as keyof typeof stockBySize] ?? 0) + variant.stock;
      }

      const alert: LowStockAlert = {
        productId: String(product._id),
        productName: (product as { name: string }).name,
        variantSku: variant.sku,
        size: variant.size,
        currentStock: variant.stock,
        threshold: variant.lowStockThreshold,
      };

      if (variant.stock === 0) {
        outOfStockProducts.push(alert);
      } else if (variant.stock <= variant.lowStockThreshold) {
        lowStockProducts.push(alert);
      }
    }
  }

  return {
    totalProducts: products.length,
    totalVariants,
    totalStockUnits,
    totalInventoryValue,
    lowStockProducts,
    outOfStockProducts,
    stockBySize,
  };
}

async function getLowStockAlerts(): Promise<LowStockAlert[]> {
  const report = await getInventoryReport();
  return [...report.outOfStockProducts, ...report.lowStockProducts];
}

// ============================================
// RECENT ORDERS
// ============================================

async function getRecentOrders(limit: number = 10): Promise<RecentOrder[]> {
  const orders = await Order.find()
    .sort({ createdAt: -1 })
    .limit(limit)
    .populate('userId', 'firstName lastName')
    .lean();

  type LeanOrder = {
    _id: unknown;
    orderNumber: string;
    userId?: { firstName: string; lastName: string };
    total: number;
    currency: string;
    status: string;
    paymentStatus: string;
    shippingAddress?: { city?: string };
    createdAt: Date;
  };
  return (orders as unknown as LeanOrder[]).map((order) => ({
    orderId: String(order._id),
    orderNumber: order.orderNumber,
    customerName: order.userId
      ? `${order.userId.firstName} ${order.userId.lastName}`
      : 'Guest',
    total: order.total,
    currency: order.currency,
    status: order.status,
    paymentStatus: order.paymentStatus,
    city: order.shippingAddress?.city || '',
    createdAt: order.createdAt,
  }));
}

// ============================================
// P&L REPORT
// ============================================

/**
 * Generate a full P&L report for a given month.
 */
async function getPnLReport(year: number, month: number): Promise<PnLReport> {
  const startDate = new Date(year, month - 1, 1);
  const endDate = new Date(year, month, 0, 23, 59, 59, 999);

  // Previous month
  const prevStart = new Date(year, month - 2, 1);
  const prevEnd = new Date(year, month - 1, 0, 23, 59, 59, 999);

  const [orderAgg, prevOrderAgg, expenseAgg, prevExpenseAgg] = await Promise.all([
    Order.aggregate([
      {
        $match: {
          createdAt: { $gte: startDate, $lte: endDate },
          paymentStatus: 'paid',
        },
      },
      {
        $group: {
          _id: null,
          grossRevenue: { $sum: '$subtotal' },
          discountsGiven: { $sum: '$discount' },
          deliveryFees: { $sum: '$deliveryFee' },
          netRevenue: { $sum: '$total' },
          cogs: {
            $sum: {
              $reduce: {
                input: '$items',
                initialValue: 0,
                in: {
                  $add: [
                    '$$value',
                    { $multiply: ['$$this.costPrice', '$$this.quantity'] },
                  ],
                },
              },
            },
          },
        },
      },
    ]),
    Order.aggregate([
      {
        $match: {
          createdAt: { $gte: prevStart, $lte: prevEnd },
          paymentStatus: 'paid',
        },
      },
      {
        $group: {
          _id: null,
          netRevenue: { $sum: '$total' },
          cogs: {
            $sum: {
              $reduce: {
                input: '$items',
                initialValue: 0,
                in: {
                  $add: ['$$value', { $multiply: ['$$this.costPrice', '$$this.quantity'] }],
                },
              },
            },
          },
        },
      },
    ]),
    Expense.aggregate([
      {
        $match: { expenseDate: { $gte: startDate, $lte: endDate } },
      },
      {
        $group: {
          _id: '$category',
          total: { $sum: '$amount' },
        },
      },
    ]),
    Expense.aggregate([
      {
        $match: { expenseDate: { $gte: prevStart, $lte: prevEnd } },
      },
      {
        $group: {
          _id: null,
          total: { $sum: '$amount' },
        },
      },
    ]),
  ]);

  const rev = orderAgg[0] || {
    grossRevenue: 0,
    discountsGiven: 0,
    deliveryFees: 0,
    netRevenue: 0,
    cogs: 0,
  };

  const expenses: Record<string, number> = {};
  let totalExpenses = 0;
  for (const e of expenseAgg) {
    expenses[e._id] = e.total;
    totalExpenses += e.total;
  }

  const grossProfit = rev.netRevenue - rev.cogs;
  const grossProfitMargin = rev.netRevenue > 0
    ? Math.round((grossProfit / rev.netRevenue) * 10000) / 100
    : 0;

  const netProfit = grossProfit - totalExpenses;
  const netProfitMargin = rev.netRevenue > 0
    ? Math.round((netProfit / rev.netRevenue) * 10000) / 100
    : 0;

  // Previous period comparison
  const prevRev = prevOrderAgg[0] || { netRevenue: 0, cogs: 0 };
  const prevTotalExpenses = prevExpenseAgg[0]?.total ?? 0;
  const prevNetProfit = (prevRev.netRevenue - prevRev.cogs) - prevTotalExpenses;

  const calcGrowth = (curr: number, prev: number): number => {
    if (prev === 0) return curr > 0 ? 100 : 0;
    return Math.round(((curr - prev) / prev) * 100);
  };

  const periodStr = new Date(year, month - 1).toLocaleString('en-NG', {
    month: 'long',
    year: 'numeric',
  });

  return {
    period: periodStr,
    revenue: {
      gross: rev.grossRevenue,
      discounts: rev.discountsGiven,
      deliveryFees: rev.deliveryFees,
      net: rev.netRevenue,
    },
    cogs: rev.cogs,
    grossProfit,
    grossProfitMargin,
    expenses,
    totalExpenses,
    netProfit,
    netProfitMargin,
    comparison: {
      prevNetProfit,
      revenueGrowth: calcGrowth(rev.netRevenue, prevRev.netRevenue),
      profitGrowth: calcGrowth(netProfit, prevNetProfit),
    },
  };
}

// ============================================
// DAILY SUMMARY (for cron)
// ============================================

/**
 * Aggregate and persist the daily summary for a given date.
 * Called nightly via cron: 0 0 * * *
 */
async function calculateDailySummary(date: Date): Promise<IDailySummary> {
  const dayStart = startOfDay(date);
  const dayEnd = endOfDay(date);
  const dateString = dateToString(dayStart);

  const [orderResult, expenseResult, newCustomers] = await Promise.all([
    Order.aggregate([
      {
        $match: {
          createdAt: { $gte: dayStart, $lte: dayEnd },
          paymentStatus: 'paid',
        },
      },
      {
        $group: {
          _id: null,
          totalOrders: { $sum: 1 },
          grossRevenue: { $sum: '$subtotal' },
          discountsGiven: { $sum: '$discount' },
          deliveryFeesCollected: { $sum: '$deliveryFee' },
          netRevenue: { $sum: '$total' },
          paystackRevenue: {
            $sum: {
              $cond: [{ $eq: ['$paymentMethod', 'paystack'] }, '$total', 0],
            },
          },
          stripeRevenue: {
            $sum: {
              $cond: [{ $eq: ['$paymentMethod', 'stripe'] }, '$total', 0],
            },
          },
          bankTransferRevenue: {
            $sum: {
              $cond: [{ $eq: ['$paymentMethod', 'bank_transfer'] }, '$total', 0],
            },
          },
          cogs: {
            $sum: {
              $reduce: {
                input: '$items',
                initialValue: 0,
                in: {
                  $add: ['$$value', { $multiply: ['$$this.costPrice', '$$this.quantity'] }],
                },
              },
            },
          },
        },
      },
    ]),
    Expense.aggregate([
      {
        $match: { expenseDate: { $gte: dayStart, $lte: dayEnd } },
      },
      {
        $group: { _id: null, total: { $sum: '$amount' } },
      },
    ]),
    User.countDocuments({ createdAt: { $gte: dayStart, $lte: dayEnd } }),
  ]);

  const r = orderResult[0] || {
    totalOrders: 0,
    grossRevenue: 0,
    discountsGiven: 0,
    deliveryFeesCollected: 0,
    netRevenue: 0,
    paystackRevenue: 0,
    stripeRevenue: 0,
    bankTransferRevenue: 0,
    cogs: 0,
  };

  const totalExpenses = expenseResult[0]?.total ?? 0;
  const grossProfit = r.netRevenue - r.cogs;
  const netProfit = grossProfit - totalExpenses;

  const summaryData = {
    date: dayStart,
    dateString,
    totalOrders: r.totalOrders,
    completedOrders: r.totalOrders, // simplified
    cancelledOrders: 0,
    grossRevenue: r.grossRevenue,
    discountsGiven: r.discountsGiven,
    deliveryFeesCollected: r.deliveryFeesCollected,
    netRevenue: r.netRevenue,
    costOfGoodsSold: r.cogs,
    grossProfit,
    grossProfitMargin: r.netRevenue > 0
      ? Math.round((grossProfit / r.netRevenue) * 10000) / 100
      : 0,
    unitsBySize: { '20ml': 0, '50ml': 0, '100ml': 0, total: 0 },
    paymentBreakdown: {
      paystack: r.paystackRevenue,
      stripe: r.stripeRevenue,
      bankTransfer: r.bankTransferRevenue,
    },
    categoryBreakdown: {
      male: 0, female: 0, unisex: 0, children: 0, combo_mix: 0,
    },
    totalExpenses,
    netProfit,
    netProfitMargin: r.netRevenue > 0
      ? Math.round((netProfit / r.netRevenue) * 10000) / 100
      : 0,
    newCustomers,
    returningCustomers: Math.max(0, r.totalOrders - newCustomers),
    avgOrderValue: r.totalOrders > 0 ? Math.round(r.netRevenue / r.totalOrders) : 0,
    generatedAt: new Date(),
  };

  // Upsert so re-running is safe
  const summary = await DailySummary.findOneAndUpdate(
    { dateString },
    summaryData,
    { upsert: true, new: true }
  );

  if (!summary) {
    throw new NotFoundError('DailySummary');
  }

  return summary;
}

/**
 * Get chart data formatted for frontend charts.
 * type: 'sales-trend' | 'category-breakdown' | 'payment-methods' | 'inventory-status'
 */
async function getChartData(
  type: string,
  period: '7d' | '30d' | '90d' | '1y' = '30d'
): Promise<ChartData> {
  const periodDays: Record<string, number> = { '7d': 7, '30d': 30, '90d': 90, '1y': 365 };
  const days = periodDays[period] || 30;
  const startDate = new Date(Date.now() - days * 86_400_000);

  switch (type) {
    case 'sales-trend': {
      const data = await getSalesAnalytics(startDate, new Date(), 'day');
      return {
        labels: data.data.map((d) => d.date),
        datasets: [
          {
            label: 'Revenue (₦)',
            data: data.data.map((d) => d.revenue),
            borderColor: '#7C3AED',
            backgroundColor: 'rgba(124, 58, 237, 0.1)',
          },
        ],
      };
    }

    case 'payment-methods': {
      const result = await Order.aggregate([
        {
          $match: {
            createdAt: { $gte: startDate },
            paymentStatus: 'paid',
          },
        },
        {
          $group: {
            _id: '$paymentMethod',
            total: { $sum: '$total' },
          },
        },
      ]);

      return {
        labels: result.map((r) => r._id),
        datasets: [
          {
            label: 'Revenue by Payment Method',
            data: result.map((r) => r.total),
            backgroundColor: ['#10B981', '#6366F1', '#F59E0B'],
          },
        ],
      };
    }

    case 'category-breakdown': {
      const result = await Order.aggregate([
        {
          $match: { createdAt: { $gte: startDate }, paymentStatus: 'paid' },
        },
        { $unwind: '$items' },
        {
          $lookup: {
            from: 'products',
            localField: 'items.productId',
            foreignField: '_id',
            as: 'product',
          },
        },
        { $unwind: { path: '$product', preserveNullAndEmptyArrays: true } },
        {
          $group: {
            _id: '$product.category',
            total: { $sum: '$items.total' },
          },
        },
      ]);

      return {
        labels: result.map((r) => r._id || 'Unknown'),
        datasets: [
          {
            label: 'Revenue by Category',
            data: result.map((r) => r.total),
            backgroundColor: ['#3B82F6', '#EC4899', '#8B5CF6', '#F59E0B', '#10B981'],
          },
        ],
      };
    }

    default:
      return { labels: [], datasets: [] };
  }
}

// ============================================
// SERVICE OBJECT
// ============================================

export const AnalyticsService = {
  getDashboardSummary,
  getSalesAnalytics,
  getInventoryReport,
  getLowStockAlerts,
  getRecentOrders,
  getPnLReport,
  calculateDailySummary,
  getChartData,
};

export default AnalyticsService;
