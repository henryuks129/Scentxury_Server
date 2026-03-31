/**
 * ============================================
 * ADMIN CONTROLLER
 * ============================================
 *
 * Request handlers for admin BI dashboard:
 * - Dashboard stats (AnalyticsService)
 * - Sales analytics & P&L reports
 * - Expense CRUD (AdminService)
 * - Inventory transaction log (AdminService)
 * - Daily summary generation (AnalyticsService)
 *
 * @file src/controllers/admin.controller.ts
 */

import { Request, Response, NextFunction } from 'express';
import { AdminService } from '@services/admin.service.js';
import { AnalyticsService } from '@services/analytics.service.js';
import type { ExpenseCategory } from '@models/Expense.js';
import { BadRequestError } from '@utils/errors.js';

// ============================================
// DASHBOARD
// ============================================

/**
 * GET /api/v1/admin/dashboard
 * Full real-time BI summary (today/week/month/year + low stock + recent orders)
 */
export async function getDashboardStats(
  _req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const stats = await AnalyticsService.getDashboardSummary();
    res.status(200).json({
      success: true,
      message: 'Dashboard stats retrieved',
      data: stats,
    });
  } catch (error) {
    next(error);
  }
}

// ============================================
// SALES ANALYTICS
// ============================================

/**
 * GET /api/v1/admin/analytics/sales
 * Query: startDate, endDate, groupBy (day|week|month)
 */
export async function getSalesAnalytics(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const startDate = req.query['startDate'] as string | undefined;
    const endDate = req.query['endDate'] as string | undefined;
    const groupBy = req.query['groupBy'] as string | undefined;
    const start = startDate ? new Date(startDate) : new Date(Date.now() - 30 * 86400000);
    const end = endDate ? new Date(endDate) : new Date();
    const group = (['day', 'week', 'month'].includes(groupBy ?? '') ? groupBy! : 'day') as
      | 'day'
      | 'week'
      | 'month';

    const analytics = await AnalyticsService.getSalesAnalytics(start, end, group);
    res.status(200).json({
      success: true,
      message: 'Sales analytics retrieved',
      data: analytics,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/v1/admin/analytics/pnl
 * Query: year, month
 */
export async function getPnLReport(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const now = new Date();
    const year = parseInt((req.query.year as string) || String(now.getFullYear()), 10);
    const month = parseInt((req.query.month as string) || String(now.getMonth() + 1), 10);

    if (month < 1 || month > 12) {
      throw new BadRequestError('month must be between 1 and 12');
    }

    const report = await AnalyticsService.getPnLReport(year, month);
    res.status(200).json({
      success: true,
      message: 'P&L report generated',
      data: report,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/v1/admin/analytics/chart
 * Query: type, period (7d|30d|90d|1y)
 */
export async function getChartData(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const type = String(req.query['type'] ?? 'sales-trend');
    const period = String(req.query['period'] ?? '30d');
    const validPeriods = ['7d', '30d', '90d', '1y'] as const;
    const safePeriod = validPeriods.includes(period as typeof validPeriods[number])
      ? (period as typeof validPeriods[number])
      : '30d';

    const chart = await AnalyticsService.getChartData(type, safePeriod);
    res.status(200).json({
      success: true,
      message: 'Chart data retrieved',
      data: chart,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/v1/admin/analytics/inventory
 */
export async function getInventoryReport(
  _req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const report = await AnalyticsService.getInventoryReport();
    res.status(200).json({
      success: true,
      message: 'Inventory report retrieved',
      data: report,
    });
  } catch (error) {
    next(error);
  }
}

// ============================================
// EXPENSES
// ============================================

/**
 * POST /api/v1/admin/expenses
 */
export async function createExpense(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const expense = await AdminService.createExpense(req.body, req.user!.id);
    res.status(201).json({
      success: true,
      message: 'Expense recorded successfully',
      data: { expense },
    });
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/v1/admin/expenses
 */
export async function getExpenses(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { startDate, endDate, category, page, limit } = req.query as Record<string, string>;

    const result = await AdminService.getExpenses({
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined,
      category: category as ExpenseCategory | undefined,
      page: page ? parseInt(page, 10) : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
    });

    res.status(200).json({
      success: true,
      message: 'Expenses retrieved successfully',
      data: result,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * DELETE /api/v1/admin/expenses/:id
 */
export async function deleteExpense(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    await AdminService.deleteExpense(req.params['id'] as string);
    res.status(200).json({
      success: true,
      message: 'Expense deleted successfully',
    });
  } catch (error) {
    next(error);
  }
}

// ============================================
// INVENTORY TRANSACTIONS
// ============================================

/**
 * GET /api/v1/admin/inventory/transactions
 */
export async function getInventoryTransactions(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { productId, variantSku, transactionType, startDate, endDate, page, limit } =
      req.query as Record<string, string>;

    const result = await AdminService.getInventoryTransactions({
      productId,
      variantSku,
      transactionType,
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined,
      page: page ? parseInt(page, 10) : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
    });

    res.status(200).json({
      success: true,
      message: 'Inventory transactions retrieved',
      data: result,
    });
  } catch (error) {
    next(error);
  }
}

// ============================================
// DAILY SUMMARIES
// ============================================

/**
 * POST /api/v1/admin/summaries/generate
 */
export async function generateDailySummary(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { date } = req.body as { date?: string };
    const targetDate = date ? new Date(date) : new Date();
    const summary = await AnalyticsService.calculateDailySummary(targetDate);
    res.status(200).json({
      success: true,
      message: 'Daily summary generated',
      data: { summary },
    });
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/v1/admin/summaries
 */
export async function getDailySummaries(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { startDate, endDate } = req.query as Record<string, string>;
    const start = startDate ? new Date(startDate) : new Date(Date.now() - 30 * 86400000);
    const end = endDate ? new Date(endDate) : new Date();

    const summaries = await AdminService.getDailySummaries(start, end);
    res.status(200).json({
      success: true,
      message: 'Daily summaries retrieved',
      data: { summaries, total: summaries.length },
    });
  } catch (error) {
    next(error);
  }
}
