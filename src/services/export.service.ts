/**
 * ============================================
 * EXPORT SERVICE — Google Sheets
 * ============================================
 *
 * Exports orders, customer data, and P&L reports to Google Sheets.
 * Uses the google-spreadsheet package (already in dependencies).
 *
 * Env vars required:
 *   GOOGLE_SHEETS_CLIENT_EMAIL
 *   GOOGLE_SHEETS_PRIVATE_KEY
 *   GOOGLE_SHEETS_SPREADSHEET_ID
 *
 * @file src/services/export.service.ts
 */

import { GoogleSpreadsheet } from 'google-spreadsheet';
import { JWT } from 'google-auth-library';
import { Order } from '@models/Order.js';
import { User } from '@models/User.js';
import { DailySummary } from '@models/DailySummary.js';
import { Expense } from '@models/Expense.js';

// ============================================
// TYPES
// ============================================

export interface IExportResult {
  rowsWritten: number;
  sheetUrl: string;
}

export interface IExportOrdersOptions {
  startDate: Date;
  endDate: Date;
  spreadsheetId?: string;
}

export interface IExportCustomersOptions {
  spreadsheetId?: string;
}

export interface IExportPnLOptions {
  year: number;
  month: number; // 1-12
  spreadsheetId?: string;
}

// ============================================
// EXPORT SERVICE
// ============================================

export class ExportService {
  // ----------------------------------------
  // 6.5.1 Google Sheets Client Setup
  // ----------------------------------------

  /**
   * Initialise a JWT auth client using env vars.
   */
  static initSheetsClient(): JWT {
    const email = process.env.GOOGLE_SHEETS_CLIENT_EMAIL;
    const privateKey = process.env.GOOGLE_SHEETS_PRIVATE_KEY?.replace(/\\n/g, '\n');

    if (!email || !privateKey) {
      throw new Error('Google Sheets credentials not configured. Set GOOGLE_SHEETS_CLIENT_EMAIL and GOOGLE_SHEETS_PRIVATE_KEY.');
    }

    return new JWT({
      email,
      key: privateKey,
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });
  }

  /**
   * Get authenticated GoogleSpreadsheet instance.
   * Creates the target sheet tab if it doesn't exist.
   */
  static async getOrCreateSheet(
    spreadsheetId: string,
    sheetName: string,
    headerRow?: string[]
  ) {
    const auth = ExportService.initSheetsClient();
    const doc = new GoogleSpreadsheet(spreadsheetId, auth);
    await doc.loadInfo();

    let sheet = doc.sheetsByTitle[sheetName];
    if (!sheet) {
      sheet = await doc.addSheet({ title: sheetName });
      if (headerRow) {
        await sheet.setHeaderRow(headerRow);
      }
    }
    return { doc, sheet };
  }

  // ----------------------------------------
  // 6.5.2 Export Orders
  // ----------------------------------------

  /**
   * Export orders in a date range to a Google Sheet tab named `Orders_YYYY-MM`.
   */
  static async exportOrdersToSheets(
    options: IExportOrdersOptions
  ): Promise<IExportResult> {
    const { startDate, endDate } = options;
    const spreadsheetId =
      options.spreadsheetId ?? process.env.GOOGLE_SHEETS_SPREADSHEET_ID ?? '';

    if (!spreadsheetId) {
      throw new Error('Google Sheets spreadsheet ID not configured.');
    }

    // Build sheet tab name from start date
    const tabName = `Orders_${startDate.toISOString().substring(0, 7)}`;

    const headerRow = [
      'OrderNumber',
      'Date',
      'CustomerName',
      'Phone',
      'City',
      'Items',
      'Subtotal',
      'Discount',
      'Total',
      'PaymentMethod',
      'Status',
      'DeliveryType',
      'ETA',
    ];

    const { sheet } = await ExportService.getOrCreateSheet(
      spreadsheetId,
      tabName,
      headerRow
    );

    // Query orders
    const orders = await Order.find({
      createdAt: { $gte: startDate, $lte: endDate },
      status: { $ne: 'cancelled' },
    })
      .populate('userId', 'firstName lastName phone')
      .lean();

    if (orders.length === 0) {
      return { rowsWritten: 0, sheetUrl: `https://docs.google.com/spreadsheets/d/${spreadsheetId}` };
    }

    const rows = orders.map((o) => {
      const user = o.userId as { firstName?: string; lastName?: string; phone?: string } | null;
      const itemsSummary = o.items
        .map((i) => `${i.productName} ${i.variantSize} x${i.quantity}`)
        .join('; ');

      const row: Record<string, string | number> = {
        OrderNumber: String(o.orderNumber ?? ''),
        Date: o.createdAt ? (new Date(o.createdAt).toISOString().split('T')[0] ?? '') : '',
        CustomerName: user ? `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim() : 'Guest',
        Phone: String(user?.phone ?? (o.shippingAddress as { phone?: string } | undefined)?.phone ?? ''),
        City: String((o.shippingAddress as { city?: string } | undefined)?.city ?? ''),
        Items: itemsSummary,
        Subtotal: o.subtotal ?? 0,
        Discount: o.discount ?? 0,
        Total: o.total ?? 0,
        PaymentMethod: String(o.paymentMethod ?? ''),
        Status: String(o.status ?? ''),
        DeliveryType: String(o.deliveryType ?? ''),
        ETA: o.estimatedDelivery ? new Date(o.estimatedDelivery).toISOString() : '',
      };
      return row;
    });

    await sheet.addRows(rows);

    return {
      rowsWritten: rows.length,
      sheetUrl: `https://docs.google.com/spreadsheets/d/${spreadsheetId}`,
    };
  }

  // ----------------------------------------
  // Export Customers
  // ----------------------------------------

  /**
   * Export all customer accounts to `Customers` sheet tab.
   */
  static async exportCustomersToSheets(
    options: IExportCustomersOptions = {}
  ): Promise<IExportResult> {
    const spreadsheetId =
      options.spreadsheetId ?? process.env.GOOGLE_SHEETS_SPREADSHEET_ID ?? '';

    if (!spreadsheetId) {
      throw new Error('Google Sheets spreadsheet ID not configured.');
    }

    const headerRow = [
      'Email',
      'FirstName',
      'LastName',
      'Phone',
      'CreatedAt',
      'TotalOrders',
      'TotalSpent',
      'Segment',
      'LastOrderDate',
      'City',
    ];

    const { sheet } = await ExportService.getOrCreateSheet(
      spreadsheetId,
      'Customers',
      headerRow
    );

    const users = await User.find({ role: 'user', isActive: true })
      .select('email firstName lastName phone createdAt segment addresses')
      .lean();

    if (users.length === 0) {
      return { rowsWritten: 0, sheetUrl: `https://docs.google.com/spreadsheets/d/${spreadsheetId}` };
    }

    // Fetch order stats per user
    const rows = await Promise.all(
      users.map(async (u) => {
        const orders = await Order.find({
          userId: u._id,
          paymentStatus: 'paid',
        })
          .select('total createdAt')
          .sort({ createdAt: -1 })
          .lean();

        const totalOrders = orders.length;
        const totalSpent = orders.reduce((sum, o) => sum + (o.total ?? 0), 0);
        const lastOrderDate =
          orders[0]?.createdAt
            ? new Date(orders[0].createdAt).toISOString().split('T')[0] ?? ''
            : '';
        const city = u.addresses?.[0]?.city ?? '';

        const custRow: Record<string, string | number> = {
          Email: String(u.email ?? ''),
          FirstName: String(u.firstName ?? ''),
          LastName: String(u.lastName ?? ''),
          Phone: String(u.phone ?? ''),
          CreatedAt: u.createdAt ? (new Date(u.createdAt as Date).toISOString().split('T')[0] ?? '') : '',
          TotalOrders: totalOrders,
          TotalSpent: totalSpent,
          Segment: String(u.segment ?? 'new'),
          LastOrderDate: String(lastOrderDate ?? ''),
          City: String(city ?? ''),
        };
        return custRow;
      })
    );

    await sheet.addRows(rows);

    return {
      rowsWritten: rows.length,
      sheetUrl: `https://docs.google.com/spreadsheets/d/${spreadsheetId}`,
    };
  }

  // ----------------------------------------
  // Export P&L
  // ----------------------------------------

  /**
   * Export monthly P&L breakdown to `PnL_YYYY-MM` sheet tab.
   */
  static async exportPnLToSheets(options: IExportPnLOptions): Promise<{ sheetUrl: string }> {
    const { year, month } = options;
    const spreadsheetId =
      options.spreadsheetId ?? process.env.GOOGLE_SHEETS_SPREADSHEET_ID ?? '';

    if (!spreadsheetId) {
      throw new Error('Google Sheets spreadsheet ID not configured.');
    }

    const monthStr = String(month).padStart(2, '0');
    const tabName = `PnL_${year}-${monthStr}`;

    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0, 23, 59, 59); // last day of month

    const headerRow = ['Metric', 'Value (NGN)'];
    const { sheet } = await ExportService.getOrCreateSheet(
      spreadsheetId,
      tabName,
      headerRow
    );

    // Aggregate DailySummaries for the month
    const summaries = await DailySummary.find({
      date: { $gte: startDate, $lte: endDate },
    }).lean();

    const totalGrossRevenue = summaries.reduce((s, d) => s + d.grossRevenue, 0);
    const totalDiscounts = summaries.reduce((s, d) => s + d.discountsGiven, 0);
    const totalNetRevenue = summaries.reduce((s, d) => s + d.netRevenue, 0);
    const totalCOGS = summaries.reduce((s, d) => s + d.costOfGoodsSold, 0);
    const totalGrossProfit = totalNetRevenue - totalCOGS;
    const totalDelivery = summaries.reduce((s, d) => s + d.deliveryFeesCollected, 0);
    const totalOrders = summaries.reduce((s, d) => s + d.totalOrders, 0);

    // Expenses for the month
    const expenses = await Expense.find({
      expenseDate: { $gte: startDate, $lte: endDate },
    }).lean();

    const totalExpenses = expenses.reduce((s, e) => s + e.amount, 0);
    const expenseByCategory: Record<string, number> = {};
    for (const e of expenses) {
      expenseByCategory[e.category] = (expenseByCategory[e.category] ?? 0) + e.amount;
    }

    const netProfit = totalGrossProfit - totalExpenses;
    const netProfitMargin =
      totalNetRevenue > 0 ? (netProfit / totalNetRevenue) * 100 : 0;
    const grossProfitMargin =
      totalNetRevenue > 0 ? (totalGrossProfit / totalNetRevenue) * 100 : 0;

    const rows = [
      { Metric: '=== REVENUE ===', 'Value (NGN)': '' },
      { Metric: 'Gross Revenue', 'Value (NGN)': totalGrossRevenue },
      { Metric: 'Discounts Given', 'Value (NGN)': -totalDiscounts },
      { Metric: 'Delivery Fees Collected', 'Value (NGN)': totalDelivery },
      { Metric: 'Net Revenue', 'Value (NGN)': totalNetRevenue },
      { Metric: 'Total Orders', 'Value (NGN)': totalOrders },
      { Metric: '', 'Value (NGN)': '' },
      { Metric: '=== COST OF GOODS ===', 'Value (NGN)': '' },
      { Metric: 'Cost of Goods Sold', 'Value (NGN)': -totalCOGS },
      { Metric: 'Gross Profit', 'Value (NGN)': totalGrossProfit },
      { Metric: 'Gross Profit Margin', 'Value (NGN)': `${grossProfitMargin.toFixed(2)}%` },
      { Metric: '', 'Value (NGN)': '' },
      { Metric: '=== EXPENSES ===', 'Value (NGN)': '' },
      ...Object.entries(expenseByCategory).map(([cat, amt]) => ({
        Metric: `  ${cat}`,
        'Value (NGN)': -amt,
      })),
      { Metric: 'Total Expenses', 'Value (NGN)': -totalExpenses },
      { Metric: '', 'Value (NGN)': '' },
      { Metric: '=== NET PROFIT ===', 'Value (NGN)': '' },
      { Metric: 'Net Profit', 'Value (NGN)': netProfit },
      { Metric: 'Net Profit Margin', 'Value (NGN)': `${netProfitMargin.toFixed(2)}%` },
    ];

    await sheet.addRows(rows);

    return {
      sheetUrl: `https://docs.google.com/spreadsheets/d/${spreadsheetId}`,
    };
  }
}
