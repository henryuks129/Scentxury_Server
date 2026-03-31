/**
 * ============================================
 * EXPORT CONTROLLER
 * ============================================
 *
 * Admin-only export handlers for Google Sheets.
 *
 * Routes (admin only):
 *   POST /api/v1/admin/export/orders    — export orders to Sheets
 *   POST /api/v1/admin/export/customers — export customers to Sheets
 *   POST /api/v1/admin/export/pnl       — export P&L to Sheets
 *
 * @file src/controllers/export.controller.ts
 */

import { Request, Response, NextFunction } from 'express';
import { ExportService } from '@services/export.service.js';
import { BadRequestError } from '@utils/errors.js';

// ============================================
// EXPORT ORDERS
// ============================================

/**
 * POST /api/v1/admin/export/orders
 * Body: { startDate: string; endDate: string; spreadsheetId?: string }
 */
export async function exportOrdersToSheets(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { startDate, endDate, spreadsheetId } = req.body as {
      startDate?: string;
      endDate?: string;
      spreadsheetId?: string;
    };

    if (!startDate || !endDate) {
      return next(new BadRequestError('startDate and endDate are required'));
    }

    const start = new Date(startDate);
    const end = new Date(endDate);

    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      return next(new BadRequestError('startDate and endDate must be valid ISO date strings'));
    }

    if (end < start) {
      return next(new BadRequestError('endDate must be after startDate'));
    }

    const result = await ExportService.exportOrdersToSheets({
      startDate: start,
      endDate: end,
      spreadsheetId,
    });

    res.status(200).json({
      success: true,
      message: `Export complete — ${result.rowsWritten} orders written`,
      data: result,
    });
  } catch (err) {
    next(err);
  }
}

// ============================================
// EXPORT CUSTOMERS
// ============================================

/**
 * POST /api/v1/admin/export/customers
 * Body: { spreadsheetId?: string }
 */
export async function exportCustomersToSheets(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { spreadsheetId } = req.body as { spreadsheetId?: string };

    const result = await ExportService.exportCustomersToSheets({ spreadsheetId });

    res.status(200).json({
      success: true,
      message: `Export complete — ${result.rowsWritten} customers written`,
      data: result,
    });
  } catch (err) {
    next(err);
  }
}

// ============================================
// EXPORT P&L
// ============================================

/**
 * POST /api/v1/admin/export/pnl
 * Body: { year: number; month: number; spreadsheetId?: string }
 */
export async function exportPnLToSheets(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { year, month, spreadsheetId } = req.body as {
      year?: number;
      month?: number;
      spreadsheetId?: string;
    };

    if (!year || !month) {
      return next(new BadRequestError('year and month are required'));
    }

    if (month < 1 || month > 12) {
      return next(new BadRequestError('month must be between 1 and 12'));
    }

    const result = await ExportService.exportPnLToSheets({
      year,
      month,
      spreadsheetId,
    });

    res.status(200).json({
      success: true,
      message: 'P&L export complete',
      data: result,
    });
  } catch (err) {
    next(err);
  }
}
